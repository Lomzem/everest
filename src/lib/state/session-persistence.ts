import { Data, Effect, Schema } from 'effect';
import { RdlDocumentSchema, decodeRdlDocument } from '$lib/rdl/schema';
import type { RdlDocument } from '$lib/rdl/model';
import type { AppView, SelectionKind } from '$lib/rdl/hierarchy';

const storageKey = 'everest.editorSession';
const sessionVersion = 1;

class PersistedSessionInvalid extends Data.TaggedError('PersistedSessionInvalid')<{
	readonly cause: unknown;
}> {}

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

	const session = Effect.runSyncExit(readPersistedEditorSessionEffect());
	if (session._tag === 'Failure') {
		clearPersistedEditorSession();
		return undefined;
	}

	return session.value;
}

export function writePersistedEditorSession(
	session: Omit<PersistedEditorSession, 'version' | 'savedAt'>,
) {
	if (typeof window === 'undefined') return;

	Effect.runSync(
		Effect.ignore(
			Effect.try({
				try: () =>
					window.localStorage.setItem(
						storageKey,
						JSON.stringify({ ...session, version: sessionVersion, savedAt: Date.now() }),
					),
				catch: (cause) => new PersistedSessionInvalid({ cause }),
			}),
		),
	);
}

export function clearPersistedEditorSession() {
	if (typeof window === 'undefined') return;
	Effect.runSync(
		Effect.ignore(
			Effect.try({
				try: () => window.localStorage.removeItem(storageKey),
				catch: (cause) => new PersistedSessionInvalid({ cause }),
			}),
		),
	);
}

function readPersistedEditorSessionEffect(): Effect.Effect<
	PersistedEditorSession | undefined,
	PersistedSessionInvalid
> {
	return Effect.gen(function* () {
		const stored = yield* Effect.try({
			try: () => window.localStorage.getItem(storageKey),
			catch: (cause) => new PersistedSessionInvalid({ cause }),
		});
		if (!stored) return undefined;

		const parsed = yield* Effect.try({
			try: () => JSON.parse(stored) as unknown,
			catch: (cause) => new PersistedSessionInvalid({ cause }),
		});
		const session = yield* Schema.decodeUnknown(PersistedEditorSessionSchema)(parsed).pipe(
			Effect.map((decoded) => decoded as PersistedEditorSession),
			Effect.mapError((cause) => new PersistedSessionInvalid({ cause })),
		);

		return yield* normalizeSession(session);
	});
}

function normalizeSession(
	session: PersistedEditorSession,
): Effect.Effect<PersistedEditorSession, PersistedSessionInvalid> {
	return Effect.gen(function* () {
		const document = yield* decodeRdlDocument(session.document).pipe(
			Effect.mapError((cause) => new PersistedSessionInvalid({ cause })),
		);
		const undoStack = yield* Effect.forEach(session.undoStack, normalizeHistoryEntry);
		const redoStack = yield* Effect.forEach(session.redoStack, normalizeHistoryEntry);

		return {
			...session,
			document,
			undoStack,
			redoStack,
		};
	});
}

function normalizeHistoryEntry(
	entry: HistoryEntry,
): Effect.Effect<HistoryEntry, PersistedSessionInvalid> {
	return Effect.gen(function* () {
		const documentBefore = yield* decodeRdlDocument(entry.documentBefore).pipe(
			Effect.mapError((cause) => new PersistedSessionInvalid({ cause })),
		);
		const documentAfter = yield* decodeRdlDocument(entry.documentAfter).pipe(
			Effect.mapError((cause) => new PersistedSessionInvalid({ cause })),
		);

		return {
			...entry,
			documentBefore,
			documentAfter,
		};
	});
}
