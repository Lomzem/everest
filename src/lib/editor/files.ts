import { Context, Effect, Layer, Schema } from 'effect';

export interface WritableFileHandle {
	name: string;
	getFile(): Promise<File>;
	createWritable(options?: { mode: 'exclusive' }): Promise<{
		write(data: string): Promise<void>;
		close(): Promise<void>;
		abort(): Promise<void>;
	}>;
}
interface PickerWindow extends Window {
	showOpenFilePicker?: (options: object) => Promise<WritableFileHandle[]>;
}
export interface OpenedFile {
	name: string;
	source: string;
	handle?: WritableFileHandle;
}
export class FileError extends Schema.TaggedError<FileError>()('FileError', {
	message: Schema.String,
	cancelled: Schema.Boolean
}) {}
const fileError = (cause: unknown) =>
	new FileError({
		message: cause instanceof Error ? cause.message : 'The file operation failed.',
		cancelled: cause instanceof Error && cause.name === 'AbortError'
	});

// File.text() removes a UTF-8 BOM. Keep it so saving does not alter untouched source.
async function readSource(file: File) {
	try {
		return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
			await file.arrayBuffer()
		);
	} catch (cause) {
		if (cause instanceof TypeError) throw new Error('The file is not valid UTF-8.', { cause });
		throw cause;
	}
}

export class Files extends Context.Service<
	Files,
	{
		open: (file?: File) => Effect.Effect<OpenedFile, FileError>;
		write: (
			handle: WritableFileHandle,
			source: string,
			baseline: string
		) => Effect.Effect<void, FileError>;
		download: (filename: string, source: string) => Effect.Effect<void, FileError>;
	}
>()('everest/Files') {}

export const browserFiles = Layer.succeed(
	Files,
	Files.of({
		open: (file) =>
			Effect.tryPromise({
				try: async (signal) => {
					if (file) return { name: file.name, source: await readSource(file) };
					const picker = (window as PickerWindow).showOpenFilePicker;
					if (picker) {
						const [handle] = await picker.call(window, {
							multiple: false,
							types: [{ description: 'SystemRDL', accept: { 'text/plain': ['.rdl'] } }]
						});
						signal.throwIfAborted();
						if (!handle) throw new DOMException('Open cancelled.', 'AbortError');
						return { name: handle.name, source: await readSource(await handle.getFile()), handle };
					}
					return new Promise<OpenedFile>((resolve, reject) => {
						const input = document.createElement('input');
						input.type = 'file';
						input.accept = '.rdl';
						input.hidden = true;
						const clean = () => {
							input.remove();
							signal.removeEventListener('abort', cancel);
							input.removeEventListener('cancel', cancel);
							input.removeEventListener('change', change);
						};
						const cancel = () => {
							clean();
							reject(new DOMException('Open cancelled.', 'AbortError'));
						};
						const change = async () => {
							try {
								const selected = input.files?.[0];
								if (!selected) throw new DOMException('Open cancelled.', 'AbortError');
								resolve({ name: selected.name, source: await readSource(selected) });
							} catch (cause) {
								reject(cause);
							} finally {
								clean();
							}
						};
						if (signal.aborted) return cancel();
						signal.addEventListener('abort', cancel, { once: true });
						input.addEventListener('cancel', cancel, { once: true });
						input.addEventListener('change', change, { once: true });
						try {
							document.body.append(input);
							input.click();
						} catch (cause) {
							clean();
							reject(cause);
						}
					});
				},
				catch: fileError
			}),
		write: (handle, source, baseline) =>
			Effect.tryPromise({
				try: async (signal) => {
					const check = async () => {
						signal.throwIfAborted();
						if ((await readSource(await handle.getFile())) !== baseline) {
							throw new Error(
								'This file changed outside Everest. Download your changes or reopen the file before saving.'
							);
						}
						signal.throwIfAborted();
					};
					await check();
					const stream = await handle.createWritable({ mode: 'exclusive' });
					try {
						await check();
						await stream.write(source);
						// The target is unchanged until close. Recheck after staging the new content.
						await check();
						await stream.close();
					} catch (cause) {
						await stream.abort().catch(() => undefined);
						throw cause;
					}
				},
				catch: fileError
			}),
		download: (filename, source) =>
			Effect.try({
				try: () => {
					const url = URL.createObjectURL(new Blob([source], { type: 'text/plain;charset=utf-8' }));
					const link = document.createElement('a');
					try {
						link.href = url;
						link.download = filename;
						document.body.append(link);
						link.click();
					} catch (cause) {
						URL.revokeObjectURL(url);
						throw cause;
					} finally {
						link.remove();
					}
					setTimeout(() => URL.revokeObjectURL(url), 60_000);
				},
				catch: fileError
			})
	})
);
