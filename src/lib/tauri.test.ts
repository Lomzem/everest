import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
const listen = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen }));

describe('createTauriDesktopApi', () => {
	beforeEach(() => {
		vi.resetModules();
		invoke.mockReset();
		listen.mockReset();
		Object.defineProperty(globalThis, 'window', {
			configurable: true,
			value: { __TAURI_INTERNALS__: {} },
		});
		Object.defineProperty(globalThis, 'navigator', {
			configurable: true,
			value: { platform: 'Win32' },
		});
	});

	it('sends save paths using the native command path argument', async () => {
		invoke.mockResolvedValue(undefined);
		const { createTauriDesktopApi } = await import('./tauri');
		const api = createTauriDesktopApi();

		await api?.saveRdlFile(String.raw`C:\Users\lawjay\Documents\copy.rdl`, 'content');

		expect(invoke).toHaveBeenCalledWith('save_rdl_file', {
			path: String.raw`C:\Users\lawjay\Documents\copy.rdl`,
			content: 'content',
		});
	});

	it('sends Save As content and suggestions to the native Save As command', async () => {
		invoke.mockResolvedValue({ path: String.raw`C:\Users\lawjay\Documents\copy.rdl` });
		const { createTauriDesktopApi } = await import('./tauri');
		const api = createTauriDesktopApi();

		const result = await api?.saveRdlFileAs('content', 'top.rdl');

		expect(invoke).toHaveBeenCalledWith('save_rdl_file_as', {
			content: 'content',
			suggestedPath: 'top.rdl',
		});
		expect(result).toEqual({ path: String.raw`C:\Users\lawjay\Documents\copy.rdl` });
	});

	it('appends diagnostics using the native diagnostics command', async () => {
		invoke.mockResolvedValue(undefined);
		const { createTauriDesktopApi } = await import('./tauri');
		const api = createTauriDesktopApi();
		const entry = {
			version: 1,
			timestamp: '2026-07-09T00:00:00.000Z',
			level: 'error',
			source: 'test',
			message: 'boom',
		} as const;

		await api?.appendDiagnosticLog(entry);

		expect(invoke).toHaveBeenCalledWith('append_diagnostic_log', { entry });
	});

	it('reads diagnostics using the native diagnostics command', async () => {
		invoke.mockResolvedValue({ path: '/tmp/everest.log', content: '' });
		const { createTauriDesktopApi } = await import('./tauri');
		const api = createTauriDesktopApi();

		const result = await api?.readDiagnosticLogs();

		expect(invoke).toHaveBeenCalledWith('read_diagnostic_logs');
		expect(result).toEqual({ path: '/tmp/everest.log', content: '' });
	});

	it('clears diagnostics using the native diagnostics command', async () => {
		invoke.mockResolvedValue({ path: '/tmp/everest.log', content: '' });
		const { createTauriDesktopApi } = await import('./tauri');
		const api = createTauriDesktopApi();

		const result = await api?.clearDiagnosticLogs();

		expect(invoke).toHaveBeenCalledWith('clear_diagnostic_logs');
		expect(result).toEqual({ path: '/tmp/everest.log', content: '' });
	});
});
