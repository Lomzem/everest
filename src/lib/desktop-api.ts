import type { RdlDocument } from '$lib/rdl/model';

export type MenuCommand = 'new' | 'open' | 'save' | 'save-as' | 'export-rdl-as' | 'quit';

export interface RdlFileResult {
	readonly path: string;
	readonly document: RdlDocument;
	readonly source?: RdlDocument['source'];
}

export interface DesktopApi {
	readonly platform: NodeJS.Platform;
	readonly openRdlFile: () => Promise<RdlFileResult | null>;
	readonly saveRdlFile: (path: string, content: string) => Promise<void>;
	readonly saveRdlFileAs: (
		content: string,
		suggestedPath?: string,
	) => Promise<{ path: string } | null>;
	readonly setDocumentEdited: (edited: boolean) => Promise<void>;
	readonly setWindowTitle: (title: string) => Promise<void>;
	readonly quitApplication?: () => Promise<void>;
	readonly onMenuCommand: (callback: (command: MenuCommand) => void) => () => void;
}

declare global {
	interface Window {
		readonly everest?: DesktopApi;
	}
}

export {};
