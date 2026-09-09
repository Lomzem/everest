import { Effect, Schema } from 'effect';
import type { Compilation, EditCommand } from '$lib/rdl/types';

export class CompilerError extends Schema.TaggedError<CompilerError>()('CompilerError', {
	message: Schema.String
}) {}

interface Request {
	resolve: (value: Compilation) => void;
	reject: (cause: unknown) => void;
	cleanup: () => void;
}

/** A worker keeps parsing and validation off the UI thread. */
export function createCompiler() {
	let worker: Worker | undefined;
	let disposed = false;
	let nextId = 0;
	const pending = new Map<number, Request>();

	function stop(cause: Error) {
		worker?.terminate();
		worker = undefined;
		for (const request of pending.values()) {
			request.cleanup();
			request.reject(cause);
		}
		pending.clear();
	}

	function getWorker() {
		if (worker) return worker;
		worker = new Worker(new URL('./compiler.worker.ts', import.meta.url), { type: 'module' });
		worker.onmessage = (
			event: MessageEvent<{ id: number; compilation?: Compilation; error?: string }>
		) => {
			const request = pending.get(event.data.id);
			if (!request) return;
			request.cleanup();
			pending.delete(event.data.id);
			if (event.data.compilation) request.resolve(event.data.compilation);
			else request.reject(new Error(event.data.error ?? 'Compilation failed.'));
		};
		worker.onerror = () => stop(new Error('The compiler worker stopped. Try the operation again.'));
		worker.onmessageerror = () => stop(new Error('The compiler result could not be read.'));
		return worker;
	}

	return {
		compile: (source: string, command?: EditCommand) =>
			Effect.tryPromise({
				try: (signal) =>
					new Promise<Compilation>((resolve, reject) => {
						if (disposed || signal.aborted) {
							reject(new Error('Compilation stopped.'));
							return;
						}
						const id = ++nextId;
						// Parsing is synchronous inside the worker. Termination is needed to stop it.
						const cancel = () => stop(new Error('Compilation cancelled.'));
						const timer = setTimeout(() => stop(new Error('Compilation took too long.')), 30_000);
						const cleanup = () => {
							clearTimeout(timer);
							signal.removeEventListener('abort', cancel);
						};
						pending.set(id, { resolve, reject, cleanup });
						signal.addEventListener('abort', cancel, { once: true });
						try {
							getWorker().postMessage({ id, source, command });
						} catch (cause) {
							cleanup();
							pending.delete(id);
							reject(cause);
						}
					}),
				catch: (cause) =>
					new CompilerError({
						message: cause instanceof Error ? cause.message : 'Compilation failed.'
					})
			}),
		dispose() {
			disposed = true;
			stop(new Error('Compilation stopped.'));
		}
	};
}
