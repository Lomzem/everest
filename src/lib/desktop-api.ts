import type { RdlDocument } from '$lib/rdl/model';

export type MenuCommand = 'new' | 'open' | 'save' | 'save-as' | 'quit';
export type DiagnosticLogLevel = 'error';

export interface DiagnosticLogEntry {
	readonly version: 1;
	readonly timestamp: string;
	readonly level: DiagnosticLogLevel;
	readonly source: string;
	readonly message: string;
	readonly details?: string;
}

export interface DiagnosticLogResult {
	readonly path: string;
	readonly content: string;
}

export interface RdlFileResult {
	readonly path: string;
	readonly document: RdlDocument;
}

export interface DesktopApi {
	readonly platform: NodeJS.Platform;
	readonly openRdlFile: () => Promise<RdlFileResult | null>;
	readonly saveRdlFile: (path: string, content: string) => Promise<void>;
	readonly chooseRdlSavePath: (suggestedPath?: string) => Promise<{ path: string } | null>;
	readonly saveRdlFileAs: (
		content: string,
		suggestedPath?: string,
	) => Promise<{ path: string } | null>;
	readonly setDocumentEdited: (edited: boolean) => Promise<void>;
	readonly setWindowTitle: (title: string) => Promise<void>;
	readonly appendDiagnosticLog: (entry: DiagnosticLogEntry) => Promise<void>;
	readonly readDiagnosticLogs: () => Promise<DiagnosticLogResult>;
	readonly clearDiagnosticLogs: () => Promise<DiagnosticLogResult>;
	readonly quitApplication?: () => Promise<void>;
	readonly onMenuCommand: (callback: (command: MenuCommand) => void) => () => void;
}

declare global {
	interface Window {
		readonly everest?: DesktopApi;
	}
}

export {};
