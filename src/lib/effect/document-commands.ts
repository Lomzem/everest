import { Effect } from 'effect';
import type { RdlDocument } from '$lib/rdl/model';
import { exportRdlDocument } from '$lib/rdl/export';
import { decodeRdlDocument, type DocumentValidationFailed } from '$lib/rdl/schema';
import { prepareSourceBackedDocument, sourceContentFor } from '$lib/rdl/source-edits';
import { DesktopBridge, DesktopUnavailable, type DesktopError } from './desktop';

export interface LoadedDocument {
	readonly path: string;
	readonly document: RdlDocument;
}

export interface SaveDocumentOptions {
	readonly document: RdlDocument;
	readonly currentPath: string;
	readonly saveAs: boolean;
	readonly suggestedPath: string;
}

export interface SyncWindowOptions {
	readonly title: string;
	readonly dirty: boolean;
}

export function openDocument(): Effect.Effect<
	LoadedDocument | null,
	DesktopError | DocumentValidationFailed,
	DesktopBridge
> {
	return Effect.gen(function* () {
		const desktop = yield* DesktopBridge;
		const result = yield* desktop.openRdlFile;
		if (!result) return null;
		const document = yield* decodeRdlDocument({
			...result.document,
			source: result.source ?? result.document.source,
		});
		return { path: result.path, document: prepareSourceBackedDocument(document) };
	});
}

function saveContentFor(document: RdlDocument) {
	if (document.source?.editRanges) return sourceContentFor(document);
	return document.source?.text ?? exportRdlDocument(document);
}

export function saveDocument(
	options: SaveDocumentOptions,
): Effect.Effect<
	{ readonly path: string; readonly saved: boolean },
	DesktopError | DocumentValidationFailed,
	DesktopBridge
> {
	return Effect.gen(function* () {
		const desktop = yield* DesktopBridge;
		const document = yield* decodeRdlDocument(options.document);
		const content = saveContentFor(document);

		if (!options.currentPath || options.saveAs) {
			const result = yield* desktop.saveRdlFileAs(
				content,
				options.currentPath || options.suggestedPath,
			);
			return result
				? { path: result.path, saved: true }
				: { path: options.currentPath, saved: false };
		}

		yield* desktop.saveRdlFile(options.currentPath, content);
		return { path: options.currentPath, saved: true };
	});
}

export function syncWindowState(
	options: SyncWindowOptions,
): Effect.Effect<void, never, DesktopBridge> {
	return Effect.gen(function* () {
		const desktop = yield* DesktopBridge;
		yield* desktop.setDocumentEdited(options.dirty).pipe(Effect.catchAll(() => Effect.void));
		yield* desktop.setWindowTitle(options.title).pipe(Effect.catchAll(() => Effect.void));
	});
}

export function quitApplication(): Effect.Effect<void, never, DesktopBridge> {
	return Effect.gen(function* () {
		const desktop = yield* DesktopBridge;
		yield* desktop.quitApplication.pipe(Effect.catchAll(() => Effect.void));
	});
}

export function shouldIgnoreUnavailable(error: unknown) {
	return error instanceof DesktopUnavailable;
}
