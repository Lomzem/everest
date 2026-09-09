import { afterEach, describe, expect, it, vi } from 'vitest';
import { Effect } from 'effect';
import type { Compilation, EditCommand } from '$lib/rdl/types';
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
		expect(session.source).toContain('field');
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
