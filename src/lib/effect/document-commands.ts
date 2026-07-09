import { Effect } from 'effect';
import type { RdlDocument } from '$lib/rdl/model';
import { exportRdlDocument } from '$lib/rdl/export';
import {
	decodeRdlDocument,
	validateRdlDocument,
	type DocumentValidationFailed,
} from '$lib/rdl/schema';
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
		const document = yield* decodeRdlDocument(result.document);
		return { path: result.path, document };
	});
}

function saveAsSuggestedPath(options: SaveDocumentOptions) {
	if (!options.currentPath) return options.suggestedPath;
	return options.currentPath.split(/[\\/]/).filter(Boolean).at(-1) ?? options.suggestedPath;
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
		const document = yield* decodeRdlDocument(options.document).pipe(
			Effect.flatMap(validateRdlDocument),
		);
		const content = exportRdlDocument(document);

		if (!options.currentPath || options.saveAs) {
			const result = yield* desktop.saveRdlFileAs(content, saveAsSuggestedPath(options));
			if (!result) return { path: options.currentPath, saved: false };
			return { path: result.path, saved: true };
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
