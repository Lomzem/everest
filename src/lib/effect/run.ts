import { Effect } from 'effect';
import { DesktopBridge, DesktopBridgeLive } from './desktop';

export function runAppEffect<A, E>(effect: Effect.Effect<A, E, DesktopBridge>) {
	return Effect.runPromise(effect.pipe(Effect.provide(DesktopBridgeLive)));
}

export function effectErrorMessage(error: unknown) {
	if (error instanceof Error && error.message) return error.message;
	if (typeof error === 'object' && error && '_tag' in error) {
		const tag = String(error._tag);
		if (tag === 'DesktopUnavailable') return 'Desktop integration is unavailable.';
		if (tag === 'DocumentValidationFailed' && 'message' in error) {
			return String(error.message);
		}
		if (tag === 'DocumentValidationFailed') return 'The RDL document shape is invalid.';
		if (tag === 'RdlParseFailed' && 'message' in error) {
			return String(error.message);
		}
		if (tag === 'DesktopOperationFailed' && 'cause' in error) {
			const cause = error.cause;
			return cause instanceof Error ? cause.message : String(cause);
		}
		return tag;
	}
	return String(error);
}
