import { afterEach, describe, expect, it, vi } from 'vitest';
import { Effect } from 'effect';
import { browserFiles, Files, type WritableFileHandle } from './files';

const run = <A>(operation: (files: Files['Service']) => Effect.Effect<A, unknown>) =>
	Effect.runPromise(Effect.flatMap(Files, operation).pipe(Effect.provide(browserFiles)));
afterEach(() => vi.unstubAllGlobals());
describe('browser files', () => {
	it('reads the fallback file without needing a native picker', async () => {
		const file = new File(['addrmap chip {};'], 'sample.rdl');
		expect(await run((files) => files.open(file))).toEqual({
			name: 'sample.rdl',
			source: 'addrmap chip {};'
		});
	});
	it('waits for close before reporting a successful write', async () => {
		const calls: string[] = [];
		const handle: WritableFileHandle = {
			name: 'sample.rdl',
			getFile: async () => new File(['original'], 'sample.rdl'),
			createWritable: async () => ({
				write: async (text) => {
					calls.push(text);
				},
				close: async () => {
					calls.push('closed');
				},
				abort: async () => {}
			})
		};
		await run((files) => files.write(handle, 'updated', 'original'));
		expect(calls).toEqual(['updated', 'closed']);
	});
	it('does not overwrite external changes', async () => {
		const createWritable = vi.fn();
		const handle = {
			name: 'sample.rdl',
			getFile: async () => new File(['external'], 'sample.rdl'),
			createWritable
		};
		await expect(run((files) => files.write(handle, 'updated', 'original'))).rejects.toThrow(
			'changed outside Everest'
		);
		expect(createWritable).not.toHaveBeenCalled();
	});
	it('aborts a failed write', async () => {
		const abort = vi.fn(async () => {}),
			close = vi.fn(async () => {});
		const handle = {
			name: 'sample.rdl',
			getFile: async () => new File(['original'], 'sample.rdl'),
			createWritable: async () => ({
				write: async () => {
					throw new Error('disk full');
				},
				close,
				abort
			})
		};
		await expect(run((files) => files.write(handle, 'updated', 'original'))).rejects.toThrow(
			'disk full'
		);
		expect(abort).toHaveBeenCalledOnce();
		expect(close).not.toHaveBeenCalled();
	});
});

describe('source preservation and write conflicts', () => {
	it('preserves a UTF-8 BOM and CRLF when reading', async () => {
		const source = '\uFEFFaddrmap device {};\r\n';
		expect((await run((files) => files.open(new File([source], 'sample.rdl')))).source).toBe(
			source
		);
	});
	it('rejects invalid UTF-8 instead of silently replacing bytes', async () => {
		await expect(
			run((files) => files.open(new File([new Uint8Array([0xc3, 0x28])], 'sample.rdl')))
		).rejects.toThrow('not valid UTF-8');
	});
	it('checks for external changes made while a write is staged', async () => {
		let disk = 'original';
		const close = vi.fn(async () => {});
		const abort = vi.fn(async () => {});
		const createWritable = vi.fn(async () => ({
			write: async () => {
				disk = 'external';
			},
			close,
			abort
		}));
		const handle = {
			name: 'sample.rdl',
			getFile: async () => new File([disk], 'sample.rdl'),
			createWritable
		};
		await expect(run((files) => files.write(handle, 'updated', 'original'))).rejects.toThrow(
			'changed outside Everest'
		);
		expect(createWritable).toHaveBeenCalledWith({ mode: 'exclusive' });
		expect(close).not.toHaveBeenCalled();
		expect(abort).toHaveBeenCalledOnce();
	});
	it('does not strip the BOM when checking the saved baseline', async () => {
		const source = '\uFEFForiginal';
		const close = vi.fn(async () => {});
		const handle = {
			name: 'sample.rdl',
			getFile: async () => new File([source], 'sample.rdl'),
			createWritable: async () => ({ write: async () => {}, close, abort: async () => {} })
		};
		await run((files) => files.write(handle, '\uFEFFupdated', source));
		expect(close).toHaveBeenCalledOnce();
	});
});
