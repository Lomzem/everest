import { Effect, Schema } from 'effect';
import { RdlDocumentSchema, decodeRdlDocument } from '$lib/rdl/schema';
import type { RdlDocument } from '$lib/rdl/model';
import type { AppView, SelectionKind } from '$lib/rdl/hierarchy';

const storageKey = 'everest.editorSession';
const sessionVersion = 1;

const SelectionSnapshotSchema = Schema.Struct({
	selectedKind: Schema.Literal('folder', 'register'),
	selectedRegisterId: Schema.String,
	selectedGroupPath: Schema.String,
	selectedFieldId: Schema.String,
});

const HistoryEntrySchema = Schema.Struct({
	documentBefore: RdlDocumentSchema,
	documentAfter: RdlDocumentSchema,
	selectionBefore: SelectionSnapshotSchema,
	selectionAfter: SelectionSnapshotSchema,
	dirtyBefore: Schema.Boolean,
	dirtyAfter: Schema.Boolean,
});

const PersistedEditorSessionSchema = Schema.Struct({
	version: Schema.Literal(sessionVersion),
	savedAt: Schema.Number,
	appView: Schema.Literal('welcome', 'editor'),
	document: RdlDocumentSchema,
	currentPath: Schema.String,
	dirty: Schema.Boolean,
	selection: SelectionSnapshotSchema,
	undoStack: Schema.Array(HistoryEntrySchema),
	redoStack: Schema.Array(HistoryEntrySchema),
});

export interface SelectionSnapshot {
	selectedKind: SelectionKind;
	selectedRegisterId: string;
	selectedGroupPath: string;
	selectedFieldId: string;
}

export interface HistoryEntry {
	documentBefore: RdlDocument;
	documentAfter: RdlDocument;
	selectionBefore: SelectionSnapshot;
	selectionAfter: SelectionSnapshot;
	dirtyBefore: boolean;
	dirtyAfter: boolean;
}

export interface PersistedEditorSession {
	version: typeof sessionVersion;
	savedAt: number;
	appView: AppView;
	document: RdlDocument;
	currentPath: string;
	dirty: boolean;
	selection: SelectionSnapshot;
	undoStack: HistoryEntry[];
	redoStack: HistoryEntry[];
}

export function readPersistedEditorSession(): PersistedEditorSession | undefined {
	if (typeof window === 'undefined') return undefined;

	const stored = window.localStorage.getItem(storageKey);
	if (!stored) return undefined;

	let parsed: unknown;
	try {
		parsed = JSON.parse(stored);
	} catch {
		clearPersistedEditorSession();
		return undefined;
	}

	const decoded = Effect.runSyncExit(Schema.decodeUnknown(PersistedEditorSessionSchema)(parsed));
	if (decoded._tag === 'Failure') {
		clearPersistedEditorSession();
		return undefined;
	}

	return normalizeSession(decoded.value as PersistedEditorSession);
}

export function writePersistedEditorSession(
	session: Omit<PersistedEditorSession, 'version' | 'savedAt'>,
) {
	if (typeof window === 'undefined') return;

	try {
		window.localStorage.setItem(
			storageKey,
			JSON.stringify({ ...session, version: sessionVersion, savedAt: Date.now() }),
		);
	} catch {
		// In-memory history still works if storage is unavailable or full.
	}
}

export function clearPersistedEditorSession() {
	if (typeof window === 'undefined') return;
	window.localStorage.removeItem(storageKey);
}

function normalizeSession(session: PersistedEditorSession): PersistedEditorSession | undefined {
	const document = Effect.runSyncExit(decodeRdlDocument(session.document));
	if (document._tag === 'Failure') {
		clearPersistedEditorSession();
		return undefined;
	}

	try {
		return {
			...session,
			document: document.value,
			undoStack: session.undoStack.map(normalizeHistoryEntry),
			redoStack: session.redoStack.map(normalizeHistoryEntry),
		};
	} catch {
		clearPersistedEditorSession();
		return undefined;
	}
}

function normalizeHistoryEntry(entry: HistoryEntry): HistoryEntry {
	return {
		...entry,
		documentBefore: Effect.runSync(decodeRdlDocument(entry.documentBefore)),
		documentAfter: Effect.runSync(decodeRdlDocument(entry.documentAfter)),
	};
}
