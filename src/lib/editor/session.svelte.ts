import { Effect, Layer, ManagedRuntime } from 'effect';
import { SvelteDate } from 'svelte/reactivity';
import type { Compilation, EditCommand } from '$lib/rdl/types';
import { deriveIdentifier } from '$lib/rdl/identifiers';
import { createCompiler } from './compiler';
import { browserFiles, Files, type WritableFileHandle } from './files';
import { diffLines } from './diff';
import { browserWorkspaceStorage, type SavedWorkspace, type WorkspaceStorage } from './persistence';

const emptyCompilation = (): Compilation => ({
	source: '',
	roots: [],
	nodes: [],
	diagnostics: [],
	properties: [],
	enums: [],
	valid: false
});
const NEW_SOURCE =
	'addrmap untitled_addrmap {\n\tname = "Untitled RDL";\n\tdefault regwidth = 8;\n\tdefault sw = r;\n\tdefault hw = rw;\n};\n';

export interface EditorLog {
	timestamp: string;
	source: string;
	message: string;
	details?: string;
}

/** One session per editor component. Source text is the document authority. */
export function createEditorSession(
	options: {
		compiler?: ReturnType<typeof createCompiler>;
		files?: Files['Service'];
		storage?: WorkspaceStorage;
	} = {}
) {
	let filename = $state('');
	let source = $state('');
	let baseline = $state('');
	let compilation = $state.raw<Compilation>(emptyCompilation());
	let selectedId = $state('');
	let busy = $state(false);
	let error = $state('');
	let errorOrigin: 'edit' | 'file' = 'file';
	let saveFailed = $state(false);
	let status = $state('');
	let logs = $state.raw<EditorLog[]>([]);
	function log(entry: Omit<EditorLog, 'timestamp'>) {
		logs = [...logs, { ...entry, timestamp: new SvelteDate().toISOString() }].slice(-200);
	}
	let hasDocument = $state(false);
	let canWriteBack = $state(false);
	let persistenceError = $state('');
	let pendingRecovery = $state.raw<SavedWorkspace | undefined>();
	let formDrafts = $state.raw<Record<string, string>>({});
	let emptyGroups = $state.raw<string[]>([]);
	let restoreAttempted = false;
	let persistenceAllowed = false;
	let persistTimer: ReturnType<typeof setTimeout> | undefined;
	let persistenceQueue = Promise.resolve();
	const storage = options.storage ?? browserWorkspaceStorage;
	type Snapshot = { compilation: Compilation; selectedId: string; emptyGroups: string[] };
	let history = $state.raw<Snapshot[]>([]);
	let future = $state.raw<Snapshot[]>([]);
	let handle: WritableFileHandle | undefined;
	let disposed = false;
	let newDraft = false;
	let activeTask: AbortController | undefined;
	const compiler = options.compiler ?? createCompiler();
	const runtime = ManagedRuntime.make(
		options.files ? Layer.succeed(Files, options.files) : browserFiles
	);
	const dirty = $derived(
		hasDocument &&
			(source !== baseline || Object.keys(formDrafts).length > 0 || emptyGroups.length > 0)
	);
	const diff = $derived(diffLines(baseline, source));

	function persist(): Promise<void> {
		if (!persistenceAllowed) return persistenceQueue;
		const saved: SavedWorkspace | undefined =
			hasDocument &&
			(source !== baseline || Object.keys(formDrafts).length > 0 || emptyGroups.length > 0)
				? {
						version: 1,
						timestamp: Date.now(),
						formDrafts,
						emptyGroups,
						filename,
						source,
						baseline,
						selectedId,
						newDraft,
						handle
					}
				: undefined;
		persistenceQueue = persistenceQueue
			.catch(() => undefined)
			.then(async () => {
				await Effect.runPromise(
					(saved ? storage.save(saved) : storage.clear()).pipe(
						Effect.catch((cause) =>
							Effect.sync(() => {
								if (!disposed) persistenceError = cause.message;
							})
						)
					)
				);
			});
		return persistenceQueue;
	}
	function schedulePersistence() {
		if (disposed || !persistenceAllowed) return;
		if (persistTimer) clearTimeout(persistTimer);
		persistTimer = setTimeout(() => {
			persistTimer = undefined;
			void persist();
		}, 700);
	}

	function snapshot(): Snapshot {
		return { compilation, selectedId, emptyGroups };
	}
	function normalizeEmptyGroups(paths: string[], next = compilation) {
		const populated = next.groups?.map((group) => group.path) ?? [];
		const normalized = paths.map((path) =>
			path
				.split('/')
				.map((part) => part.trim())
				.filter(Boolean)
				.join('/')
		);
		return normalized.filter(
			(path, index) => path && !populated.includes(path) && normalized.indexOf(path) === index
		);
	}

	function accept(next: Compilation, selection = selectedId, folders = emptyGroups) {
		emptyGroups = normalizeEmptyGroups(folders, next);
		compilation = next;
		source = next.source;
		selectedId = next.nodes.some((node) => node.id === selection)
			? selection
			: (next.roots[0]?.id ?? '');
	}
	function selectionAfterEdit(command: EditCommand): string {
		if (command.type !== 'rename' && command.type !== 'update-title') return selectedId;
		const target = compilation.nodes.find((node) => node.id === command.nodeId);
		if (!target || !(selectedId === target.id || selectedId.startsWith(`${target.id}.`)))
			return selectedId;
		let name = command.type === 'rename' ? command.name : deriveIdentifier(command.title);
		if (command.type === 'update-title') {
			const prior =
				typeof target.properties.name?.value === 'string'
					? target.properties.name.value
					: target.name;
			if (!command.deriveIdentifier || target.name !== deriveIdentifier(prior)) name = target.name;
		}
		const renamedId = target.parentId ? `${target.parentId}.${name}` : name;
		return renamedId + selectedId.slice(target.id.length);
	}
	async function task(
		operation: Effect.Effect<void, unknown, Files>,
		origin: 'edit' | 'file' = 'file',
		isSave = false
	) {
		if (busy || disposed) return false;
		busy = true;
		error = '';
		errorOrigin = origin;
		const controller = new AbortController();
		activeTask = controller;
		try {
			return await runtime.runPromise(
				operation.pipe(
					Effect.tap(() =>
						Effect.sync(() => {
							if (!disposed && status) log({ source: origin, message: status });
						})
					),
					Effect.as(true),
					Effect.catch((cause) =>
						Effect.sync(() => {
							if (disposed) return false;
							if (typeof cause === 'object' && cause && 'cancelled' in cause && cause.cancelled)
								return false;
							if (isSave) saveFailed = true;
							error =
								cause instanceof Error ? cause.message : 'The operation could not be completed.';
							log({
								source: origin,
								message: error,
								details: cause instanceof Error ? cause.stack : undefined
							});
							return false;
						})
					)
				),
				{ signal: controller.signal }
			);
		} catch (cause) {
			if (!disposed) {
				if (isSave) saveFailed = true;
				error = cause instanceof Error ? cause.message : 'The operation could not be completed.';
				log({
					source: origin,
					message: error,
					details: cause instanceof Error ? cause.stack : undefined
				});
			}
			return false;
		} finally {
			activeTask = undefined;
			if (!disposed) {
				if (origin === 'edit') schedulePersistence();
				else await persist();
			}
			busy = false;
		}
	}
	function load(name: string, text: string, fileHandle?: WritableFileHandle, isNew = false) {
		return Effect.suspend(() => compiler.compile(text)).pipe(
			Effect.map((next) => {
				if (disposed) return;
				persistenceAllowed = true;
				persistenceError = '';
				pendingRecovery = undefined;
				formDrafts = {};
				emptyGroups = [];
				newDraft = isNew;
				saveFailed = false;
				filename = name;
				baseline = isNew ? '' : text;
				handle = fileHandle;
				canWriteBack = Boolean(fileHandle);
				hasDocument = true;
				history = [];
				future = [];
				selectedId = '';
				accept(next);
				status = next.valid ? 'Ready' : 'Fix the errors in the file, then open it again.';
			})
		);
	}
	function select(id: string) {
		if (!disposed) {
			selectedId = id;
			if (errorOrigin === 'edit') error = '';
			schedulePersistence();
		}
	}
	const session = {
		get logs() {
			return logs;
		},
		clearLogs() {
			logs = [];
		},
		get persistenceError() {
			return persistenceError;
		},
		get emptyGroups() {
			return emptyGroups;
		},
		setEmptyGroups(paths: string[]) {
			if (disposed || busy || !hasDocument) return;
			const next = normalizeEmptyGroups(paths);
			if (
				next.length === emptyGroups.length &&
				next.every((path, index) => path === emptyGroups[index])
			)
				return;
			history = [...history, snapshot()].slice(-100);
			future = [];
			emptyGroups = next;
			status = 'Folder changes pending';
			schedulePersistence();
		},
		get formDrafts() {
			return formDrafts;
		},
		setFormDrafts(drafts: Record<string, string>) {
			if (disposed) return;
			formDrafts = { ...drafts };
			schedulePersistence();
		},
		get pendingRecovery() {
			return pendingRecovery;
		},
		clearPersistenceError() {
			persistenceError = '';
		},
		async restore() {
			if (restoreAttempted || hasDocument || busy || disposed) return false;
			restoreAttempted = true;
			return task(
				Effect.gen(function* () {
					const saved = yield* storage.load().pipe(
						Effect.tapError((cause) =>
							Effect.sync(() => {
								persistenceError = `Cannot load recovery: ${cause.message}`;
							})
						)
					);
					if (disposed) return;
					pendingRecovery = saved;
					persistenceAllowed = !saved;
				})
			);
		},
		resumeRecovery() {
			if (!pendingRecovery || busy || disposed) return Promise.resolve(false);
			const saved = pendingRecovery;
			return task(
				Effect.gen(function* () {
					const next = yield* compiler.compile(saved.source);
					if (!next.valid)
						return yield* Effect.fail(
							new Error('Cannot resume recovery: the saved document has validation errors.')
						);
					if (disposed) return;
					filename = saved.filename;
					baseline = saved.baseline;
					newDraft = saved.newDraft;
					handle = saved.handle;
					canWriteBack = Boolean(handle);
					hasDocument = true;
					history = [];
					future = [];
					accept(next, saved.selectedId, saved.emptyGroups ?? []);
					formDrafts = saved.formDrafts ?? {};
					pendingRecovery = undefined;
					persistenceAllowed = true;
					persistenceError = '';
					status = 'Unsaved work restored';
				})
			);
		},
		discardRecovery() {
			if (!pendingRecovery || busy || disposed) return Promise.resolve(false);
			return task(
				Effect.gen(function* () {
					yield* Effect.promise(() => persistenceQueue);
					yield* storage.clear().pipe(
						Effect.tapError((cause) =>
							Effect.sync(() => {
								persistenceError = `Cannot clear recovery: ${cause.message}`;
							})
						)
					);
					if (disposed) return;
					pendingRecovery = undefined;
					persistenceAllowed = true;
					persistenceError = '';
				})
			);
		},

		flushPersistence() {
			if (persistTimer) {
				clearTimeout(persistTimer);
				persistTimer = undefined;
			}
			return persist();
		},
		get filename() {
			return filename;
		},
		get source() {
			return source;
		},
		get baseline() {
			return baseline;
		},
		get compilation() {
			return compilation;
		},
		get selectedId() {
			return selectedId;
		},
		get busy() {
			return busy;
		},
		get error() {
			return error;
		},
		get saveFailed() {
			return saveFailed;
		},
		get status() {
			return status;
		},
		get hasDocument() {
			return hasDocument;
		},
		get canWriteBack() {
			return canWriteBack;
		},
		get dirty() {
			return dirty;
		},
		get diff() {
			return diff;
		},
		get canUndo() {
			return history.length > 0 && !busy;
		},
		get canRedo() {
			return future.length > 0 && !busy;
		},
		select,
		setSelected: select,
		clearError() {
			error = '';
		},
		open(file?: File) {
			return task(
				Effect.gen(function* () {
					const files = yield* Files;
					const opened = yield* files.open(file);
					yield* load(opened.name, opened.source, opened.handle);
				})
			);
		},
		newDocument() {
			return task(load('untitled.rdl', NEW_SOURCE, undefined, true));
		},
		close() {
			if (disposed || busy) return false;
			filename = '';
			source = '';
			baseline = '';
			compilation = emptyCompilation();
			selectedId = '';
			hasDocument = false;
			formDrafts = {};
			emptyGroups = [];
			newDraft = false;
			history = [];
			future = [];
			error = '';
			status = '';
			handle = undefined;
			canWriteBack = false;
			saveFailed = false;
			persistenceAllowed = true;
			void persist();
			return true;
		},
		edit(command: EditCommand) {
			if (!hasDocument || !compilation.valid) return Promise.resolve(false);
			const editCommand = $state.snapshot(command);
			return task(
				compiler.compile(source, editCommand).pipe(
					Effect.flatMap((next) => {
						if (!next.valid)
							return Effect.fail(
								new Error(
									next.diagnostics
										.filter((d) => d.severity === 'error')
										.map((d) => d.message)
										.join('\n')
								)
							);
						return Effect.sync(() => {
							if (next.source === source || disposed) return;
							history = [...history, snapshot()].slice(-100);
							future = [];
							let folders = emptyGroups;
							if (editCommand.type === 'delete-group')
								folders = folders.filter(
									(path) => path !== editCommand.path && !path.startsWith(editCommand.path + '/')
								);
							if (editCommand.type === 'rename-group' || editCommand.type === 'move-group') {
								const old = editCommand.path;
								const parts = old.split('/');
								const parent =
									editCommand.type === 'move-group'
										? editCommand.parentPath
										: parts.slice(0, -1).join('/');
								const name = editCommand.type === 'rename-group' ? editCommand.name : parts.at(-1)!;
								const renamed = parent ? `${parent}/${name}` : name;
								folders = folders.map((path) =>
									path === old || path.startsWith(old + '/')
										? renamed + path.slice(old.length)
										: path
								);
							}
							accept(next, selectionAfterEdit(editCommand), folders);
							status = 'Changes pending';
						});
					})
				),
				'edit'
			);
		},
		undo() {
			if (disposed || busy || !history.length) return;
			future = [...future, snapshot()];
			const previous = history.at(-1)!;
			history = history.slice(0, -1);
			accept(previous.compilation, previous.selectedId, previous.emptyGroups);
			error = '';
			status = 'Edit undone';
			schedulePersistence();
		},
		redo() {
			if (disposed || busy || !future.length) return;
			history = [...history, snapshot()];
			const next = future.at(-1)!;
			future = future.slice(0, -1);
			accept(next.compilation, next.selectedId, next.emptyGroups);
			error = '';
			status = 'Edit restored';
			schedulePersistence();
		},
		discard() {
			if (disposed || !hasDocument) return Promise.resolve(false);
			if (newDraft) {
				if (busy) return Promise.resolve(false);
				filename = '';
				source = '';
				baseline = '';
				compilation = emptyCompilation();
				selectedId = '';
				hasDocument = false;
				formDrafts = {};
				emptyGroups = [];
				newDraft = false;
				history = [];
				future = [];
				error = '';
				status = '';
				handle = undefined;
				canWriteBack = false;
				void persist();
				return Promise.resolve(true);
			}
			return task(
				compiler.compile(baseline).pipe(
					Effect.map((next) => {
						if (disposed) return;
						accept(next);
						history = [];
						future = [];
						formDrafts = {};
						emptyGroups = [];
						status = 'Changes discarded';
					})
				)
			);
		},
		saveAs() {
			if (!hasDocument || !compilation.valid) return Promise.resolve(false);
			return task(
				Effect.gen(function* () {
					const files = yield* Files;
					const target = yield* files.chooseSaveTarget(filename);
					if (disposed) return;
					const snapshot = source;
					if (target?.handle) {
						yield* files.write(target.handle, snapshot, target.source);
						if (disposed) return;
						handle = target.handle;
						filename = target.name;
						baseline = snapshot;
						newDraft = false;
						canWriteBack = true;
						status = 'Saved';
					} else {
						yield* files.download(filename, snapshot);
						if (!disposed) status = 'Download started';
					}
					if (!disposed) saveFailed = false;
				}),
				'file',
				true
			);
		},
		reload() {
			if (!handle) return session.open();
			const target = handle;
			return task(
				Effect.gen(function* () {
					const files = yield* Files;
					const opened = yield* files.reopen(target);
					yield* load(opened.name, opened.source, target);
				})
			);
		},
		overwrite() {
			if (!handle || !hasDocument || !compilation.valid) return Promise.resolve(false);
			const target = handle;
			return task(
				Effect.gen(function* () {
					const files = yield* Files;
					const current = yield* files.reopen(target);
					const snapshot = source;
					yield* files.write(target, snapshot, current.source);
					if (disposed) return;
					baseline = snapshot;
					newDraft = false;
					saveFailed = false;
					status = 'Saved';
				}),
				'file',
				true
			);
		},
		save() {
			if (!hasDocument || !compilation.valid) return Promise.resolve(false);
			if (newDraft && !handle) return session.saveAs();
			return task(
				Effect.gen(function* () {
					const files = yield* Files;
					const snapshot = source;
					if (handle) {
						yield* files.write(handle, snapshot, baseline);
						if (!disposed) {
							baseline = snapshot;
							newDraft = false;
							status = 'Saved';
						}
					} else {
						yield* files.download(filename, snapshot);
						if (!disposed) status = 'Download started. Changes are compared with the opened file.';
					}
					if (!disposed) saveFailed = false;
				}),
				'file',
				true
			);
		},
		download() {
			if (!hasDocument || !compilation.valid) return Promise.resolve(false);
			return task(
				Effect.gen(function* () {
					const files = yield* Files;
					yield* files.download(filename, source);
					if (!disposed) status = 'Download started. Changes are compared with the opened file.';
				})
			);
		},
		dispose() {
			if (persistTimer) {
				clearTimeout(persistTimer);
				persistTimer = undefined;
			}
			void persist();
			disposed = true;
			activeTask?.abort();
			compiler.dispose();
			void runtime.dispose();
		}
	};
	return session;
}

export type EditorSession = ReturnType<typeof createEditorSession>;
