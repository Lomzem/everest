import { tick } from 'svelte';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import type { MenuCommand } from '$lib/desktop-api';
import {
	openDocument,
	quitApplication,
	saveDocument,
	shouldIgnoreUnavailable,
	syncWindowState,
} from '$lib/effect/document-commands';
import {
	RdlParseFailed,
	rdlParseFailureFromUnknown,
	subscribeMenuCommand,
} from '$lib/effect/desktop';
import { effectErrorMessage, runAppEffect } from '$lib/effect/run';
import {
	accessOptions,
	bitColors,
	createBlankDocument,
	type EnumValue,
	type Field,
	type RdlDocument,
	type Register,
} from '$lib/rdl/model';
import {
	addrmapLabel,
	basename,
	buildFolderChildren,
	buildGroupCrumbs,
	buildHierarchyDndItems,
	buildHierarchyChildren,
	emptyRegister,
	groupForPath,
	groupIdsForPath,
	parentGroupPath,
	groupsForRegisters,
	registerByteWidth,
	rootBlockId,
	type AppView,
	type HierarchyDndItem,
	type SelectionKind,
} from '$lib/rdl/hierarchy';
import { deriveIdentifier, fieldBitWidth, parseEditableValue, range } from '$lib/rdl/format';
import {
	sortFieldEnumValues,
	sortRegisterFields,
	sortRegistersByAddress,
	updateEnumValue as updateEnumValueInRegisters,
	updateField as updateFieldInRegisters,
	updateRegister as updateRegisterInRegisters,
} from '$lib/rdl/mutations';
import { normalizeRdlDocument } from '$lib/rdl/normalize';
import { searchRegisters } from '$lib/rdl/search';
import { diagnostics } from './diagnostics.svelte';
import { ui } from './ui.svelte';
import {
	readPersistedEditorSession,
	writePersistedEditorSession,
	type HistoryEntry,
	type SelectionSnapshot,
} from './session-persistence';

export { accessOptions };

const newRegisterIdPrefix = 'new-register-';
const newFieldIdPrefix = 'field-';

type DestructiveAction = 'new' | 'open' | 'quit';

export class EditorState {
	appView = $state<AppView>('welcome');
	document = $state<RdlDocument>(createBlankDocument());
	currentPath = $state('');
	dirty = $state(false);
	pendingDestructiveAction = $state<DestructiveAction>();
	selectedKind = $state<SelectionKind>('folder');
	selectedRegisterId = $state('');
	selectedGroupPath = $state('');
	selectedFieldId = $state('');
	parseError = $state<RdlParseFailed>();
	parseErrorDialogOpen = $state(false);
	undoStack = $state<HistoryEntry[]>([]);
	redoStack = $state<HistoryEntry[]>([]);
	private groupedEdit: GroupedEdit | undefined;

	addrmapLabel = $derived(addrmapLabel(this.document));
	documentLabel = $derived(this.currentPath ? basename(this.currentPath) : this.document.title);
	selectedRegister = $derived(
		this.document.registers.find((register) => register.id === this.selectedRegisterId) ??
			this.document.registers[0] ??
			emptyRegister,
	);
	selectedField = $derived(
		this.selectedRegister.fields.find((field) => field.id === this.selectedFieldId) ??
			this.selectedRegister.fields[0],
	);
	selectedFolder = $derived(
		groupForPath(this.selectedGroupPath, this.document.hierarchyGroups, this.addrmapLabel),
	);
	searchActive = $derived(Boolean(ui.searchText.trim()));
	searchResults = $derived.by(() => searchRegisters(this.document.registers, ui.searchText));
	searchResultByRegisterId = $derived.by(
		() => new SvelteMap(this.searchResults.map((result) => [result.registerId, result])),
	);
	filteredRegisters = $derived.by(() =>
		this.searchActive
			? this.searchResults.map((result) => result.register)
			: this.document.registers,
	);
	visibleHierarchyGroups = $derived.by(() =>
		this.searchActive
			? groupsForRegisters(this.document.hierarchyGroups, this.filteredRegisters)
			: this.document.hierarchyGroups,
	);
	selectedGroupCrumbs = $derived(
		buildGroupCrumbs(
			this.selectedKind === 'folder' ? this.selectedGroupPath : this.selectedRegister.group,
			this.document.hierarchyGroups,
		),
	);
	selectedFolderChildren = $derived(
		this.selectedFolder
			? buildFolderChildren(
					this.selectedFolder.path,
					this.document.hierarchyGroups,
					this.document.registers,
				)
			: [],
	);
	canUndo = $derived(this.undoStack.length > 0);
	canRedo = $derived(this.redoStack.length > 0);

	folderChildren(groupPath: string) {
		return buildHierarchyChildren(groupPath, this.visibleHierarchyGroups, this.filteredRegisters);
	}

	hierarchyDndItems(groupPath: string) {
		return (
			ui.hierarchyDragPreview[groupPath] ??
			buildHierarchyDndItems(groupPath, this.document.hierarchyGroups, this.document.registers)
		);
	}

	hierarchyGroupForPath(groupPath: string) {
		return groupForPath(groupPath, this.document.hierarchyGroups, this.addrmapLabel);
	}

	searchResultForRegister(registerId: string) {
		return this.searchResultByRegisterId.get(registerId);
	}

	currentDocument() {
		return this.document;
	}

	applyDocument(document: RdlDocument, path: string, nextDirty: boolean) {
		this.document = normalizeRdlDocument(document);
		this.currentPath = path;
		this.clearHistory();
		this.selectedRegisterId = '';
		this.selectedKind = 'folder';
		this.selectedGroupPath = '';
		this.selectedFieldId = '';
		this.appView = 'editor';
		ui.resetForDocument();
		this.setDirty(nextDirty);
	}

	private needsDiscardConfirmation() {
		return this.appView === 'editor' && this.dirty;
	}

	private requestDestructiveAction(action: DestructiveAction) {
		if (!this.needsDiscardConfirmation()) return false;
		this.pendingDestructiveAction = action;
		return true;
	}

	cancelPendingDestructiveAction() {
		this.pendingDestructiveAction = undefined;
	}

	async confirmPendingDestructiveAction() {
		const action = this.pendingDestructiveAction;
		this.pendingDestructiveAction = undefined;
		if (action === 'new') {
			this.newDocument();
			return;
		}
		if (action === 'open') {
			await this.openDocument();
			return;
		}
		if (action === 'quit') {
			await this.quitApplication();
		}
	}

	setDirty(nextDirty: boolean) {
		this.dirty = nextDirty;
		this.persistSession();
		void this.syncWindowState();
	}

	clearHistory() {
		this.undoStack = [];
		this.redoStack = [];
		this.groupedEdit = undefined;
	}

	beginGroupedDocumentEdit() {
		if (this.groupedEdit) return;
		this.groupedEdit = {
			documentBefore: this.document,
			selectionBefore: this.selectionSnapshot(),
			dirtyBefore: this.dirty,
		};
	}

	endGroupedDocumentEdit() {
		const groupedEdit = this.groupedEdit;
		if (!groupedEdit) return;
		this.groupedEdit = undefined;
		if (groupedEdit.documentBefore === this.document) return;
		this.pushHistory({
			documentBefore: groupedEdit.documentBefore,
			documentAfter: this.document,
			selectionBefore: groupedEdit.selectionBefore,
			selectionAfter: this.selectionSnapshot(),
			dirtyBefore: groupedEdit.dirtyBefore,
			dirtyAfter: this.dirty,
		});
	}

	undo() {
		if (!this.canUndo) return;
		this.endGroupedDocumentEdit();
		const entry = this.undoStack.at(-1);
		if (!entry) return;
		this.undoStack = this.undoStack.slice(0, -1);
		this.redoStack = [...this.redoStack, entry];
		this.restoreHistoryState(entry.documentBefore, entry.selectionBefore, entry.dirtyBefore);
	}

	redo() {
		if (!this.canRedo) return;
		this.endGroupedDocumentEdit();
		const entry = this.redoStack.at(-1);
		if (!entry) return;
		this.redoStack = this.redoStack.slice(0, -1);
		this.undoStack = [...this.undoStack, entry];
		this.restoreHistoryState(entry.documentAfter, entry.selectionAfter, entry.dirtyAfter);
	}

	markDirty() {
		if (!this.dirty) this.setDirty(true);
	}

	private commitDocumentChange(document: RdlDocument) {
		if (document === this.document) return false;
		const before = this.document;
		const selectionBefore = this.selectionSnapshot();
		const dirtyBefore = this.dirty;
		this.document = normalizeRdlDocument(document);
		this.markDirty();
		if (!this.groupedEdit) {
			this.pushHistory({
				documentBefore: before,
				documentAfter: this.document,
				selectionBefore,
				selectionAfter: this.selectionSnapshot(),
				dirtyBefore,
				dirtyAfter: this.dirty,
			});
		}
		return true;
	}

	private pushHistory(entry: HistoryEntry) {
		this.undoStack = [...this.undoStack, entry];
		this.redoStack = [];
		this.persistSession();
	}

	private restoreHistoryState(
		document: RdlDocument,
		selection: SelectionSnapshot,
		nextDirty: boolean,
	) {
		this.document = normalizeRdlDocument(document);
		this.selectedKind = selection.selectedKind;
		this.selectedRegisterId = selection.selectedRegisterId;
		this.selectedGroupPath = selection.selectedGroupPath;
		this.selectedFieldId = selection.selectedFieldId;
		this.repairSelection();
		this.revealRestoredSelection();
		this.setDirty(nextDirty);
		this.persistSession();
	}

	private selectionSnapshot(): SelectionSnapshot {
		return {
			selectedKind: this.selectedKind,
			selectedRegisterId: this.selectedRegisterId,
			selectedGroupPath: this.selectedGroupPath,
			selectedFieldId: this.selectedFieldId,
		};
	}

	private persistSession() {
		writePersistedEditorSession({
			appView: this.appView,
			document: this.document,
			currentPath: this.currentPath,
			dirty: this.dirty,
			selection: this.selectionSnapshot(),
			undoStack: this.undoStack,
			redoStack: this.redoStack,
		});
	}

	private repairSelection() {
		if (this.selectedKind === 'register') {
			const register = this.document.registers.find((item) => item.id === this.selectedRegisterId);
			if (register) {
				this.selectedGroupPath = register.group;
				if (!register.fields.some((field) => field.id === this.selectedFieldId)) {
					this.selectedFieldId = register.fields[0]?.id ?? '';
				}
				ui.setExpandedFieldsFor(register);
				return;
			}
		}

		const group = groupForPath(
			this.selectedGroupPath,
			this.document.hierarchyGroups,
			this.addrmapLabel,
		);
		if (this.selectedKind === 'folder' && group) {
			this.selectedRegisterId = '';
			this.selectedFieldId = '';
			ui.expandedFieldIds = new SvelteSet();
			return;
		}

		this.selectFirstAvailable();
	}

	private revealRestoredSelection() {
		if (this.selectedKind === 'register') {
			this.revealGroupPath(this.selectedRegister.group);
			return;
		}
		this.revealGroupPath(this.selectedGroupPath);
	}

	async syncWindowState() {
		const title =
			this.appView === 'welcome'
				? 'Everest'
				: `${this.dirty ? '* ' : ''}${this.documentLabel || 'Untitled'} - Everest`;
		await runAppEffect(syncWindowState({ dirty: this.dirty, title }));
	}

	restorePersistedSession() {
		const session = readPersistedEditorSession();
		if (!session || session.appView !== 'editor') return false;

		this.document = normalizeRdlDocument(session.document);
		this.currentPath = session.currentPath;
		this.dirty = session.dirty;
		this.undoStack = session.undoStack;
		this.redoStack = session.redoStack;
		this.groupedEdit = undefined;
		this.selectedKind = session.selection.selectedKind;
		this.selectedRegisterId = session.selection.selectedRegisterId;
		this.selectedGroupPath = session.selection.selectedGroupPath;
		this.selectedFieldId = session.selection.selectedFieldId;
		this.appView = 'editor';
		ui.resetForDocument();
		this.repairSelection();
		this.revealRestoredSelection();
		void this.syncWindowState();
		return true;
	}

	requestNewDocument() {
		if (this.requestDestructiveAction('new')) return;
		this.newDocument();
	}

	requestOpenDocument() {
		if (this.requestDestructiveAction('open')) return;
		void this.openDocument();
	}

	requestQuitApplication() {
		if (this.requestDestructiveAction('quit')) return;
		void this.quitApplication();
	}

	newDocument() {
		this.applyDocument(createBlankDocument(), '', false);
	}

	async openDocument() {
		try {
			const result = await runAppEffect(openDocument());
			if (!result) return;
			this.applyDocument(result.document, result.path, false);
		} catch (error) {
			const parseError = rdlParseFailureFromUnknown(error);
			if (parseError) {
				await this.showParseError(parseError);
				return;
			}
			if (shouldIgnoreUnavailable(error)) return;
			this.alertError(error);
		}
	}

	closeParseError() {
		this.parseErrorDialogOpen = false;
		this.parseError = undefined;
	}

	async showParseError(error: RdlParseFailed) {
		this.parseError = error;
		this.parseErrorDialogOpen = true;
		await diagnostics.recordError('editor.rdlParse', error);
	}

	async showParseErrorDiagnostics() {
		this.closeParseError();
		await diagnostics.showLogs();
	}

	async saveDocument(saveAs: boolean) {
		if (this.appView !== 'editor') return;
		try {
			const result = await runAppEffect(
				saveDocument({
					document: this.currentDocument(),
					currentPath: this.currentPath,
					saveAs,
					suggestedPath: `${this.document.addrmapName}.rdl`,
				}),
			);
			if (!result.saved) return;
			this.currentPath = result.path;
			this.setDirty(false);
		} catch (error) {
			if (shouldIgnoreUnavailable(error)) return;
			this.alertError(error);
		}
	}

	async quitApplication() {
		await runAppEffect(quitApplication());
	}

	async handleMenuCommand(command: MenuCommand) {
		if (command === 'new') {
			this.requestNewDocument();
			return;
		}
		if (command === 'open') {
			this.requestOpenDocument();
			return;
		}
		if (command === 'save') {
			await this.saveDocument(false);
			return;
		}
		if (command === 'save-as') {
			await this.saveDocument(true);
			return;
		}
		this.requestQuitApplication();
	}

	subscribeMenuCommands() {
		return subscribeMenuCommand((command) => {
			void this.handleMenuCommand(command as MenuCommand);
		});
	}

	alertError(error: unknown) {
		void diagnostics.recordError('editor.error', error);
		globalThis.window.alert(effectErrorMessage(error));
	}

	revealDocumentRoot() {
		ui.revealHierarchy();
		this.selectGroup('');
	}

	revealGroupPath(groupPath: string) {
		ui.revealHierarchy(groupIdsForPath(groupPath, this.document.hierarchyGroups));
	}

	revealSelectedRegister() {
		if (!this.selectedRegister.id) return;
		this.revealGroupPath(this.selectedRegister.group);
		globalThis.document
			.querySelector<HTMLElement>('[data-register-editor]')
			?.scrollIntoView({ block: 'start' });
	}

	selectRegister(id: string) {
		this.selectedRegisterId = id;
		this.selectedKind = 'register';
		const next = this.document.registers.find((register) => register.id === id);
		this.selectedGroupPath = next?.group ?? this.selectedGroupPath;
		this.selectedFieldId = next?.fields[0]?.id ?? '';
		if (next) {
			ui.expandHierarchy(groupIdsForPath(next.group, this.document.hierarchyGroups));
		}
		ui.setExpandedFieldsFor(next);
		this.persistSession();
	}

	selectGroup(groupPath: string) {
		this.selectedKind = 'folder';
		this.selectedGroupPath = groupPath;
		this.selectedFieldId = '';
		ui.expandHierarchy(groupIdsForPath(groupPath, this.document.hierarchyGroups));
		ui.expandedFieldIds = new SvelteSet();
		this.persistSession();
	}

	selectFirstAvailable(
		nextRegisters = this.document.registers,
		nextGroups = this.document.hierarchyGroups,
	) {
		const nextRegister = nextRegisters[0];
		if (nextRegister) {
			this.selectRegister(nextRegister.id);
			return;
		}

		this.selectedKind = 'folder';
		this.selectedRegisterId = '';
		this.selectedFieldId = '';
		this.selectedGroupPath = nextGroups[0]?.path ?? '';
		ui.expandedFieldIds = new SvelteSet();
		this.persistSession();
	}

	toggleField(fieldId: string) {
		this.selectedFieldId = fieldId;
		ui.toggleField(fieldId);
		this.persistSession();
	}

	previewHierarchyDrop(groupPath: string, items: HierarchyDndItem[]) {
		ui.previewHierarchyDrag(groupPath, items);
	}

	finalizeHierarchyDrop(groupPath: string, items: HierarchyDndItem[], itemId: string) {
		ui.previewHierarchyDrag(groupPath, items);
		if (!items.some((item) => item.id === itemId)) return;

		this.moveHierarchyItemToGroup(itemId, groupPath);
		ui.finishHierarchyDrag();
	}

	moveHierarchyItemToGroup(itemId: string, groupPath: string) {
		if (itemId.startsWith('register:')) {
			this.moveRegisterToGroup(itemId.slice('register:'.length), groupPath);
			return;
		}

		if (itemId.startsWith('folder:')) {
			this.moveGroupToGroup(itemId.slice('folder:'.length), groupPath);
		}
	}

	moveRegisterToGroup(
		registerId: string,
		groupPath: string,
		targetRegisterId = '',
		position: 'before' | 'after' = 'after',
	) {
		const moving = this.document.registers.find((register) => register.id === registerId);
		if (!moving || moving.id === targetRegisterId) return;
		if (!targetRegisterId && moving.group === groupPath) return;

		if (!targetRegisterId) {
			this.commitDocumentChange({
				...this.document,
				registers: this.document.registers.map((register) =>
					register.id === registerId ? { ...register, group: groupPath } : register,
				),
			});

			if (this.selectedKind === 'register' && this.selectedRegisterId === registerId) {
				this.selectedGroupPath = groupPath;
				this.revealGroupPath(groupPath);
			}
			return;
		}

		const nextRegister = { ...moving, group: groupPath };
		const remaining = this.document.registers.filter((register) => register.id !== registerId);
		const targetIndex = targetRegisterId
			? remaining.findIndex((register) => register.id === targetRegisterId)
			: -1;

		const nextRegisters =
			targetIndex === -1
				? [...remaining, nextRegister]
				: [
						...remaining.slice(0, position === 'before' ? targetIndex : targetIndex + 1),
						nextRegister,
						...remaining.slice(position === 'before' ? targetIndex : targetIndex + 1),
					];
		this.commitDocumentChange({ ...this.document, registers: nextRegisters });

		if (this.selectedKind === 'register' && this.selectedRegisterId === registerId) {
			this.selectedGroupPath = groupPath;
		}
	}

	canMoveGroupToGroup(groupId: string, destinationPath: string) {
		const moving = this.document.hierarchyGroups.find((group) => group.id === groupId);
		if (!moving) return false;
		if (destinationPath === moving.path || destinationPath.startsWith(`${moving.path}/`)) {
			return false;
		}

		const currentParentPath = parentGroupPath(moving.path);
		if (currentParentPath === destinationPath) return false;

		const nextPath = destinationPath ? `${destinationPath}/${moving.label}` : moving.label;
		return !this.document.hierarchyGroups.some(
			(group) => group.id !== groupId && group.path === nextPath,
		);
	}

	moveGroupToGroup(groupId: string, destinationPath: string) {
		if (!this.canMoveGroupToGroup(groupId, destinationPath)) return;

		const moving = this.document.hierarchyGroups.find((group) => group.id === groupId);
		if (!moving) return;

		const previousPath = moving.path;
		const nextPath = destinationPath ? `${destinationPath}/${moving.label}` : moving.label;
		const selectedRegisterGroupBefore = this.selectedRegister.group;
		const rewritePath = (path: string) =>
			path === previousPath || path.startsWith(`${previousPath}/`)
				? `${nextPath}${path.slice(previousPath.length)}`
				: path;

		this.commitDocumentChange({
			...this.document,
			hierarchyGroups: this.document.hierarchyGroups.map((group) =>
				group.path === previousPath || group.path.startsWith(`${previousPath}/`)
					? { ...group, path: rewritePath(group.path) }
					: group,
			),
			registers: this.document.registers.map((register) =>
				register.group === previousPath || register.group.startsWith(`${previousPath}/`)
					? { ...register, group: rewritePath(register.group) }
					: register,
			),
		});

		if (
			this.selectedKind === 'folder' &&
			(this.selectedGroupPath === previousPath ||
				this.selectedGroupPath.startsWith(`${previousPath}/`))
		) {
			this.selectedGroupPath = rewritePath(this.selectedGroupPath);
		}
		if (
			this.selectedKind === 'register' &&
			(selectedRegisterGroupBefore === previousPath ||
				selectedRegisterGroupBefore.startsWith(`${previousPath}/`))
		) {
			this.selectedGroupPath = rewritePath(selectedRegisterGroupBefore);
		}
		this.revealGroupPath(destinationPath);
	}

	currentGroupPathForMove(kind: SelectionKind, id: string) {
		if (kind === 'register') {
			return this.document.registers.find((register) => register.id === id)?.group ?? '';
		}

		const group = this.document.hierarchyGroups.find((item) => item.id === id);
		return group ? parentGroupPath(group.path) : '';
	}

	moveTargetDisabled(kind: SelectionKind, id: string, destinationPath: string) {
		if (kind === 'register') {
			return this.currentGroupPathForMove(kind, id) === destinationPath;
		}

		return !this.canMoveGroupToGroup(id, destinationPath);
	}

	async addSubdir(parentPath = '') {
		const nextIndex = this.document.hierarchyGroups.length;
		const label = `New Group ${nextIndex}`;
		const next = {
			id: `group-${Date.now()}`,
			label,
			path: parentPath ? `${parentPath}/${label}` : label,
		};

		this.commitDocumentChange({
			...this.document,
			hierarchyGroups: [...this.document.hierarchyGroups, next],
		});
		ui.expandedBlocks = new SvelteSet([...ui.expandedBlocks, next.id]);
		ui.renamingGroupId = next.id;
		this.selectGroup(next.path);

		await tick();
		focusAndSelect(`[data-group-name-input="${next.id}"]`);
	}

	async startRenameGroup(groupId: string) {
		ui.renamingGroupId = groupId;
		await tick();
		focusAndSelect(`[data-group-name-input="${groupId}"]`);
	}

	finishRenameGroup() {
		ui.renamingGroupId = '';
	}

	deleteGroup(groupId: string) {
		const group = this.document.hierarchyGroups.find((item) => item.id === groupId);
		if (!group) return;

		const nextGroups = this.document.hierarchyGroups.filter((item) => item.id !== groupId);
		const nextRegisters = this.document.registers.filter(
			(register) => register.group !== group.path && !register.group.startsWith(`${group.path}/`),
		);
		const selectedFolderDeleted =
			this.selectedKind === 'folder' &&
			(this.selectedGroupPath === group.path ||
				this.selectedGroupPath.startsWith(`${group.path}/`));

		this.commitDocumentChange({
			...this.document,
			hierarchyGroups: nextGroups,
			registers: nextRegisters,
		});
		ui.expandedBlocks = new SvelteSet([...ui.expandedBlocks].filter((id) => id !== groupId));

		if (
			selectedFolderDeleted ||
			(this.selectedKind === 'register' &&
				!nextRegisters.some((register) => register.id === this.selectedRegisterId))
		) {
			this.selectFirstAvailable(nextRegisters, nextGroups);
		}
	}

	updateGroupLabel(groupId: string, label: string) {
		if (groupId === rootBlockId) {
			this.updateAddrmapName(label);
			return;
		}
		const group = this.document.hierarchyGroups.find((item) => item.id === groupId);
		if (!group) return;

		const previousPath = group.path;
		const parentPath = previousPath.includes('/')
			? previousPath.split('/').slice(0, -1).join('/')
			: '';
		const nextPath = parentPath ? `${parentPath}/${label}` : label;
		const hierarchyGroups = this.document.hierarchyGroups.map((item) =>
			item.id === groupId ? { ...item, label, path: nextPath } : item,
		);
		const registers = this.document.registers.map((register) =>
			register.group.startsWith(previousPath)
				? { ...register, group: `${nextPath}${register.group.slice(previousPath.length)}` }
				: register,
		);
		this.commitDocumentChange({ ...this.document, hierarchyGroups, registers });
		if (
			this.selectedGroupPath === previousPath ||
			this.selectedGroupPath.startsWith(`${previousPath}/`)
		) {
			this.selectedGroupPath = `${nextPath}${this.selectedGroupPath.slice(previousPath.length)}`;
		}
	}

	updateAddrmapName(addrmapName: string) {
		this.commitDocumentChange({ ...this.document, addrmapName });
	}

	async addRegister(
		groupPath = this.selectedKind === 'folder'
			? this.selectedGroupPath
			: this.selectedRegister.group,
		address = this.nextRegisterAddress(),
	) {
		const destinationGroup = this.document.hierarchyGroups.find(
			(group) => group.path === groupPath,
		);
		const next: Register = {
			id: `${newRegisterIdPrefix}${Date.now()}`,
			name: '',
			title: '',
			desc: '',
			address,
			width: this.selectedRegister.width || 8,
			group: groupPath,
			sw: 'RW',
			hw: 'RW',
			fields: [],
		};

		this.commitDocumentChange({
			...this.document,
			registers: sortRegistersByAddress([...this.document.registers, next]),
		});
		this.selectedRegisterId = next.id;
		this.selectedKind = 'register';
		this.selectedGroupPath = groupPath;
		this.selectedFieldId = '';
		ui.setExpandedFieldsFor(next);
		ui.expandedBlocks = new SvelteSet([
			...ui.expandedBlocks,
			rootBlockId,
			...(destinationGroup ? [destinationGroup.id] : []),
		]);

		await tick();
		focusAndSelect(`[data-register-title-input="${next.id}"]`);
		this.persistSession();
	}

	private nextRegisterAddress() {
		return this.document.registers.length
			? Math.max(...this.document.registers.map((register) => register.address)) +
					registerByteWidth(this.selectedRegister.width || 8)
			: 0;
	}

	deleteRegister(registerId: string) {
		const deletingIndex = this.document.registers.findIndex(
			(register) => register.id === registerId,
		);
		if (deletingIndex === -1) return;

		const nextRegisters = this.document.registers.filter((register) => register.id !== registerId);
		this.commitDocumentChange({ ...this.document, registers: nextRegisters });

		if (this.selectedKind !== 'register' || this.selectedRegisterId !== registerId) return;

		const nextSelected = nextRegisters[Math.min(deletingIndex, nextRegisters.length - 1)];
		if (nextSelected) {
			this.selectRegister(nextSelected.id);
			return;
		}
		this.selectFirstAvailable(nextRegisters);
	}

	async startRenameRegister(registerId: string) {
		this.selectRegister(registerId);
		await tick();
		focusAndSelect(`[data-register-name-input="${registerId}"]`);
	}

	async addField() {
		if (!this.selectedRegister.id) return;

		const occupied = new SvelteSet(
			this.selectedRegister.fields.flatMap((field) => range(field.lsb, field.msb)),
		);
		const bit =
			range(0, this.selectedRegister.width - 1).find((candidate) => !occupied.has(candidate)) ?? 0;
		const next: Field = {
			id: `field-${Date.now()}`,
			name: '',
			title: '',
			desc: '',
			msb: bit,
			lsb: bit,
			reset: 0,
			sw: 'RW',
			hw: 'RW',
			enumName: '',
			values: [],
			color: bitColors[this.selectedRegister.fields.length % bitColors.length],
		};

		this.commitDocumentChange({
			...this.document,
			registers: this.document.registers.map((register) =>
				register.id === this.selectedRegister.id
					? { ...register, fields: sortRegisterFields([...register.fields, next]) }
					: register,
			),
		});
		this.selectedFieldId = next.id;
		ui.expandedFieldIds = new SvelteSet([...ui.expandedFieldIds, next.id]);

		await tick();
		focusAndSelect(`[data-field-name-input="${next.id}"]`);
	}

	removeField(fieldId: string) {
		const remaining = this.selectedRegister.fields.filter((field) => field.id !== fieldId);
		this.commitDocumentChange({
			...this.document,
			registers: this.document.registers.map((register) =>
				register.id === this.selectedRegister.id
					? { ...register, fields: sortRegisterFields(remaining) }
					: register,
			),
		});
		this.selectedFieldId = remaining[0]?.id ?? '';
		ui.expandedFieldIds = new SvelteSet([...ui.expandedFieldIds].filter((id) => id !== fieldId));
	}

	updateSelectedRegister(changes: Partial<Register>) {
		const nextChanges = this.registerChangesWithDerivedName(changes);
		this.commitDocumentChange({
			...this.document,
			registers: sortRegistersByAddress(
				updateRegisterInRegisters(this.document.registers, this.selectedRegister.id, nextChanges),
			),
		});
	}

	updateField(fieldId: string, changes: Partial<Field>) {
		const nextChanges = this.fieldChangesWithDerivedName(fieldId, changes);
		this.commitDocumentChange({
			...this.document,
			registers: updateFieldInRegisters(
				this.document.registers,
				this.selectedRegister.id,
				fieldId,
				nextChanges,
			),
		});
	}

	updateResetDraft(fieldId: string, rawValue: string) {
		ui.updateNumericDraft(`reset:${fieldId}`, rawValue);
		if (rawValue.trim()) {
			const reset = parseEditableValue(rawValue, ui.valueMode);
			const field = this.selectedRegister.fields.find((item) => item.id === fieldId);
			const resetEnumValueId = field?.values.find((value) => value.value === reset)?.id;
			this.updateField(fieldId, {
				reset,
				resetEnumValueId,
			});
		}
	}

	commitResetDraft(fieldId: string) {
		const key = `reset:${fieldId}`;
		if (key in ui.numericDrafts && !ui.numericDrafts[key].trim()) {
			this.updateField(fieldId, { reset: 0, resetEnumValueId: undefined });
		}
		ui.clearNumericDraft(key);
	}

	updateResetEnumValue(fieldId: string, enumValueId: string) {
		const field = this.selectedRegister.fields.find((item) => item.id === fieldId);
		const enumValue = field?.values.find((value) => value.id === enumValueId);
		if (!enumValue) return;
		ui.clearNumericDraft(`reset:${fieldId}`);
		this.updateField(fieldId, { reset: enumValue.value, resetEnumValueId: enumValue.id });
	}

	async addEnumValueForReset(fieldId: string) {
		const field = this.selectedRegister.fields.find((item) => item.id === fieldId);
		if (!field) return;

		const nextId = `enum-${Date.now()}`;
		const nextValue = field.reset;
		this.commitDocumentChange({
			...this.document,
			registers: this.document.registers.map((register) => {
				if (register.id !== this.selectedRegister.id) return register;
				return {
					...register,
					fields: register.fields.map((field) => {
						if (field.id !== fieldId) return field;
						return {
							...field,
							enumName: field.enumName || `${field.name}_e`,
							resetEnumValueId: nextId,
							values: [
								...field.values,
								{
									id: nextId,
									name: `VALUE_${nextValue}`,
									value: nextValue,
									desc: '',
								},
							],
						};
					}),
				};
			}),
		});
		ui.clearNumericDraft(`reset:${fieldId}`);

		await tick();
		focusAndSelect(`[data-enum-variant-name-input="${fieldId}:${nextId}"]`);
	}

	clearResetEnumValue(fieldId: string) {
		this.updateField(fieldId, { resetEnumValueId: undefined });
	}

	updateEnumValue(fieldId: string, enumValueId: string, changes: Partial<EnumValue>) {
		const field = this.selectedRegister.fields.find((item) => item.id === fieldId);
		const fieldChanges =
			field?.resetEnumValueId === enumValueId && changes.value !== undefined
				? { reset: changes.value }
				: {};
		this.commitDocumentChange({
			...this.document,
			registers: updateEnumValueInRegisters(
				this.document.registers,
				this.selectedRegister.id,
				fieldId,
				enumValueId,
				changes,
				fieldChanges,
			),
		});
	}

	updateEnumNumericValue(fieldId: string, enumValueId: string, rawValue: string) {
		ui.updateNumericDraft(`enum:${fieldId}:${enumValueId}`, rawValue);
		if (rawValue.trim()) {
			this.updateEnumValue(fieldId, enumValueId, {
				value: parseEditableValue(rawValue, ui.valueMode),
			});
		}
	}

	async commitEnumNumericValue(fieldId: string, enumValueId: string, keepFocus = false) {
		const draftKey = `enum:${fieldId}:${enumValueId}`;
		if (draftKey in ui.numericDrafts && !ui.numericDrafts[draftKey].trim()) {
			this.updateEnumValue(fieldId, enumValueId, { value: 0 });
		}
		ui.clearNumericDraft(draftKey);

		this.commitDocumentChange({
			...this.document,
			registers: sortFieldEnumValues(this.document.registers, this.selectedRegister.id, fieldId),
		});

		if (!keepFocus) return;
		await tick();
		focusAndSelect(`[data-enum-value-input="${fieldId}:${enumValueId}"]`);
	}

	async addEnumValue(fieldId: string) {
		const field = this.selectedRegister.fields.find((item) => item.id === fieldId);
		const shouldFocusEnumName = !field?.values.length;
		const nextValue = field?.values.length
			? Math.max(...field.values.map((value) => value.value)) + 1
			: 0;
		const nextId = `enum-${Date.now()}`;
		const shouldAutoSelectReset = shouldFocusEnumName;

		this.commitDocumentChange({
			...this.document,
			registers: this.document.registers.map((register) => {
				if (register.id !== this.selectedRegister.id) return register;
				return {
					...register,
					fields: register.fields.map((field) => {
						if (field.id !== fieldId) return field;
						return {
							...field,
							reset: shouldAutoSelectReset ? nextValue : field.reset,
							resetEnumValueId: shouldAutoSelectReset ? nextId : field.resetEnumValueId,
							values: [
								...field.values,
								{
									id: nextId,
									name: `VALUE_${nextValue}`,
									value: nextValue,
									desc: '',
								},
							],
						};
					}),
				};
			}),
		});
		ui.updateNumericDraft(`enum:${fieldId}:${nextId}`, '');

		await tick();
		focusAndSelect(
			shouldFocusEnumName
				? `[data-enum-name-input="${fieldId}"]`
				: `[data-enum-variant-name-input="${fieldId}:${nextId}"]`,
		);
	}

	removeEnumValue(fieldId: string, enumValueId: string) {
		this.commitDocumentChange({
			...this.document,
			registers: this.document.registers.map((register) => {
				if (register.id !== this.selectedRegister.id) return register;
				return {
					...register,
					fields: register.fields.map((field) =>
						field.id === fieldId
							? {
									...field,
									resetEnumValueId:
										field.resetEnumValueId === enumValueId ? undefined : field.resetEnumValueId,
									values: field.values.filter((value) => value.id !== enumValueId),
								}
							: field,
					),
				};
			}),
		});
	}

	private registerChangesWithDerivedName(changes: Partial<Register>) {
		if (
			changes.title === undefined ||
			changes.name !== undefined ||
			!this.selectedRegister.id.startsWith(newRegisterIdPrefix)
		) {
			return changes;
		}

		const currentName = this.selectedRegister.name;
		const previousDerivedName = deriveIdentifier(this.selectedRegister.title);
		if (currentName && currentName !== previousDerivedName) return changes;

		return { ...changes, name: deriveIdentifier(changes.title) };
	}

	private fieldChangesWithDerivedName(fieldId: string, changes: Partial<Field>) {
		if (
			changes.title === undefined ||
			changes.name !== undefined ||
			!fieldId.startsWith(newFieldIdPrefix)
		) {
			return changes;
		}

		const field = this.selectedRegister.fields.find((item) => item.id === fieldId);
		if (!field) return changes;

		const previousDerivedName = deriveIdentifier(field.title);
		if (field.name && field.name !== previousDerivedName) return changes;

		return { ...changes, name: deriveIdentifier(changes.title) };
	}

	fieldBitWidth(field: Field) {
		return fieldBitWidth(field);
	}
}

export function textInput(event: Event) {
	return (event.currentTarget as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
}

export function numberInput(event: Event) {
	return Number((event.currentTarget as HTMLInputElement).value);
}

export function beginGroupedDocumentEdit() {
	editor.beginGroupedDocumentEdit();
}

export function endGroupedDocumentEdit() {
	editor.endGroupedDocumentEdit();
}

function focusAndSelect(selector: string) {
	const input = globalThis.document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
	input?.focus();
	input?.select();
}

export const editor = new EditorState();

interface GroupedEdit {
	documentBefore: RdlDocument;
	selectionBefore: SelectionSnapshot;
	dirtyBefore: boolean;
}
