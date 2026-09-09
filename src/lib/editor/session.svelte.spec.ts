import { afterEach, describe, expect, it, vi } from 'vitest';
import { Effect } from 'effect';
import type { Compilation, EditCommand } from '$lib/rdl/types';
import { compile as compileRdl, applyEdit } from '$lib/rdl';
import { CompilerError } from './compiler';
import { Files, FileError, type WritableFileHandle } from './files';
import { createEditorSession, type EditorSession } from './session.svelte';

const sessions: EditorSession[] = [];
afterEach(() => {
	sessions.forEach((session) => session.dispose());
	sessions.length = 0;
});

function fixture(initial = 'original', native = false) {
	const handle = {} as WritableFileHandle;
	const write = vi.fn(() => Effect.void);
	const download = vi.fn(() => Effect.void);
	const compiler = {
		compile: vi.fn(
			(source: string, command?: EditCommand): Effect.Effect<Compilation, CompilerError> =>
				Effect.sync(() => {
					const next = command ? `${source}\nedited` : source;
					return {
						source: next,
						roots: [],
						nodes: [],
						properties: [],
						enums: [],
						diagnostics: [],
						valid: next !== 'invalid'
					};
				})
		),
		dispose: vi.fn()
	};
	const files = Files.of({
		reopen: (handle) => Effect.succeed({ name: 'sample.rdl', source: initial, handle }),
		chooseSaveTarget: () => Effect.succeed(undefined),
		open: () =>
			Effect.succeed({ name: 'sample.rdl', source: initial, handle: native ? handle : undefined }),
		write,
		download
	});
	const session = createEditorSession({ compiler, files });
	sessions.push(session);
	return { session, compiler, files, write, download };
}
const edit: EditCommand = { type: 'rename', nodeId: 'device', name: 'renamed' };

describe('document baseline and history', () => {
	it('clears only edit errors on selection and keeps save recovery available', async () => {
		const { session, compiler, files } = fixture('original', true);
		await session.open();
		compiler.compile.mockReturnValueOnce(
			Effect.fail(new CompilerError({ message: 'Invalid field value' }))
		);
		await session.edit(edit);
		expect(session.error).toBe('Invalid field value');
		session.select('other');
		expect(session.error).toBe('');
		files.write = () =>
			Effect.fail(new FileError({ message: 'External file conflict', cancelled: false }));
		await session.save();
		expect(session.saveFailed).toBe(true);
		session.select('other');
		expect(session.error).toBe('External file conflict');
		await session.download();
		expect(session.baseline).toBe('original');
		expect(session.saveFailed).toBe(true);
		files.write = () => Effect.void;
		await session.save();
		expect(session.saveFailed).toBe(false);
	});
	it('does not mark a cancelled save as failed', async () => {
		const { session, files } = fixture('original', true);
		await session.open();
		files.write = () => Effect.fail(new FileError({ message: 'Cancelled', cancelled: true }));
		await session.save();
		expect(session.saveFailed).toBe(false);
		expect(session.error).toBe('');
	});

	it('keeps the opened baseline when a fallback save starts a download', async () => {
		const { session, download } = fixture();
		await session.open();
		await session.edit(edit);
		const diff = session.diff;
		expect(await session.save()).toBe(true);
		expect(download).toHaveBeenCalledWith('sample.rdl', 'original\nedited');
		expect(session.baseline).toBe('original');
		expect(session.dirty).toBe(true);
		expect(session.diff).toEqual(diff);
	});

	it('keeps undo history after saving and compares undo with the saved text', async () => {
		const { session, write } = fixture('original', true);
		await session.open();
		await session.edit(edit);
		await session.save();
		expect(write).toHaveBeenCalledOnce();
		expect(session.baseline).toBe('original\nedited');
		expect(session.dirty).toBe(false);
		expect(session.canUndo).toBe(true);
		session.undo();
		expect(session.source).toBe('original');
		expect(session.dirty).toBe(true);
		session.redo();
		expect(session.dirty).toBe(false);
	});

	it('retains the baseline and pending edits when a native write fails', async () => {
		const { session, files } = fixture('original', true);
		files.write = () =>
			Effect.fail(new FileError({ message: 'File changed outside Everest.', cancelled: false }));
		await session.open();
		await session.edit(edit);
		expect(await session.save()).toBe(false);
		expect(session.baseline).toBe('original');
		expect(session.source).toBe('original\nedited');
		expect(session.canUndo).toBe(true);
		expect(session.error).toContain('changed outside');
	});

	it('starts a new draft against an empty baseline and closes it on discard', async () => {
		const { session } = fixture();
		await session.newDocument();
		expect(session.source).toContain('addrmap untitled_addrmap');
		expect(session.baseline).toBe('');
		expect(session.dirty).toBe(true);
		await session.discard();
		expect(session.hasDocument).toBe(false);
		expect(session.diff).toEqual([]);
	});

	it('does not treat an opened empty file as an unsaved draft', async () => {
		const { session } = fixture('');
		await session.open();
		await session.discard();
		expect(session.hasDocument).toBe(true);
		expect(session.filename).toBe('sample.rdl');
		expect(session.source).toBe('');
	});

	it('does not accept invalid edits or lose the current history', async () => {
		const { session, compiler } = fixture();
		await session.open();
		compiler.compile.mockReturnValueOnce(
			Effect.succeed({
				source: 'bad edit',
				roots: [],
				nodes: [],
				properties: [],
				enums: [],
				valid: false,
				diagnostics: [
					{
						severity: 'error',
						code: 'invalid',
						message: 'Invalid edit.',
						line: 1,
						column: 1,
						range: { start: 0, end: 1 }
					}
				]
			})
		);
		expect(await session.edit(edit)).toBe(false);
		expect(session.source).toBe('original');
		expect(session.canUndo).toBe(false);
		expect(session.error).toBe('Invalid edit.');
	});

	it('disables visual edits and saves for an invalid opened file', async () => {
		const { session, compiler, write, download } = fixture('invalid');
		await session.open();
		expect(await session.edit(edit)).toBe(false);
		expect(await session.save()).toBe(false);
		expect(compiler.compile).toHaveBeenCalledOnce();
		expect(write).not.toHaveBeenCalled();
		expect(download).not.toHaveBeenCalled();
	});

	it('cancels an open operation on disposal and does not accept its late result', async () => {
		const { session, files, compiler } = fixture();
		let signal: AbortSignal | undefined;
		let finish: ((value: { name: string; source: string }) => void) | undefined;
		files.open = () =>
			Effect.promise((abort) => {
				signal = abort;
				return new Promise((resolve) => {
					finish = resolve;
				});
			});
		const opening = session.open();
		await vi.waitFor(() => expect(signal).toBeDefined());
		expect(await session.newDocument()).toBe(false);
		session.dispose();
		expect(signal?.aborted).toBe(true);
		finish?.({ name: 'late.rdl', source: 'late' });
		expect(await opening).toBe(false);
		expect(session.hasDocument).toBe(false);
		expect(compiler.compile).not.toHaveBeenCalled();
	});
});

it('passes plain nested command data to the worker boundary', async () => {
	const { session, compiler } = fixture();
	await session.open();
	compiler.compile.mockImplementationOnce((source, command) => {
		const plain = structuredClone(command);
		expect(plain).toEqual({
			type: 'upsert-property-definition',
			definition: { name: 'modes', type: 'string[]', components: ['field'], defaultText: "'{}" }
		});
		return Effect.succeed({ ...session.compilation, source });
	});
	const components = new Proxy(['field'], {});
	expect(
		await session.edit({
			type: 'upsert-property-definition',
			definition: { name: 'modes', type: 'string[]', components, defaultText: "'{}" }
		})
	).toBe(true);
});

describe('selection across rename', () => {
	function documentSession() {
		const setup = fixture(
			'addrmap device {reg {field {} value;} control;reg {field {} value;} control2;};'
		);
		setup.compiler.compile.mockImplementation((source, command) =>
			Effect.sync(() => {
				const current = compileRdl(source);
				return command ? compileRdl(applyEdit(current, command)) : current;
			})
		);
		return setup.session;
	}
	it('keeps the renamed child selected and restores selection with undo and redo', async () => {
		const session = documentSession();
		await session.open();
		session.select('device.control');
		expect(await session.edit({ type: 'rename', nodeId: 'device.control', name: 'config' })).toBe(
			true
		);
		expect(session.selectedId).toBe('device.config');
		session.undo();
		expect(session.selectedId).toBe('device.control');
		session.redo();
		expect(session.selectedId).toBe('device.config');
	});
	it('maps the selected descendant across an ancestor rename', async () => {
		const session = documentSession();
		await session.open();
		session.select('device.control.value');
		expect(await session.edit({ type: 'rename', nodeId: 'device.control', name: 'config' })).toBe(
			true
		);
		expect(session.selectedId).toBe('device.config.value');
		session.undo();
		expect(session.selectedId).toBe('device.control.value');
		session.redo();
		expect(session.selectedId).toBe('device.config.value');
	});
	it('does not map an unrelated component with a matching name prefix', async () => {
		const session = documentSession();
		await session.open();
		session.select('device.control2');
		expect(await session.edit({ type: 'rename', nodeId: 'device.control', name: 'config' })).toBe(
			true
		);
		expect(session.selectedId).toBe('device.control2');
		session.undo();
		expect(session.selectedId).toBe('device.control2');
	});
});

describe('Save As and close', () => {
	it('adopts a Save As target only after its write succeeds', async () => {
		const { session, files, write } = fixture();
		const handle = { name: 'copy.rdl' } as WritableFileHandle;
		files.chooseSaveTarget = () =>
			Effect.succeed({ name: handle.name, handle, source: 'previous' });
		await session.open();
		await session.edit(edit);
		expect(await session.saveAs()).toBe(true);
		expect(write).toHaveBeenCalledWith(handle, session.source, 'previous');
		expect(session.filename).toBe('copy.rdl');
		expect(session.baseline).toBe(session.source);
		expect(session.canWriteBack).toBe(true);
		expect(session.dirty).toBe(false);
	});
	it('keeps the opened target and baseline when Save As fails', async () => {
		const { session, files } = fixture('original', true);
		files.chooseSaveTarget = () =>
			Effect.succeed({ name: 'copy.rdl', handle: {} as WritableFileHandle, source: '' });
		files.write = () => Effect.fail(new FileError({ message: 'Write failed', cancelled: false }));
		await session.open();
		await session.edit(edit);
		expect(await session.saveAs()).toBe(false);
		expect(session.filename).toBe('sample.rdl');
		expect(session.baseline).toBe('original');
		expect(session.dirty).toBe(true);
	});
	it('keeps the baseline for Save As downloads and clears session on close', async () => {
		const { session, download } = fixture();
		await session.open();
		await session.edit(edit);
		await session.saveAs();
		expect(download).toHaveBeenCalledWith('sample.rdl', session.source);
		expect(session.baseline).toBe('original');
		expect(session.close()).toBe(true);
		expect(session.hasDocument).toBe(false);
		expect(session.source).toBe('');
		expect(session.canUndo).toBe(false);
		expect(session.canWriteBack).toBe(false);
	});
});

describe('conflict recovery', () => {
	it('overwrites only after reading the current target and then updates baseline', async () => {
		const { session, files, write } = fixture('original', true);
		files.reopen = (handle) => Effect.succeed({ name: 'sample.rdl', source: 'external', handle });
		await session.open();
		await session.edit(edit);
		await session.overwrite();
		expect(write).toHaveBeenCalledWith(expect.anything(), session.source, 'external');
		expect(session.dirty).toBe(false);
	});
	it('reload replaces source and clears prior history', async () => {
		const { session, files } = fixture('original', true);
		files.reopen = (handle) => Effect.succeed({ name: 'sample.rdl', source: 'external', handle });
		await session.open();
		await session.edit(edit);
		await session.reload();
		expect(session.source).toBe('external');
		expect(session.canUndo).toBe(false);
		expect(session.dirty).toBe(false);
	});
	it('cancelled Save As keeps the original document without an error', async () => {
		const { session, files } = fixture();
		await session.open();
		await session.edit(edit);
		files.chooseSaveTarget = () =>
			Effect.fail(new FileError({ message: 'Cancelled', cancelled: true }));
		expect(await session.saveAs()).toBe(false);
		expect(session.error).toBe('');
		expect(session.dirty).toBe(true);
		expect(session.filename).toBe('sample.rdl');
	});
});
