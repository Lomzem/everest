import { afterEach, describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { compile, applyEdit } from '$lib/rdl';
import { CompilerError } from './compiler';
import { Files } from './files';
import { createEditorSession, type EditorSession } from './session.svelte';
import {
	browserWorkspaceStorage,
	PersistenceError,
	type SavedWorkspace,
	type WorkspaceStorage
} from './persistence';
const original = 'addrmap map {reg {field {reset=0;} value[0:0];} control;};';
const changed = original.replace('reset=0', 'reset=1');
const saved: SavedWorkspace = {
	version: 1,
	timestamp: 1_700_000_000_000,
	filename: 'draft.rdl',
	source: changed,
	baseline: original,
	selectedId: 'map.control.value',
	newDraft: false
};
const sessions: EditorSession[] = [];
afterEach(() => {
	for (const session of sessions) session.dispose();
	sessions.length = 0;
});
function memory(initial?: SavedWorkspace) {
	let data = initial;
	const writes: (SavedWorkspace | undefined)[] = [];
	const storage: WorkspaceStorage = {
		load: () => Effect.succeed(data),
		save: (next) =>
			Effect.sync(() => {
				data = next;
				writes.push(next);
			}),
		clear: () =>
			Effect.sync(() => {
				data = undefined;
				writes.push(undefined);
			})
	};
	return {
		storage,
		writes,
		get data() {
			return data;
		}
	};
}
function session(storage: WorkspaceStorage) {
	const compiler = {
		compile: (source: string, command?: import('$lib/rdl').EditCommand) =>
			Effect.try({
				try: () => compile(command ? applyEdit(compile(source), command) : source),
				catch: (cause) => new CompilerError({ message: String(cause) })
			}),
		dispose: () => {}
	};
	const files = Files.of({
		open: () => Effect.succeed({ name: 'draft.rdl', source: original }),
		reopen: () => Effect.succeed({ name: 'draft.rdl', source: original }),
		chooseSaveTarget: () => Effect.succeed(undefined),
		write: () => Effect.void,
		download: () => Effect.void
	});
	const result = createEditorSession({ compiler, files, storage });
	sessions.push(result);
	return result;
}
describe('workspace recovery', () => {
	it('offers recovery before opening a document, then restores source and baseline separately', async () => {
		const store = memory(saved),
			editor = session(store.storage);
		await editor.restore();
		expect(editor.hasDocument).toBe(false);
		expect(editor.pendingRecovery?.filename).toBe('draft.rdl');
		expect(store.writes).toHaveLength(0);
		await editor.resumeRecovery();
		expect(editor.source).toBe(changed);
		expect(editor.baseline).toBe(original);
		expect(editor.selectedId).toBe('map.control.value');
		expect(editor.dirty).toBe(true);
		expect(editor.pendingRecovery).toBeUndefined();
	});
	it('discards stored recovery without opening it', async () => {
		const store = memory(saved),
			editor = session(store.storage);
		await editor.restore();
		expect(await editor.discardRecovery()).toBe(true);
		expect(store.data).toBeUndefined();
		expect(editor.hasDocument).toBe(false);
		expect(editor.pendingRecovery).toBeUndefined();
	});
	it('keeps an invalid recovery on failed resume', async () => {
		const invalid = { ...saved, source: 'not valid RDL' };
		const store = memory(invalid),
			editor = session(store.storage);
		await editor.restore();
		expect(await editor.resumeRecovery()).toBe(false);
		expect(editor.pendingRecovery).toEqual(invalid);
		expect(store.data).toEqual(invalid);
		expect(editor.hasDocument).toBe(false);
	});
	it('does not overwrite recovery after a read failure', async () => {
		const store = memory(saved);
		store.storage.load = () => Effect.fail(new PersistenceError({ message: 'Read failed' }));
		const editor = session(store.storage);
		await editor.restore();
		await editor.flushPersistence();
		editor.dispose();
		expect(store.writes).toHaveLength(0);
		expect(store.data).toEqual(saved);
		expect(editor.persistenceError).toContain('Read failed');
	});
	it('stores only unsaved work and retains fallback download recovery', async () => {
		const store = memory(),
			editor = session(store.storage);
		await editor.open();
		expect(store.data).toBeUndefined();
		await editor.edit({
			type: 'set-property',
			nodeId: 'map.control.value',
			property: 'reset',
			value: '1'
		});
		await editor.flushPersistence();
		expect(store.data?.source).toBe(changed);
		await editor.download();
		expect(store.data?.baseline).toBe(original);
		await editor.discard();
		expect(store.data).toBeUndefined();
	});
	it('continues persistence after a failed write', async () => {
		const store = memory();
		let fail = true;
		const save = store.storage.save;
		store.storage.save = (data) =>
			fail ? Effect.fail(new PersistenceError({ message: 'Quota exceeded' })) : save(data);
		const editor = session(store.storage);
		await editor.open();
		await editor.edit({
			type: 'set-property',
			nodeId: 'map.control.value',
			property: 'reset',
			value: '1'
		});
		await editor.flushPersistence();
		expect(editor.persistenceError).toContain('Quota');
		fail = false;
		await editor.flushPersistence();
		expect(store.data?.source).toBe(changed);
	});
	it('serializes close after an active recovery write', async () => {
		const store = memory();
		let release!: () => void;
		const wait = new Promise<void>((resolve) => {
			release = resolve;
		});
		store.storage.save = (data) =>
			Effect.promise(async () => {
				await wait;
				store.writes.push(data);
			});
		const editor = session(store.storage);
		await editor.open();
		await editor.edit({
			type: 'set-property',
			nodeId: 'map.control.value',
			property: 'reset',
			value: '1'
		});
		const pending = editor.flushPersistence();
		editor.close();
		release();
		await pending;
		await editor.flushPersistence();
		expect(store.writes.at(-1)).toBeUndefined();
		expect(editor.hasDocument).toBe(false);
	});
	it('round trips recovery data through native IndexedDB', async () => {
		await Effect.runPromise(browserWorkspaceStorage.clear());
		await Effect.runPromise(browserWorkspaceStorage.save(saved));
		expect(await Effect.runPromise(browserWorkspaceStorage.load())).toEqual(saved);
		await Effect.runPromise(browserWorkspaceStorage.clear());
		expect(await Effect.runPromise(browserWorkspaceStorage.load())).toBeUndefined();
	});
});
it('recovers invalid form drafts without replacing the valid source', async () => {
	const store = memory(),
		editor = session(store.storage);
	await editor.open();
	editor.setFormDrafts({ 'map.control.value:reset': 'not an integer' });
	await editor.flushPersistence();
	expect(store.data?.source).toBe(original);
	expect(store.data?.formDrafts).toEqual({ 'map.control.value:reset': 'not an integer' });
	expect(editor.dirty).toBe(true);
	const recovered = session(store.storage);
	await recovered.restore();
	await recovered.resumeRecovery();
	expect(recovered.source).toBe(original);
	expect(recovered.compilation.valid).toBe(true);
	expect(recovered.formDrafts['map.control.value:reset']).toBe('not an integer');
});
it('keeps empty folders in undo history and recovery without changing source', async () => {
	const store = memory(),
		editor = session(store.storage);
	await editor.open();
	editor.setEmptyGroups(['Folder', 'Folder/Nested']);
	expect(editor.source).toBe(original);
	expect(editor.dirty).toBe(true);
	expect(editor.canUndo).toBe(true);
	editor.undo();
	expect(editor.emptyGroups).toEqual([]);
	expect(editor.dirty).toBe(false);
	editor.redo();
	expect(editor.emptyGroups).toEqual(['Folder', 'Folder/Nested']);
	await editor.flushPersistence();
	const recovered = session(store.storage);
	await recovered.restore();
	await recovered.resumeRecovery();
	expect(recovered.emptyGroups).toEqual(['Folder', 'Folder/Nested']);
	expect(recovered.source).toBe(original);
	expect(recovered.dirty).toBe(true);
});
it('drops populated folder metadata and restores it when register creation is undone', async () => {
	const store = memory(),
		editor = session(store.storage);
	await editor.open();
	editor.setEmptyGroups(['Folder']);
	await editor.edit({ type: 'move-to-group', nodeId: 'map.control', path: 'Folder' });
	expect(editor.emptyGroups).toEqual([]);
	expect(editor.compilation.groups?.map((g) => g.path)).toEqual(['Folder']);
	editor.undo();
	expect(editor.emptyGroups).toEqual(['Folder']);
	expect(editor.source).toBe(original);
});
it('treats equivalent empty folder updates as a no-op and clears folders on close', async () => {
	const store = memory(),
		editor = session(store.storage);
	await editor.open();
	editor.setEmptyGroups(['Folder']);
	editor.setEmptyGroups(['Folder', 'Folder']);
	editor.undo();
	expect(editor.emptyGroups).toEqual([]);
	expect(editor.canUndo).toBe(false);
	editor.redo();
	editor.close();
	expect(editor.emptyGroups).toEqual([]);
	await editor.flushPersistence();
	expect(store.data).toBeUndefined();
});
