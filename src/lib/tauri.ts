import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import type {
	DesktopApi,
	DiagnosticLogEntry,
	DiagnosticLogResult,
	MenuCommand,
	RdlFileResult,
} from '$lib/desktop-api';

declare global {
	interface Window {
		readonly __TAURI_INTERNALS__?: unknown;
	}
}

export function isTauriRuntime() {
	return typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined;
}

export function createTauriDesktopApi(): DesktopApi | undefined {
	if (!isTauriRuntime()) return undefined;

	return {
		platform: navigator.platform.toLowerCase().includes('win') ? 'win32' : 'linux',
		openRdlFile: () => invoke<RdlFileResult | null>('open_rdl_file'),
		saveRdlFile: (path, content) => invoke<void>('save_rdl_file', { path, content }),
		chooseRdlSavePath: (suggestedPath) =>
			invoke<{ path: string } | null>('choose_save_rdl_file', { suggestedPath }),
		saveRdlFileAs: (content, suggestedPath) =>
			invoke<{ path: string } | null>('save_rdl_file_as', { content, suggestedPath }),
		setDocumentEdited: (edited) => invoke<void>('set_document_edited', { edited }),
		setWindowTitle: (title) => invoke<void>('set_window_title', { title }),
		appendDiagnosticLog: (entry: DiagnosticLogEntry) =>
			invoke<void>('append_diagnostic_log', { entry }),
		readDiagnosticLogs: () => invoke<DiagnosticLogResult>('read_diagnostic_logs'),
		clearDiagnosticLogs: () => invoke<DiagnosticLogResult>('clear_diagnostic_logs'),
		quitApplication: () => invoke<void>('quit_application'),
		setZoom: (scaleFactor) => getCurrentWebview().setZoom(scaleFactor),
		onMenuCommand: (callback) => {
			const unlisten = listen<MenuCommand>('rdl:menu-command', (event) => callback(event.payload));
			return () => {
				void unlisten.then((remove) => remove());
			};
		},
	};
}

export {};
