import { afterEach, describe, expect, it, vi } from 'vitest';
import { Effect } from 'effect';
import type { Compilation } from '$lib/rdl/types';
import { createCompiler } from './compiler';

class TestWorker {
	static instances: TestWorker[] = [];
	onmessage?: (event: { data: { id: number; compilation: Compilation } }) => void;
	onerror?: () => void;
	onmessageerror?: () => void;
	postMessage = vi.fn();
	terminate = vi.fn();
	constructor() {
		TestWorker.instances.push(this);
	}
}

const result: Compilation = {
	source: '',
	roots: [],
	nodes: [],
	diagnostics: [],
	properties: [],
	enums: [],
	valid: true
};

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
	TestWorker.instances = [];
});

describe('compiler worker lifecycle', () => {
	it('stops work on interruption and permits a fresh worker for the next request', async () => {
		vi.stubGlobal('Worker', TestWorker);
		const compiler = createCompiler();
		const controller = new AbortController();
		const cancelled = Effect.runPromise(compiler.compile('old'), { signal: controller.signal });
		const rejection = expect(cancelled).rejects.toBeDefined();
		await vi.waitFor(() => expect(TestWorker.instances).toHaveLength(1));
		controller.abort();
		await rejection;
		expect(TestWorker.instances[0].terminate).toHaveBeenCalledOnce();

		const next = Effect.runPromise(compiler.compile('new'));
		await vi.waitFor(() => expect(TestWorker.instances).toHaveLength(2));
		const worker = TestWorker.instances[1];
		worker.onmessage?.({
			data: { id: worker.postMessage.mock.calls[0][0].id, compilation: result }
		});
		expect(await next).toEqual(result);
		compiler.dispose();
	});

	it('clears a completed request timeout and rejects new work after disposal', async () => {
		vi.stubGlobal('Worker', TestWorker);
		vi.useFakeTimers();
		const compiler = createCompiler();
		const operation = Effect.runPromise(compiler.compile('source'));
		const worker = TestWorker.instances[0];
		worker.onmessage?.({
			data: { id: worker.postMessage.mock.calls[0][0].id, compilation: result }
		});
		await operation;
		await vi.advanceTimersByTimeAsync(30_001);
		expect(worker.terminate).not.toHaveBeenCalled();
		compiler.dispose();
		await expect(Effect.runPromise(compiler.compile('source'))).rejects.toThrow(
			'Compilation stopped'
		);
		expect(TestWorker.instances).toHaveLength(1);
	});

	it('terminates the worker and rejects all requests on timeout', async () => {
		vi.stubGlobal('Worker', TestWorker);
		vi.useFakeTimers();
		const compiler = createCompiler();
		const operation = Effect.runPromise(compiler.compile('source'));
		const rejection = expect(operation).rejects.toThrow('Compilation took too long');
		await vi.advanceTimersByTimeAsync(30_001);
		await rejection;
		expect(TestWorker.instances[0].terminate).toHaveBeenCalledOnce();
		compiler.dispose();
	});
});
