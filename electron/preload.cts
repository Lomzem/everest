import type { IpcRendererEvent } from 'electron';

const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

contextBridge.exposeInMainWorld('basecamp', {
	platform: process.platform,
	versions: {
		electron: process.versions.electron,
		chromium: process.versions.chrome,
		node: process.versions.node,
	},
	openRdlFile: () => ipcRenderer.invoke('rdl:open-file'),
	saveRdlFile: (path: string, content: string) =>
		ipcRenderer.invoke('rdl:save-file', path, content),
	saveRdlFileAs: (content: string, suggestedPath?: string) =>
		ipcRenderer.invoke('rdl:save-file-as', content, suggestedPath),
	setDocumentEdited: (edited: boolean) => ipcRenderer.invoke('rdl:set-document-edited', edited),
	setWindowTitle: (title: string) => ipcRenderer.invoke('rdl:set-window-title', title),
	onMenuCommand: (callback: (command: string) => void) => {
		const handler = (_event: IpcRendererEvent, command: string) => callback(command);
		ipcRenderer.on('rdl:menu-command', handler);
		return () => ipcRenderer.removeListener('rdl:menu-command', handler);
	},
});
