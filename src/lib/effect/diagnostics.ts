import { Data, Effect, Schema } from 'effect';
import type { DiagnosticLogEntry, DiagnosticLogResult } from '$lib/desktop-api';
import { DesktopBridge } from './desktop';

const browserStorageKey = 'everest.diagnostics';
const browserDiagnosticsPath = 'Browser local storage: everest.diagnostics';
const maxDetailLength = 2_000;

const DiagnosticLogEntrySchema = Schema.Struct({
	version: Schema.Literal(1),
	timestamp: Schema.String,
	level: Schema.Literal('error'),
	source: Schema.String,
	message: Schema.String,
	details: Schema.optional(Schema.String),
});

export class DiagnosticsPersistenceFailed extends Data.TaggedError('DiagnosticsPersistenceFailed')<{
	readonly operation: string;
	readonly cause: unknown;
}> {}

export interface DiagnosticLogSnapshot {
	readonly path: string;
	readonly entries: DiagnosticLogEntry[];
	readonly ignoredLines: number;
}

export interface DiagnosticErrorInput {
	readonly source: string;
	readonly error: unknown;
}

export function createDiagnosticLogEntry(input: DiagnosticErrorInput): DiagnosticLogEntry {
	return {
		version: 1,
		timestamp: new Date().toISOString(),
		level: 'error',
		source: input.source,
		message: diagnosticMessage(input.error),
		details: diagnosticDetails(input.error),
	};
}

export function parseDiagnosticLogContent(content: string): {
	readonly entries: DiagnosticLogEntry[];
	readonly ignoredLines: number;
} {
	let ignoredLines = 0;
	const entries: DiagnosticLogEntry[] = [];

	for (const line of content.split(/\r?\n/)) {
		if (!line.trim()) continue;
		try {
			entries.push(Schema.decodeUnknownSync(DiagnosticLogEntrySchema)(JSON.parse(line)));
		} catch {
			ignoredLines += 1;
		}
	}

	return { entries, ignoredLines };
}

export const appendDiagnosticError = (input: DiagnosticErrorInput) =>
	appendDiagnosticLogEntry(createDiagnosticLogEntry(input));

export function appendDiagnosticLogEntry(
	entry: DiagnosticLogEntry,
): Effect.Effect<void, never, DesktopBridge> {
	return Effect.gen(function* () {
		const desktop = yield* DesktopBridge;
		const api = yield* desktop.api;
		if (api) {
			return yield* desktop.appendDiagnosticLog(entry).pipe(
				Effect.catchAll(() => appendBrowserDiagnosticLog(entry)),
				Effect.ignore,
			);
		}
		return yield* appendBrowserDiagnosticLog(entry).pipe(Effect.ignore);
	});
}

export const readDiagnostics = (): Effect.Effect<
	DiagnosticLogSnapshot,
	DiagnosticsPersistenceFailed,
	DesktopBridge
> =>
	Effect.gen(function* () {
		const desktop = yield* DesktopBridge;
		const api = yield* desktop.api;
		const result = api
			? yield* desktop.readDiagnosticLogs.pipe(
					Effect.mapError(
						(cause) => new DiagnosticsPersistenceFailed({ operation: 'read', cause }),
					),
				)
			: yield* readBrowserDiagnosticLogs();
		const parsed = parseDiagnosticLogContent(result.content);
		return { path: result.path, ...parsed };
	});

export const clearDiagnostics = (): Effect.Effect<
	DiagnosticLogSnapshot,
	DiagnosticsPersistenceFailed,
	DesktopBridge
> =>
	Effect.gen(function* () {
		const desktop = yield* DesktopBridge;
		const api = yield* desktop.api;
		const result = api
			? yield* desktop.clearDiagnosticLogs.pipe(
					Effect.mapError(
						(cause) => new DiagnosticsPersistenceFailed({ operation: 'clear', cause }),
					),
				)
			: yield* clearBrowserDiagnosticLogs();
		const parsed = parseDiagnosticLogContent(result.content);
		return { path: result.path, ...parsed };
	});

function appendBrowserDiagnosticLog(entry: DiagnosticLogEntry) {
	return Effect.try({
		try: () => {
			const current = globalThis.window?.localStorage.getItem(browserStorageKey) ?? '';
			globalThis.window?.localStorage.setItem(
				browserStorageKey,
				`${current}${JSON.stringify(entry)}\n`,
			);
		},
		catch: (cause) => new DiagnosticsPersistenceFailed({ operation: 'append', cause }),
	});
}

function readBrowserDiagnosticLogs(): Effect.Effect<
	DiagnosticLogResult,
	DiagnosticsPersistenceFailed
> {
	return Effect.try({
		try: () => ({
			path: browserDiagnosticsPath,
			content: globalThis.window?.localStorage.getItem(browserStorageKey) ?? '',
		}),
		catch: (cause) => new DiagnosticsPersistenceFailed({ operation: 'read', cause }),
	});
}

function clearBrowserDiagnosticLogs(): Effect.Effect<
	DiagnosticLogResult,
	DiagnosticsPersistenceFailed
> {
	return Effect.try({
		try: () => {
			globalThis.window?.localStorage.removeItem(browserStorageKey);
			return { path: browserDiagnosticsPath, content: '' };
		},
		catch: (cause) => new DiagnosticsPersistenceFailed({ operation: 'clear', cause }),
	});
}

function diagnosticMessage(error: unknown) {
	if (error instanceof Error) return error.message || error.name;
	if (typeof error === 'object' && error && '_tag' in error) return String(error._tag);
	return String(error);
}

function diagnosticDetails(error: unknown) {
	if (error instanceof Error) return truncate(error.stack ?? error.message);
	if (typeof error === 'object' && error && '_tag' in error) {
		const cause = 'cause' in error ? error.cause : undefined;
		if (cause instanceof Error) return truncate(cause.stack ?? cause.message);
		if (cause !== undefined) return truncate(String(cause));
	}
	return undefined;
}

function truncate(value: string) {
	return value.length > maxDetailLength ? `${value.slice(0, maxDetailLength)}...` : value;
}
