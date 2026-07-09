import type { DiagnosticLogEntry } from '$lib/desktop-api';
import {
	appendDiagnosticError,
	clearDiagnostics,
	readDiagnostics,
	type DiagnosticLogSnapshot,
} from '$lib/effect/diagnostics';
import { effectErrorMessage, runAppEffect } from '$lib/effect/run';

export class DiagnosticsState {
	open = $state(false);
	loading = $state(false);
	error = $state('');
	path = $state('');
	ignoredLines = $state(0);
	entries = $state.raw<DiagnosticLogEntry[]>([]);

	async showLogs() {
		this.open = true;
		await this.refresh();
	}

	async refresh() {
		this.loading = true;
		this.error = '';
		try {
			this.applySnapshot(await runAppEffect(readDiagnostics()));
		} catch (error) {
			this.error = effectErrorMessage(error);
		} finally {
			this.loading = false;
		}
	}

	async clear() {
		if (!globalThis.window.confirm('Clear persisted diagnostics?')) return;
		this.loading = true;
		this.error = '';
		try {
			this.applySnapshot(await runAppEffect(clearDiagnostics()));
		} catch (error) {
			this.error = effectErrorMessage(error);
		} finally {
			this.loading = false;
		}
	}

	async recordError(source: string, error: unknown) {
		await runAppEffect(appendDiagnosticError({ source, error }));
	}

	installGlobalHandlers() {
		const handleError = (event: ErrorEvent) => {
			void this.recordError('window.error', event.error ?? event.message);
		};
		const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
			void this.recordError('window.unhandledrejection', event.reason);
		};

		globalThis.window.addEventListener('error', handleError);
		globalThis.window.addEventListener('unhandledrejection', handleUnhandledRejection);

		return () => {
			globalThis.window.removeEventListener('error', handleError);
			globalThis.window.removeEventListener('unhandledrejection', handleUnhandledRejection);
		};
	}

	private applySnapshot(snapshot: DiagnosticLogSnapshot) {
		this.path = snapshot.path;
		this.ignoredLines = snapshot.ignoredLines;
		this.entries = snapshot.entries.toReversed();
	}
}

export const diagnostics = new DiagnosticsState();
