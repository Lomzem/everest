import {
	app,
	BrowserWindow,
	dialog,
	ipcMain,
	Menu,
	net,
	protocol,
	type MessageBoxSyncOptions,
	type MenuItemConstructorOptions,
	type OpenDialogOptions,
	type SaveDialogOptions,
} from 'electron';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { parseRdlFile } from './rdl.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.VITE_DEV_SERVER_URL !== undefined;
const editedWindows = new WeakMap<BrowserWindow, boolean>();
const confirmedCloseWindows = new WeakSet<BrowserWindow>();
let isQuitting = false;
type MenuCommand = 'new' | 'open' | 'save' | 'save-as' | 'export-rdl-as';

protocol.registerSchemesAsPrivileged([
	{
		scheme: 'basecamp',
		privileges: {
			standard: true,
			secure: true,
			supportFetchAPI: true,
		},
	},
]);

const sendMenuCommand = (command: MenuCommand) => {
	const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
	window?.webContents.send('rdl:menu-command', command);
};

const confirmDiscardUnsavedChanges = (window?: BrowserWindow) => {
	const parent = window ?? BrowserWindow.getFocusedWindow();
	const options: MessageBoxSyncOptions = {
		type: 'warning',
		buttons: ['Cancel', 'Discard'],
		defaultId: 0,
		cancelId: 0,
		message: 'Discard unsaved changes?',
		detail: 'This document has unsaved changes.',
	};

	return (
		(parent ? dialog.showMessageBoxSync(parent, options) : dialog.showMessageBoxSync(options)) === 1
	);
};

const hasEditedWindows = () =>
	BrowserWindow.getAllWindows().some((window) => editedWindows.get(window));

const markWindowsConfirmedForQuit = () => {
	for (const window of BrowserWindow.getAllWindows()) {
		editedWindows.set(window, false);
		window.setDocumentEdited(false);
		confirmedCloseWindows.add(window);
	}
};

const exitApplication = () => {
	for (const window of BrowserWindow.getAllWindows()) {
		if (!window.isDestroyed()) {
			window.destroy();
		}
	}

	app.exit(0);
};

const quitApplication = () => {
	if (hasEditedWindows() && !confirmDiscardUnsavedChanges()) return;

	isQuitting = true;
	markWindowsConfirmedForQuit();
	exitApplication();
};

const createApplicationMenu = () => {
	const template: MenuItemConstructorOptions[] = [
		{
			label: 'File',
			submenu: [
				{ label: 'New RDL', accelerator: 'CmdOrCtrl+N', click: () => sendMenuCommand('new') },
				{ label: 'Open RDL...', accelerator: 'CmdOrCtrl+O', click: () => sendMenuCommand('open') },
				{ type: 'separator' },
				{ label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendMenuCommand('save') },
				{
					label: 'Save As...',
					accelerator: 'CmdOrCtrl+Shift+S',
					click: () => sendMenuCommand('save-as'),
				},
				{
					label: 'Export RDL As...',
					click: () => sendMenuCommand('export-rdl-as'),
				},
				{ type: 'separator' },
				{ label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: quitApplication },
			],
		},
		{ role: 'editMenu' },
		{ role: 'viewMenu' },
		{ role: 'windowMenu' },
	];

	Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

const registerProductionProtocol = () => {
	const buildDirectory = path.resolve(__dirname, '../build');

	protocol.handle('basecamp', (request) => {
		const url = new URL(request.url);
		const requestedPath = decodeURIComponent(url.pathname);
		const relativePath = requestedPath === '/' ? 'index.html' : requestedPath.slice(1);
		const filePath = path.resolve(buildDirectory, relativePath);

		if (!filePath.startsWith(buildDirectory)) {
			return new Response(null, { status: 403 });
		}

		return net.fetch(pathToFileURL(filePath).toString());
	});
};

const ensureRdlExtension = (filePath: string) =>
	path.extname(filePath) ? filePath : `${filePath}.rdl`;

const attachClosePrompt = (window: BrowserWindow) => {
	window.on('close', (event) => {
		if (isQuitting) return;
		if (confirmedCloseWindows.has(window)) return;
		if (!editedWindows.get(window)) return;

		event.preventDefault();

		if (!confirmDiscardUnsavedChanges(window)) return;

		editedWindows.set(window, false);
		window.setDocumentEdited(false);
		confirmedCloseWindows.add(window);
		setTimeout(() => window.destroy(), 0);
	});
};

const createWindow = async () => {
	const window = new BrowserWindow({
		width: 1180,
		height: 760,
		minWidth: 900,
		minHeight: 620,
		backgroundColor: '#ffffff',
		webPreferences: {
			preload: path.join(__dirname, 'preload.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});
	editedWindows.set(window, false);
	attachClosePrompt(window);

	if (isDev) {
		await window.loadURL(process.env.VITE_DEV_SERVER_URL!);
		window.webContents.openDevTools({ mode: 'detach' });
		return;
	}

	await window.loadURL('basecamp://app/');
};

app.whenReady().then(async () => {
	if (!isDev) {
		registerProductionProtocol();
	}
	createApplicationMenu();
	await createWindow();

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			void createWindow();
		}
	});
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit();
	}
});

app.on('before-quit', (event) => {
	if (isQuitting || !hasEditedWindows()) {
		isQuitting = true;
		return;
	}

	event.preventDefault();
	quitApplication();
});

ipcMain.handle('rdl:open-file', async (event) => {
	const window = BrowserWindow.fromWebContents(event.sender);
	const options: OpenDialogOptions = {
		properties: ['openFile'],
		filters: [{ name: 'SystemRDL', extensions: ['rdl'] }],
	};
	const result = window
		? await dialog.showOpenDialog(window, options)
		: await dialog.showOpenDialog(options);

	if (result.canceled || !result.filePaths[0]) {
		return null;
	}

	return parseRdlFile(result.filePaths[0]);
});

ipcMain.handle('rdl:save-file', async (_event, filePath: string, content: string) => {
	await writeFile(filePath, content, 'utf8');
});

ipcMain.handle('rdl:save-file-as', async (event, content: string, suggestedPath?: string) => {
	const window = BrowserWindow.fromWebContents(event.sender);
	const options: SaveDialogOptions = {
		defaultPath: suggestedPath,
		filters: [{ name: 'SystemRDL', extensions: ['rdl'] }],
	};
	const result = window
		? await dialog.showSaveDialog(window, options)
		: await dialog.showSaveDialog(options);

	if (result.canceled || !result.filePath) {
		return null;
	}

	const filePath = ensureRdlExtension(result.filePath);
	await writeFile(filePath, content, 'utf8');
	return { path: filePath };
});

ipcMain.handle('rdl:set-document-edited', (event, edited: boolean) => {
	const window = BrowserWindow.fromWebContents(event.sender);
	if (!window) return;

	editedWindows.set(window, edited);
	window.setDocumentEdited(edited);
});

ipcMain.handle('rdl:set-window-title', (event, title: string) => {
	const window = BrowserWindow.fromWebContents(event.sender);
	window?.setTitle(title);
});
