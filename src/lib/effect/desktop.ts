import { Context, Data, Effect, Layer } from 'effect';
import type { DesktopApi, RdlFileResult } from '$lib/electron';
import { createTauriDesktopApi } from '$lib/tauri';

export class DesktopUnavailable extends Data.TaggedError('DesktopUnavailable')<{
	readonly operation: string;
}> {}

export class DesktopOperationFailed extends Data.TaggedError('DesktopOperationFailed')<{
	readonly operation: string;
	readonly cause: unknown;
}> {}

export type DesktopError = DesktopUnavailable | DesktopOperationFailed;

export interface DesktopBridgeService {
	readonly api: Effect.Effect<DesktopApi | undefined>;
	readonly openRdlFile: Effect.Effect<RdlFileResult | null, DesktopError>;
	readonly saveRdlFile: (path: string, content: string) => Effect.Effect<void, DesktopError>;
	readonly saveRdlFileAs: (
		content: string,
		suggestedPath?: string,
	) => Effect.Effect<{ path: string } | null, DesktopError>;
	readonly setDocumentEdited: (edited: boolean) => Effect.Effect<void, DesktopError>;
	readonly setWindowTitle: (title: string) => Effect.Effect<void, DesktopError>;
	readonly quitApplication: Effect.Effect<void, DesktopError>;
}

export class DesktopBridge extends Context.Tag('basecamp/DesktopBridge')<
	DesktopBridge,
	DesktopBridgeService
>() {}

const api = Effect.sync(() => globalThis.window?.basecamp ?? createTauriDesktopApi());

const requiredApi = (operation: string) =>
	api.pipe(
		Effect.flatMap((desktopApi) =>
			desktopApi ? Effect.succeed(desktopApi) : Effect.fail(new DesktopUnavailable({ operation })),
		),
	);

const invoke = <A>(operation: string, run: (desktopApi: DesktopApi) => Promise<A>) =>
	requiredApi(operation).pipe(
		Effect.flatMap((desktopApi) =>
			Effect.tryPromise({
				try: () => run(desktopApi),
				catch: (cause) => new DesktopOperationFailed({ operation, cause }),
			}),
		),
	);

const optionalInvoke = <A>(operation: string, run: (desktopApi: DesktopApi) => Promise<A>) =>
	api.pipe(
		Effect.flatMap((desktopApi) => {
			if (!desktopApi) return Effect.void;
			return Effect.tryPromise({
				try: () => run(desktopApi),
				catch: (cause) => new DesktopOperationFailed({ operation, cause }),
			});
		}),
	);

export const DesktopBridgeLive = Layer.succeed(DesktopBridge, {
	api,
	openRdlFile: invoke('openRdlFile', (desktopApi) => desktopApi.openRdlFile()),
	saveRdlFile: (path, content) =>
		invoke('saveRdlFile', (desktopApi) => desktopApi.saveRdlFile(path, content)),
	saveRdlFileAs: (content, suggestedPath) =>
		invoke('saveRdlFileAs', (desktopApi) => desktopApi.saveRdlFileAs(content, suggestedPath)),
	setDocumentEdited: (edited) =>
		optionalInvoke('setDocumentEdited', (desktopApi) => desktopApi.setDocumentEdited(edited)),
	setWindowTitle: (title) =>
		optionalInvoke('setWindowTitle', (desktopApi) => desktopApi.setWindowTitle(title)),
	quitApplication: optionalInvoke('quitApplication', (desktopApi) =>
		desktopApi.quitApplication ? desktopApi.quitApplication() : Promise.resolve(),
	),
});

export function subscribeMenuCommand(callback: (command: string) => void) {
	return (globalThis.window?.basecamp ?? createTauriDesktopApi())?.onMenuCommand(callback);
}
