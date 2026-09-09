import { Effect, Layer, ManagedRuntime } from 'effect';
import type { Compilation, EditCommand } from '$lib/rdl/types';
import { createCompiler } from './compiler';
import { browserFiles, Files, type WritableFileHandle } from './files';
import { diffLines } from './diff';

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
	'addrmap device {\n\tname = "New address map";\n\treg {\n\t\tfield { sw = rw; hw = r; } value[0:0] = 0;\n\t} control @0x0;\n};\n';

/** One session per editor component. Source text is the document authority. */
export function createEditorSession(
	options: {
		compiler?: ReturnType<typeof createCompiler>;
		files?: Files['Service'];
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
	let hasDocument = $state(false);
	let canWriteBack = $state(false);
	let history = $state.raw<Compilation[]>([]);
	let future = $state.raw<Compilation[]>([]);
	let handle: WritableFileHandle | undefined;
	let disposed = false;
	let newDraft = false;
	let activeTask: AbortController | undefined;
	const compiler = options.compiler ?? createCompiler();
	const runtime = ManagedRuntime.make(
		options.files ? Layer.succeed(Files, options.files) : browserFiles
	);
	const dirty = $derived(hasDocument && source !== baseline);
	const diff = $derived(diffLines(baseline, source));

	function accept(next: Compilation) {
		compilation = next;
		source = next.source;
		if (!next.nodes.some((node) => node.id === selectedId)) selectedId = next.roots[0]?.id ?? '';
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
					Effect.as(true),
					Effect.catch((cause) =>
						Effect.sync(() => {
							if (disposed) return false;
							if (typeof cause === 'object' && cause && 'cancelled' in cause && cause.cancelled)
								return false;
							if (isSave) saveFailed = true;
							error =
								cause instanceof Error ? cause.message : 'The operation could not be completed.';
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
			}
			return false;
		} finally {
			activeTask = undefined;
			busy = false;
		}
	}
	function load(name: string, text: string, fileHandle?: WritableFileHandle, isNew = false) {
		return Effect.suspend(() => compiler.compile(text)).pipe(
			Effect.map((next) => {
				if (disposed) return;
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
		}
	}
	const session = {
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
		edit(command: EditCommand) {
			if (!hasDocument || !compilation.valid) return Promise.resolve(false);
			return task(
				compiler.compile(source, $state.snapshot(command)).pipe(
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
							history = [...history, compilation].slice(-100);
							future = [];
							accept(next);
							status = 'Changes pending';
						});
					})
				),
				'edit'
			);
		},
		undo() {
			if (disposed || busy || !history.length) return;
			future = [...future, compilation];
			const previous = history.at(-1)!;
			history = history.slice(0, -1);
			accept(previous);
			error = '';
			status = 'Edit undone';
		},
		redo() {
			if (disposed || busy || !future.length) return;
			history = [...history, compilation];
			const next = future.at(-1)!;
			future = future.slice(0, -1);
			accept(next);
			error = '';
			status = 'Edit restored';
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
				newDraft = false;
				history = [];
				future = [];
				error = '';
				status = '';
				handle = undefined;
				canWriteBack = false;
				return Promise.resolve(true);
			}
			return task(
				compiler.compile(baseline).pipe(
					Effect.map((next) => {
						if (disposed) return;
						accept(next);
						history = [];
						future = [];
						status = 'Changes discarded';
					})
				)
			);
		},
		save() {
			if (!hasDocument || !compilation.valid) return Promise.resolve(false);
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
			disposed = true;
			activeTask?.abort();
			compiler.dispose();
			void runtime.dispose();
		}
	};
	return session;
}

export type EditorSession = ReturnType<typeof createEditorSession>;
