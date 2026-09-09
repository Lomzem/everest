import { afterEach, expect, it, vi } from 'vitest';
import { Effect } from 'effect';
import { browserFiles, Files } from './files';

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

it('removes the fallback file input when opening is interrupted', async () => {
	vi.stubGlobal('showOpenFilePicker', undefined);
	vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
	const controller = new AbortController();
	const opening = Effect.runPromise(
		Effect.flatMap(Files, (files) => files.open()).pipe(Effect.provide(browserFiles)),
		{ signal: controller.signal }
	);
	const rejection = expect(opening).rejects.toBeDefined();
	await vi.waitFor(() => expect(document.querySelector('input[type="file"]')).not.toBeNull());
	controller.abort();
	await rejection;
	expect(document.querySelector('input[type="file"]')).toBeNull();
});
