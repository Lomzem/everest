import { Context, Data, Effect, Layer } from 'effect';
import type {
	DesktopApi,
	DiagnosticLogEntry,
	DiagnosticLogResult,
	RdlParseError,
	RdlFileResult,
} from '$lib/desktop-api';
import { createTauriDesktopApi } from '$lib/tauri';

export class DesktopUnavailable extends Data.TaggedError('DesktopUnavailable')<{
	readonly operation: string;
}> {}

export class DesktopOperationFailed extends Data.TaggedError('DesktopOperationFailed')<{
	readonly operation: string;
	readonly cause: unknown;
}> {}

export class RdlParseFailed extends Data.TaggedError('RdlParseFailed')<RdlParseError> {}

export type DesktopError = DesktopUnavailable | DesktopOperationFailed | RdlParseFailed;

export interface DesktopBridgeService {
	readonly api: Effect.Effect<DesktopApi | undefined>;
	readonly openRdlFile: Effect.Effect<RdlFileResult | null, DesktopError>;
	readonly saveRdlFile: (path: string, content: string) => Effect.Effect<void, DesktopError>;
	readonly chooseRdlSavePath: (
		suggestedPath?: string,
	) => Effect.Effect<{ path: string } | null, DesktopError>;
	readonly saveRdlFileAs: (
		content: string,
		suggestedPath?: string,
	) => Effect.Effect<{ path: string } | null, DesktopError>;
	readonly setDocumentEdited: (edited: boolean) => Effect.Effect<void, DesktopError>;
	readonly setWindowTitle: (title: string) => Effect.Effect<void, DesktopError>;
	readonly appendDiagnosticLog: (entry: DiagnosticLogEntry) => Effect.Effect<void, DesktopError>;
	readonly readDiagnosticLogs: Effect.Effect<DiagnosticLogResult, DesktopError>;
	readonly clearDiagnosticLogs: Effect.Effect<DiagnosticLogResult, DesktopError>;
	readonly quitApplication: Effect.Effect<void, DesktopError>;
}

export class DesktopBridge extends Context.Tag('everest/DesktopBridge')<
	DesktopBridge,
	DesktopBridgeService
>() {}

const api = Effect.sync(() => globalThis.window?.everest ?? createTauriDesktopApi());

const requiredApi = (operation: string) =>
	api.pipe(
		Effect.flatMap((desktopApi) =>
			desktopApi ? Effect.succeed(desktopApi) : Effect.fail(new DesktopUnavailable({ operation })),
		),
	);

function isRdlParseError(cause: unknown): cause is RdlParseError {
	return (
		typeof cause === 'object' &&
		cause !== null &&
		'kind' in cause &&
		cause.kind === 'rdlParseError' &&
		'path' in cause &&
		typeof cause.path === 'string' &&
		'message' in cause &&
		typeof cause.message === 'string'
	);
}

function rdlParseErrorFromText(details: string): RdlParseError | undefined {
	const lines = details.trim().split(/\r?\n/);
	for (const [index, line] of lines.entries()) {
		const match = /^(.+):(\d+):(\d+):\s+(?:error|fatal):\s+(.+)$/.exec(line);
		if (!match) continue;

		const snippetLines: string[] = [];
		const sourceLine = lines[index + 1];
		const caretLine = lines[index + 2];
		if (sourceLine) snippetLines.push(sourceLine);
		if (caretLine?.trimStart().startsWith('^')) snippetLines.push(caretLine);

		return {
			kind: 'rdlParseError',
			path: match[1],
			line: Number(match[2]),
			column: Number(match[3]),
			message: match[4],
			snippet: snippetLines.length ? snippetLines.join('\n') : undefined,
			details,
		};
	}
	return undefined;
}

export function rdlParseFailureFromUnknown(error: unknown): RdlParseFailed | undefined {
	if (error instanceof RdlParseFailed) return error;
	if (isRdlParseError(error)) return new RdlParseFailed(error);
	if (typeof error === 'string') {
		const parsed = rdlParseErrorFromText(error);
		return parsed ? new RdlParseFailed(parsed) : undefined;
	}
	if (typeof error !== 'object' || error === null) return undefined;

	if ('_tag' in error && error._tag === 'RdlParseFailed' && isRdlParseError(error)) {
		return new RdlParseFailed(error);
	}

	const fiberCause = Object.getOwnPropertySymbols(error)
		.find((symbol) => String(symbol) === 'Symbol(effect/Runtime/FiberFailure/Cause)')
		?.valueOf();
	if (fiberCause) {
		const cause = (error as Record<symbol, unknown>)[fiberCause];
		if (typeof cause === 'object' && cause !== null && '_tag' in cause) {
			if (cause._tag === 'Fail') {
				const failure =
					'failure' in cause ? cause.failure : 'error' in cause ? cause.error : undefined;
				const parseError = rdlParseFailureFromUnknown(failure);
				if (parseError) return parseError;
			}
		}
	}

	const cause = 'cause' in error ? error.cause : undefined;
	return rdlParseFailureFromUnknown(cause);
}

function desktopOperationError(operation: string, cause: unknown): DesktopError {
	if (operation === 'openRdlFile') {
		const parseError = rdlParseFailureFromUnknown(cause);
		if (parseError) return parseError;
	}
	return new DesktopOperationFailed({ operation, cause });
}

const invoke = <A>(operation: string, run: (desktopApi: DesktopApi) => Promise<A>) =>
	requiredApi(operation).pipe(
		Effect.flatMap((desktopApi) =>
			Effect.tryPromise({
				try: () => run(desktopApi),
				catch: (cause) => desktopOperationError(operation, cause),
			}),
		),
	);

const optionalInvoke = <A>(operation: string, run: (desktopApi: DesktopApi) => Promise<A>) =>
	api.pipe(
		Effect.flatMap((desktopApi) => {
			if (!desktopApi) return Effect.void;
			return Effect.tryPromise({
				try: () => run(desktopApi),
				catch: (cause) => desktopOperationError(operation, cause),
			});
		}),
	);

export const DesktopBridgeLive = Layer.succeed(DesktopBridge, {
	api,
	openRdlFile: invoke('openRdlFile', (desktopApi) => desktopApi.openRdlFile()),
	saveRdlFile: (path, content) =>
		invoke('saveRdlFile', (desktopApi) => desktopApi.saveRdlFile(path, content)),
	chooseRdlSavePath: (suggestedPath) =>
		invoke('chooseRdlSavePath', (desktopApi) => desktopApi.chooseRdlSavePath(suggestedPath)),
	saveRdlFileAs: (content, suggestedPath) =>
		invoke('saveRdlFileAs', (desktopApi) => desktopApi.saveRdlFileAs(content, suggestedPath)),
	setDocumentEdited: (edited) =>
		optionalInvoke('setDocumentEdited', (desktopApi) => desktopApi.setDocumentEdited(edited)),
	setWindowTitle: (title) =>
		optionalInvoke('setWindowTitle', (desktopApi) => desktopApi.setWindowTitle(title)),
	appendDiagnosticLog: (entry) =>
		invoke('appendDiagnosticLog', (desktopApi) => desktopApi.appendDiagnosticLog(entry)),
	readDiagnosticLogs: invoke('readDiagnosticLogs', (desktopApi) => desktopApi.readDiagnosticLogs()),
	clearDiagnosticLogs: invoke('clearDiagnosticLogs', (desktopApi) =>
		desktopApi.clearDiagnosticLogs(),
	),
	quitApplication: optionalInvoke('quitApplication', (desktopApi) =>
		desktopApi.quitApplication ? desktopApi.quitApplication() : Promise.resolve(),
	),
});

export function subscribeMenuCommand(callback: (command: string) => void) {
	return (globalThis.window?.everest ?? createTauriDesktopApi())?.onMenuCommand(callback);
}
