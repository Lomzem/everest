import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopApi } from '$lib/desktop-api';
import { UiState } from './ui.svelte';

describe('UiState zoom', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('defaults to 100 percent zoom', async () => {
		const setZoom = vi.fn().mockResolvedValue(undefined);
		const state = new UiState();
		installWindow(setZoom);

		state.initializeZoom();
		await Promise.resolve();

		expect(state.zoomPercent).toBe(100);
		expect(setZoom).toHaveBeenCalledWith(1);
	});

	it('restores persisted zoom', async () => {
		const setZoom = vi.fn().mockResolvedValue(undefined);
		const localStorage = localStorageMock();
		localStorage.setItem('everest.zoom', '130');
		installWindow(setZoom, localStorage);
		const state = new UiState();

		state.initializeZoom();
		await Promise.resolve();

		expect(state.zoomPercent).toBe(130);
		expect(setZoom).toHaveBeenCalledWith(1.3);
	});

	it('normalizes invalid persisted zoom to the default', () => {
		const localStorage = localStorageMock();
		localStorage.setItem('everest.zoom', 'large');
		installWindow(vi.fn().mockResolvedValue(undefined), localStorage);
		const state = new UiState();

		state.initializeZoom();

		expect(state.zoomPercent).toBe(100);
	});

	it('clamps and persists explicit zoom changes', async () => {
		const setZoom = vi.fn().mockResolvedValue(undefined);
		const localStorage = localStorageMock();
		installWindow(setZoom, localStorage);
		const state = new UiState();

		state.setZoomPercent(245);
		await Promise.resolve();

		expect(state.zoomPercent).toBe(200);
		expect(localStorage.getItem('everest.zoom')).toBe('200');
		expect(setZoom).toHaveBeenCalledWith(2);
	});

	it('increments, decrements, and resets zoom', () => {
		const localStorage = localStorageMock();
		installWindow(vi.fn().mockResolvedValue(undefined), localStorage);
		const state = new UiState();

		state.zoomIn();
		state.zoomIn();
		state.zoomOut();
		expect(state.zoomPercent).toBe(110);

		state.resetZoom();
		expect(state.zoomPercent).toBe(100);
		expect(localStorage.getItem('everest.zoom')).toBe('100');
	});
});

function installWindow(
	setZoom: (scaleFactor: number) => Promise<void>,
	localStorage = localStorageMock(),
) {
	const desktopApi = {
		setZoom,
	} as unknown as DesktopApi;

	Object.defineProperty(globalThis, 'window', {
		configurable: true,
		value: {
			everest: desktopApi,
			localStorage,
			matchMedia: vi.fn(() => ({
				matches: false,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
			})),
		},
	});
}

function localStorageMock() {
	const values = new Map<string, string>();
	return {
		getItem: vi.fn((key: string) => values.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => {
			values.set(key, value);
		}),
		removeItem: vi.fn((key: string) => {
			values.delete(key);
		}),
	};
}
