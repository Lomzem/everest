import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopApi } from '$lib/desktop-api';
import { RdlParseFailed } from '$lib/effect/desktop';
import { folderDndId, registerDndId } from '$lib/rdl/hierarchy';
import type { RdlDocument } from '$lib/rdl/model';
import { registerAddressErrors } from '$lib/rdl/validation';
import { EditorState } from './editor.svelte';
import { ui } from './ui.svelte';

describe('EditorState derived names', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		Object.defineProperty(globalThis, 'window', {
			configurable: true,
			value: {
				alert: vi.fn(),
				confirm: vi.fn(() => true),
				localStorage: localStorageMock(),
			},
		});
		Object.defineProperty(globalThis, 'document', {
			configurable: true,
			value: {
				querySelector: () => null,
			},
		});
	});

	it('derives a new register ID from the display name until manually edited', async () => {
		const state = new EditorState();
		state.newDocument();
		await state.addRegister('');

		expect(state.selectedRegister.name).toBe('');
		expect(state.selectedRegister.title).toBe('');
		expect(state.selectedRegister.desc).toBe('');

		state.updateSelectedRegister({ title: 'SDI' });
		expect(state.selectedRegister.name).toBe('sdi');

		state.updateSelectedRegister({ title: 'SDI Output 1' });
		expect(state.selectedRegister.name).toBe('sdi_output_1');

		state.updateSelectedRegister({ name: 'custom_sdi' });
		state.updateSelectedRegister({ title: 'SDI Output 2' });
		expect(state.selectedRegister.name).toBe('custom_sdi');
	});

	it('adds a register at a selected reserved address', async () => {
		let now = 1;
		vi.spyOn(Date, 'now').mockImplementation(() => now++);
		const state = new EditorState();
		state.newDocument();
		await state.addRegister('', 0);
		await state.addRegister('', 0x04);
		state.selectGroup('');

		expect(state.selectedFolderChildren.map((child) => child.kind)).toEqual([
			'register',
			'reserved',
			'register',
		]);

		await state.addRegister('', 0x01);

		expect(state.selectedRegister.address).toBe(0x01);
		expect(state.selectedRegister.group).toBe('');
		expect(state.selectedKind).toBe('register');
		expect(state.document.registers.map((register) => register.address)).toEqual([0, 0x01, 0x04]);
	});

	it('reports address conflicts after editing a register address', async () => {
		const state = new EditorState();
		state.newDocument();
		await state.addRegister('', 0);
		await state.addRegister('', 1);

		state.updateSelectedRegister({ address: 0 });

		expect(registerAddressErrors(state.document, state.selectedRegister)).toEqual([
			'Duplicate register address 0x0 in addrmap "untitled_addrmap".',
		]);
	});

	it('appends default 8-bit registers at byte addresses', async () => {
		let now = 1;
		vi.spyOn(Date, 'now').mockImplementation(() => now++);
		const state = new EditorState();
		state.newDocument();

		await state.addRegister('');
		await state.addRegister('');

		expect(state.document.registers.map((register) => register.address)).toEqual([0, 1]);
	});

	it('adds registers without fields', async () => {
		const state = new EditorState();
		state.newDocument();

		await state.addRegister('');

		expect(state.selectedRegister.fields).toEqual([]);
		expect(state.selectedFieldId).toBe('');
	});

	it('derives a new field ID from the display name until manually edited', async () => {
		const state = new EditorState();
		state.newDocument();
		await state.addRegister('');
		await state.addField();
		const fieldId = state.selectedFieldId;

		expect(state.selectedField.name).toBe('');
		expect(state.selectedField.title).toBe('');
		expect(state.selectedField.desc).toBe('');

		state.updateField(fieldId, { title: 'Output' });
		expect(state.selectedField.name).toBe('output');

		state.updateField(fieldId, { title: 'SDI Output 1' });
		expect(state.selectedField.name).toBe('sdi_output_1');

		state.updateField(fieldId, { name: 'custom_field' });
		state.updateField(fieldId, { title: 'SDI Output 2' });
		expect(state.selectedField.name).toBe('custom_field');
	});

	it('keeps parsed identifiers for imported documents when titles change', () => {
		const state = new EditorState();
		state.applyDocument(sourceDocument(), '/tmp/top.rdl', false);
		state.selectRegister('control');

		state.updateSelectedRegister({ title: 'Control Next' });
		state.updateField('control-mode', { title: 'Mode Next' });

		expect(state.selectedRegister.name).toBe('control');
		expect(state.selectedRegister.fields[0].name).toBe('mode');
	});

	it('allows structural edits for imported documents', async () => {
		const state = new EditorState();
		state.applyDocument(sourceDocument(), '/tmp/top.rdl', false);
		state.selectRegister('control');

		await state.addField();
		const fieldId = state.selectedFieldId;
		expect(state.selectedRegister.fields).toHaveLength(2);
		state.updateField(fieldId, { title: 'Editable Field', name: 'editable_field' });
		expect(state.selectedRegister.fields.find((field) => field.id === fieldId)).toMatchObject({
			title: 'Editable Field',
			name: 'editable_field',
		});

		await state.addEnumValue('control-mode');
		const modeField = state.selectedRegister.fields.find((field) => field.id === 'control-mode');
		const enumValueId = modeField?.values[0].id ?? '';
		expect(modeField?.values).toHaveLength(1);
		state.updateEnumValue('control-mode', enumValueId, {
			name: 'ENABLED',
			value: 1,
			desc: 'Enabled state.',
		});
		expect(
			state.selectedRegister.fields.find((field) => field.id === 'control-mode')?.values[0],
		).toMatchObject({
			name: 'ENABLED',
			value: 1,
			desc: 'Enabled state.',
		});
	});

	it('allows editing a newly added register in an imported document', async () => {
		vi.spyOn(Date, 'now').mockReturnValue(42);
		const state = new EditorState();
		state.applyDocument(sourceDocument(), '/tmp/top.rdl', false);

		await state.addRegister('');

		expect(state.selectedRegister.id).toBe('new-register-42');

		state.updateSelectedRegister({
			title: 'Status',
			name: 'status',
			desc: 'Status register.',
			address: 4,
		});

		expect(state.selectedRegister).toMatchObject({
			title: 'Status',
			name: 'status',
			desc: 'Status register.',
			address: 4,
		});
	});

	it('renames the addrmap through the root folder label', () => {
		const state = new EditorState();
		state.newDocument();
		state.selectGroup('');

		state.updateGroupLabel('document-root', 'video_top');

		expect(state.document.addrmapName).toBe('video_top');
		expect(state.selectedFolder?.label).toBe('video_top');
		expect(state.canUndo).toBe(true);
	});

	it('allows imported addrmap rename', () => {
		const state = new EditorState();
		state.applyDocument(sourceDocument(), '/tmp/top.rdl', false);

		state.updateAddrmapName('video_top');

		expect(state.document.addrmapName).toBe('video_top');
	});

	it('sorts enum values by numeric value after commit', async () => {
		let now = 1;
		vi.spyOn(Date, 'now').mockImplementation(() => now++);
		const state = new EditorState();
		state.newDocument();
		await state.addRegister('');
		await state.addField();
		const fieldId = state.selectedRegister.fields[0].id;
		await state.addEnumValue(fieldId);
		await state.addEnumValue(fieldId);
		const [first, second] = state.selectedRegister.fields[0].values;

		state.updateEnumValue(fieldId, first.id, { name: 'HIGH', value: 3 });
		state.updateEnumValue(fieldId, second.id, { name: 'LOW', value: 1 });
		await state.commitEnumNumericValue(fieldId, second.id);

		expect(state.selectedRegister.fields[0].values.map((value) => value.name)).toEqual([
			'LOW',
			'HIGH',
		]);
	});

	it('sorts fields by descending MSB after bit edits', async () => {
		let now = 1;
		vi.spyOn(Date, 'now').mockImplementation(() => now++);
		const state = new EditorState();
		state.newDocument();
		await state.addRegister('');
		await state.addField();
		const highFieldId = state.selectedFieldId;
		await state.addField();
		const lowFieldId = state.selectedFieldId;

		state.updateField(highFieldId, { name: 'high', title: 'High', msb: 7, lsb: 4 });
		state.updateField(lowFieldId, { name: 'low', title: 'Low', msb: 1, lsb: 0 });

		expect(state.selectedRegister.fields.map((field) => field.id)).toEqual([
			highFieldId,
			lowFieldId,
		]);
	});

	it('adds enum metadata with editable placeholders instead of filled values', async () => {
		vi.spyOn(Date, 'now').mockReturnValue(42);
		const state = new EditorState();
		state.newDocument();
		await state.addRegister('');
		await state.addField();
		const fieldId = state.selectedRegister.fields[0].id;

		await state.addEnumValue(fieldId);

		expect(state.selectedRegister.fields[0].enumName).toBe('');
		expect(ui.numericDrafts[`enum:${fieldId}:enum-42`]).toBe('');
	});

	it('sorts imported enum values by numeric value after commit', async () => {
		let now = 1;
		vi.spyOn(Date, 'now').mockImplementation(() => now++);
		const state = new EditorState();
		state.applyDocument(sourceDocument(), '/tmp/top.rdl', false);
		state.selectRegister('control');
		await state.addEnumValue('control-mode');
		await state.addEnumValue('control-mode');
		const [first, second] = state.selectedRegister.fields[0].values;

		state.updateEnumValue('control-mode', first.id, { name: 'HIGH', value: 3 });
		state.updateEnumValue('control-mode', second.id, { name: 'LOW', value: 1 });
		await state.commitEnumNumericValue('control-mode', second.id);

		expect(state.selectedRegister.fields[0].values.map((value) => value.name)).toEqual([
			'LOW',
			'HIGH',
		]);
	});

	it('auto-selects matching enum reset values from numeric edits', async () => {
		const state = new EditorState();
		state.applyDocument(enumResetDocument(), '/tmp/top.rdl', false);
		state.selectRegister('control');

		state.updateResetDraft('control-mode', '1');

		expect(state.selectedRegister.fields[0]).toMatchObject({
			reset: 1,
			resetEnumValueId: 'control-mode-on',
		});
	});

	it('adds a reset encoding for numeric enum reset mismatches', async () => {
		vi.spyOn(Date, 'now').mockReturnValue(42);
		const state = new EditorState();
		state.applyDocument(enumResetDocument(), '/tmp/top.rdl', false);
		state.selectRegister('control');
		state.updateResetDraft('control-mode', '2');

		await state.addEnumValueForReset('control-mode');

		expect(state.selectedRegister.fields[0]).toMatchObject({
			reset: 2,
			resetEnumValueId: 'enum-42',
		});
		expect(state.selectedRegister.fields[0].values.at(-1)).toMatchObject({
			id: 'enum-42',
			name: 'VALUE_2',
			value: 2,
		});
	});

	it('undoes and redoes deleting a register', async () => {
		let now = 1;
		vi.spyOn(Date, 'now').mockImplementation(() => now++);
		const state = new EditorState();
		state.newDocument();
		await state.addRegister('');
		const registerId = state.selectedRegister.id;

		state.deleteRegister(registerId);
		expect(state.document.registers).toHaveLength(0);

		state.undo();
		expect(state.document.registers.map((register) => register.id)).toEqual([registerId]);
		expect(state.selectedRegisterId).toBe(registerId);

		state.redo();
		expect(state.document.registers).toHaveLength(0);
	});

	it('undoes deleting a field with selection restored', async () => {
		let now = 1;
		vi.spyOn(Date, 'now').mockImplementation(() => now++);
		const state = new EditorState();
		state.newDocument();
		await state.addRegister('');
		await state.addField();
		const fieldId = state.selectedFieldId;

		state.removeField(fieldId);
		expect(state.selectedRegister.fields.some((field) => field.id === fieldId)).toBe(false);

		state.undo();
		expect(state.selectedRegister.fields.map((field) => field.id)).toContain(fieldId);
		expect(state.selectedFieldId).toBe(fieldId);
	});

	it('undoes deleting a folder and its nested registers', async () => {
		let now = 1;
		vi.spyOn(Date, 'now').mockImplementation(() => now++);
		const state = new EditorState();
		state.newDocument();
		await state.addSubdir('');
		const groupId = state.document.hierarchyGroups.at(-1)?.id ?? '';
		const groupPath = state.document.hierarchyGroups.at(-1)?.path ?? '';
		await state.addRegister(groupPath);
		const registerId = state.selectedRegister.id;

		state.deleteGroup(groupId);
		expect(state.document.registers.some((register) => register.id === registerId)).toBe(false);

		state.undo();
		expect(state.document.hierarchyGroups.some((group) => group.id === groupId)).toBe(true);
		expect(state.document.registers.some((register) => register.id === registerId)).toBe(true);
	});

	it('moves a register between folders without reordering registers', () => {
		const state = new EditorState();
		state.applyDocument(moveDocument(), '/tmp/top.rdl', false);
		state.selectRegister('status');

		state.moveRegisterToGroup('status', 'Control');

		expect(state.document.registers.map((register) => register.id)).toEqual([
			'control',
			'status',
			'nested',
		]);
		expect(state.document.registers.find((register) => register.id === 'status')?.group).toBe(
			'Control',
		);
		expect(state.selectedGroupPath).toBe('Control');

		state.undo();
		expect(state.document.registers.find((register) => register.id === 'status')?.group).toBe(
			'Status',
		);
		expect(state.selectedRegisterId).toBe('status');

		state.redo();
		expect(state.document.registers.find((register) => register.id === 'status')?.group).toBe(
			'Control',
		);
	});

	it('moves a folder and rewrites descendant folder and register paths', () => {
		const state = new EditorState();
		state.applyDocument(moveDocument(), '/tmp/top.rdl', false);
		state.selectGroup('Status/Nested');

		state.moveGroupToGroup('status', 'Control');

		expect(state.document.hierarchyGroups.map((group) => group.path)).toEqual([
			'Control',
			'Control/Status',
			'Control/Status/Nested',
		]);
		expect(state.document.registers.find((register) => register.id === 'status')?.group).toBe(
			'Control/Status',
		);
		expect(state.document.registers.find((register) => register.id === 'nested')?.group).toBe(
			'Control/Status/Nested',
		);
		expect(state.selectedGroupPath).toBe('Control/Status/Nested');

		state.undo();
		expect(state.document.hierarchyGroups.map((group) => group.path)).toEqual([
			'Control',
			'Status',
			'Status/Nested',
		]);
		expect(state.selectedGroupPath).toBe('Status/Nested');
	});

	it('updates selected register group path when its folder moves', () => {
		const state = new EditorState();
		state.applyDocument(moveDocument(), '/tmp/top.rdl', false);
		state.selectRegister('nested');

		state.moveGroupToGroup('status', 'Control');

		expect(state.selectedRegisterId).toBe('nested');
		expect(state.selectedRegister.group).toBe('Control/Status/Nested');
		expect(state.selectedGroupPath).toBe('Control/Status/Nested');
	});

	it('rejects moving a folder into itself, a descendant, or a colliding target path', () => {
		const state = new EditorState();
		state.applyDocument(moveDocument(), '/tmp/top.rdl', false);

		expect(state.canMoveGroupToGroup('status', 'Status')).toBe(false);
		expect(state.canMoveGroupToGroup('status', 'Status/Nested')).toBe(false);
		expect(state.canMoveGroupToGroup('nested', 'Status')).toBe(false);

		state.moveGroupToGroup('status', 'Status/Nested');
		expect(state.document.hierarchyGroups.map((group) => group.path)).toEqual([
			'Control',
			'Status',
			'Status/Nested',
		]);
		expect(state.canUndo).toBe(false);

		state.applyDocument(
			{
				...moveDocument(),
				hierarchyGroups: [
					...moveDocument().hierarchyGroups,
					{ id: 'control-status', label: 'Status', path: 'Control/Status' },
				],
			},
			'/tmp/top.rdl',
			false,
		);
		expect(state.canMoveGroupToGroup('status', 'Control')).toBe(false);
	});

	it('finalizes hierarchy dnd drops through prefixed item IDs', () => {
		const state = new EditorState();
		state.applyDocument(moveDocument(), '/tmp/top.rdl', false);

		state.moveHierarchyItemToGroup(registerDndId('status'), 'Control');
		expect(state.document.registers.find((register) => register.id === 'status')?.group).toBe(
			'Control',
		);

		state.moveHierarchyItemToGroup(folderDndId('nested'), 'Control');
		expect(state.document.hierarchyGroups.find((group) => group.id === 'nested')?.path).toBe(
			'Control/Nested',
		);
		expect(state.document.registers.find((register) => register.id === 'nested')?.group).toBe(
			'Control/Nested',
		);
	});

	it('undoes deleting an enum value and restores reset enum reference', async () => {
		const state = new EditorState();
		state.applyDocument(enumResetDocument(), '/tmp/top.rdl', false);
		state.selectRegister('control');

		state.removeEnumValue('control-mode', 'control-mode-on');
		expect(state.selectedRegister.fields[0].resetEnumValueId).toBeUndefined();

		state.undo();
		expect(state.selectedRegister.fields[0].resetEnumValueId).toBe('control-mode-on');
		expect(state.selectedRegister.fields[0].values.map((value) => value.id)).toContain(
			'control-mode-on',
		);
	});

	it('clears redo when a new edit follows undo', async () => {
		let now = 1;
		vi.spyOn(Date, 'now').mockImplementation(() => now++);
		const state = new EditorState();
		state.newDocument();
		await state.addRegister('');
		const firstRegisterId = state.selectedRegister.id;

		state.deleteRegister(firstRegisterId);
		state.undo();
		expect(state.canRedo).toBe(true);

		await state.addRegister('');
		expect(state.canRedo).toBe(false);
	});

	it('clears history when replacing the document', async () => {
		const state = new EditorState();
		state.newDocument();
		await state.addRegister('');
		expect(state.canUndo).toBe(true);

		state.applyDocument(enumResetDocument(), '/tmp/top.rdl', false);
		expect(state.canUndo).toBe(false);
		expect(state.canRedo).toBe(false);
	});

	it('requests confirmation before replacing a dirty document', async () => {
		const state = new EditorState();
		state.newDocument();
		await state.addRegister('');
		const currentDocument = state.document;

		state.requestNewDocument();

		expect(state.pendingDestructiveAction).toBe('new');
		expect(state.document).toBe(currentDocument);
	});

	it('cancels a pending destructive action without changing the document', async () => {
		const state = new EditorState();
		state.newDocument();
		await state.addRegister('');
		const currentDocument = state.document;

		state.requestNewDocument();
		state.cancelPendingDestructiveAction();

		expect(state.pendingDestructiveAction).toBeUndefined();
		expect(state.document).toBe(currentDocument);
	});

	it('confirms a pending new document action', async () => {
		const state = new EditorState();
		state.newDocument();
		await state.addRegister('');

		state.requestNewDocument();
		await state.confirmPendingDestructiveAction();

		expect(state.pendingDestructiveAction).toBeUndefined();
		expect(state.dirty).toBe(false);
		expect(state.document.registers).toHaveLength(0);
	});

	it('opens parse error dialog state for explicit parse failures', async () => {
		const state = new EditorState();
		const error = new RdlParseFailed({
			kind: 'rdlParseError',
			path: '/home/lomzem/foo.rdl',
			message: "Type 'efault' is not defined",
			line: 9,
			column: 2,
			snippet: '    efault regwidth = 8;\n    ^^^^^^',
		});

		await state.showParseError(error);

		expect(state.parseError).toBe(error);
		expect(state.parseErrorDialogOpen).toBe(true);

		state.closeParseError();

		expect(state.parseError).toBeUndefined();
		expect(state.parseErrorDialogOpen).toBe(false);
	});

	it('opens parse error dialog state for raw SystemRDL fatal diagnostics', async () => {
		const alert = vi.fn();
		const appendDiagnosticLog = vi.fn(() => Promise.resolve());
		Object.defineProperty(globalThis, 'window', {
			configurable: true,
			value: {
				alert,
				confirm: vi.fn(() => true),
				localStorage: localStorageMock(),
				everest: {
					openRdlFile: vi
						.fn()
						.mockRejectedValue(
							[
								"/home/lomzem/foo.rdl:9:2: fatal: Type 'efault' is not defined",
								'    efault regwidth = 8;',
								'    ^^^^^^',
							].join('\n'),
						),
					appendDiagnosticLog,
				} as unknown as DesktopApi,
			},
		});
		const state = new EditorState();

		await state.openDocument();

		expect(alert).not.toHaveBeenCalled();
		expect(state.parseErrorDialogOpen).toBe(true);
		expect(state.parseError?.path).toBe('/home/lomzem/foo.rdl');
		expect(state.parseError?.line).toBe(9);
		expect(state.parseError?.message).toBe("Type 'efault' is not defined");
		expect(appendDiagnosticLog).toHaveBeenCalled();
	});

	it('runs a clean new document action without pending confirmation', () => {
		const state = new EditorState();
		state.applyDocument(enumResetDocument(), '/tmp/top.rdl', false);

		state.requestNewDocument();

		expect(state.pendingDestructiveAction).toBeUndefined();
		expect(state.currentPath).toBe('');
		expect(state.dirty).toBe(false);
	});

	it('groups typed edits into one undo step', async () => {
		let now = 1;
		vi.spyOn(Date, 'now').mockImplementation(() => now++);
		const state = new EditorState();
		state.newDocument();
		await state.addRegister('');
		state.clearHistory();
		state.beginGroupedDocumentEdit();

		state.updateSelectedRegister({ title: 'A' });
		state.updateSelectedRegister({ title: 'AB' });
		state.updateSelectedRegister({ title: 'ABC' });
		state.endGroupedDocumentEdit();

		expect(state.undoStack).toHaveLength(1);
		expect(state.selectedRegister.title).toBe('ABC');
		state.undo();
		expect(state.selectedRegister.title).toBe('');
	});

	it('restores persisted undo history across editor instances', async () => {
		let now = 1;
		vi.spyOn(Date, 'now').mockImplementation(() => now++);
		const state = new EditorState();
		state.newDocument();
		await state.addRegister('');
		const registerId = state.selectedRegister.id;

		state.deleteRegister(registerId);
		expect(state.canUndo).toBe(true);

		const restored = new EditorState();
		expect(restored.restorePersistedSession()).toBe(true);
		expect(restored.document.registers).toHaveLength(0);
		expect(restored.canUndo).toBe(true);

		restored.undo();
		expect(restored.document.registers.map((register) => register.id)).toEqual([registerId]);
		expect(restored.selectedRegisterId).toBe(registerId);
	});

	it('restores persisted redo history across editor instances', async () => {
		let now = 1;
		vi.spyOn(Date, 'now').mockImplementation(() => now++);
		const state = new EditorState();
		state.newDocument();
		await state.addRegister('');
		const registerId = state.selectedRegister.id;
		state.deleteRegister(registerId);
		state.undo();

		const restored = new EditorState();
		expect(restored.restorePersistedSession()).toBe(true);
		expect(restored.canRedo).toBe(true);

		restored.redo();
		expect(restored.document.registers).toHaveLength(0);
	});
});

function localStorageMock() {
	const values = new Map<string, string>();
	return {
		getItem: vi.fn((key: string) => values.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => {
			values.set(key, value);
		}),
		removeItem: vi.fn((key: string) => {
			values.delete(key);
		}),
		clear: vi.fn(() => {
			values.clear();
		}),
	};
}

function sourceDocument(): RdlDocument {
	return {
		deviceName: 'top',
		blockName: 'top',
		addrmapName: 'top',
		title: 'top',
		desc: '',
		hierarchyGroups: [],
		registers: [
			{
				id: 'control',
				name: 'control',
				title: 'Control',
				desc: '',
				address: 0,
				width: 8,
				group: '',
				sw: 'RW',
				hw: 'R',
				fields: [
					{
						id: 'control-mode',
						name: 'mode',
						title: 'Mode',
						desc: '',
						msb: 1,
						lsb: 0,
						reset: 0,
						sw: 'RW',
						hw: 'R',
						enumName: '',
						values: [],
						color: '',
					},
				],
			},
		],
	};
}

function moveDocument(): RdlDocument {
	return {
		deviceName: 'top',
		blockName: 'top',
		addrmapName: 'top',
		title: 'top',
		desc: '',
		hierarchyGroups: [
			{ id: 'control-group', label: 'Control', path: 'Control' },
			{ id: 'status', label: 'Status', path: 'Status' },
			{ id: 'nested', label: 'Nested', path: 'Status/Nested' },
		],
		registers: [
			{
				...sourceDocument().registers[0],
				id: 'control',
				name: 'control',
				title: 'Control',
				group: 'Control',
				address: 0,
			},
			{
				...sourceDocument().registers[0],
				id: 'status',
				name: 'status',
				title: 'Status',
				group: 'Status',
				address: 1,
			},
			{
				...sourceDocument().registers[0],
				id: 'nested',
				name: 'nested',
				title: 'Nested',
				group: 'Status/Nested',
				address: 2,
			},
		],
	};
}

function enumResetDocument(): RdlDocument {
	return {
		...sourceDocument(),
		registers: [
			{
				...sourceDocument().registers[0],
				fields: [
					{
						...sourceDocument().registers[0].fields[0],
						reset: 1,
						resetEnumValueId: 'control-mode-on',
						enumName: 'mode_e',
						values: [
							{ id: 'control-mode-off', name: 'OFF', value: 0, desc: '' },
							{ id: 'control-mode-on', name: 'ON', value: 1, desc: '' },
						],
					},
				],
			},
		],
	};
}
