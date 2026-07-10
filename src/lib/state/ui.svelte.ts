import { SvelteSet } from 'svelte/reactivity';
import { Effect } from 'effect';
import type { Register, ValueMode } from '$lib/rdl/model';
import { rootBlockId } from '$lib/rdl/hierarchy';
import { formatEditableValue } from '$lib/rdl/format';
import { DesktopBridge } from '$lib/effect/desktop';
import { effectErrorMessage, runAppEffect } from '$lib/effect/run';

export type ThemeMode = 'light' | 'dark' | 'system';

const themeStorageKey = 'everest.theme';
const zoomStorageKey = 'everest.zoom';
const themeModes = new Set<ThemeMode>(['light', 'dark', 'system']);
const defaultZoomPercent = 100;
const minZoomPercent = 70;
const maxZoomPercent = 200;
const zoomStepPercent = 10;

const isThemeMode = (value: string | null): value is ThemeMode =>
	value !== null && themeModes.has(value as ThemeMode);

export class UiState {
	searchInputText = $state('');
	searchText = $state('');
	valueMode = $state<ValueMode>('hex');
	themeMode = $state<ThemeMode>('system');
	zoomPercent = $state(defaultZoomPercent);
	leftCollapsed = $state(false);
	expandedBlocks = $state(new SvelteSet([rootBlockId]));
	expandedFieldIds = $state(new SvelteSet<string>());
	numericDrafts = $state<Record<string, string>>({});
	renamingGroupId = $state('');
	private removeSystemThemeListener?: () => void;
	private searchInputTimer?: ReturnType<typeof setTimeout>;

	initializeAppearance() {
		this.initializeTheme();
		this.initializeZoom();
	}

	initializeTheme() {
		if (typeof window === 'undefined') return;

		const storedTheme = window.localStorage.getItem(themeStorageKey);
		this.themeMode = isThemeMode(storedTheme) ? storedTheme : 'system';
		this.applyTheme();

		if (this.removeSystemThemeListener) return;
		const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
		const updateSystemTheme = () => {
			if (this.themeMode === 'system') this.applyTheme();
		};
		systemTheme.addEventListener('change', updateSystemTheme);
		this.removeSystemThemeListener = () =>
			systemTheme.removeEventListener('change', updateSystemTheme);
	}

	setThemeMode(themeMode: string) {
		if (!isThemeMode(themeMode)) return;

		this.themeMode = themeMode;
		if (typeof window !== 'undefined') {
			window.localStorage.setItem(themeStorageKey, themeMode);
		}
		this.applyTheme();
	}

	initializeZoom() {
		if (typeof window === 'undefined') return;

		this.zoomPercent = normalizeZoomPercent(window.localStorage.getItem(zoomStorageKey));
		void this.applyZoom();
	}

	setZoomPercent(value: number) {
		this.zoomPercent = clampZoomPercent(value);
		this.persistZoom();
		void this.applyZoom();
	}

	zoomIn() {
		this.setZoomPercent(this.zoomPercent + zoomStepPercent);
	}

	zoomOut() {
		this.setZoomPercent(this.zoomPercent - zoomStepPercent);
	}

	resetZoom() {
		this.setZoomPercent(defaultZoomPercent);
	}

	private persistZoom() {
		if (typeof window === 'undefined') return;
		window.localStorage.setItem(zoomStorageKey, String(this.zoomPercent));
	}

	private async applyZoom() {
		if (typeof window === 'undefined') return;
		const scaleFactor = this.zoomPercent / 100;

		try {
			await runAppEffect(
				Effect.gen(function* () {
					const desktop = yield* DesktopBridge;
					yield* desktop.setZoom(scaleFactor);
				}),
			);
		} catch (error) {
			console.warn(`Unable to apply zoom: ${effectErrorMessage(error)}`);
		}
	}

	private applyTheme() {
		if (typeof window === 'undefined') return;

		const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		const dark = this.themeMode === 'dark' || (this.themeMode === 'system' && systemDark);
		document.documentElement.classList.toggle('dark', dark);
	}

	resetForDocument() {
		this.clearSearch();
		this.expandedBlocks = new SvelteSet([rootBlockId]);
		this.expandedFieldIds = new SvelteSet<string>();
		this.numericDrafts = {};
		this.renamingGroupId = '';
	}

	toggleLeftCollapsed() {
		this.leftCollapsed = !this.leftCollapsed;
	}

	revealHierarchy(ids: string[] = []) {
		this.leftCollapsed = false;
		this.clearSearch();
		this.expandedBlocks = new SvelteSet([...this.expandedBlocks, rootBlockId, ...ids]);
	}

	updateSearchInput(value: string) {
		this.searchInputText = value;
		if (this.searchInputTimer) clearTimeout(this.searchInputTimer);

		if (!value.trim()) {
			this.searchText = '';
			return;
		}

		this.searchInputTimer = setTimeout(() => {
			this.searchText = value;
			this.searchInputTimer = undefined;
		}, 80);
	}

	clearSearch() {
		if (this.searchInputTimer) {
			clearTimeout(this.searchInputTimer);
			this.searchInputTimer = undefined;
		}
		this.searchInputText = '';
		this.searchText = '';
	}

	expandHierarchy(ids: string[] = []) {
		this.expandedBlocks = new SvelteSet([...this.expandedBlocks, rootBlockId, ...ids]);
	}

	toggleBlock(id: string) {
		const next = new SvelteSet(this.expandedBlocks);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		this.expandedBlocks = next;
	}

	setExpandedFieldsFor(register: Register | undefined) {
		this.expandedFieldIds = new SvelteSet(register?.fields.map((field) => field.id) ?? []);
	}

	toggleField(fieldId: string) {
		const next = new SvelteSet(this.expandedFieldIds);
		if (next.has(fieldId)) {
			next.delete(fieldId);
		} else {
			next.add(fieldId);
		}
		this.expandedFieldIds = next;
	}

	expandAllFields(register: Register) {
		this.expandedFieldIds = new SvelteSet(register.fields.map((field) => field.id));
	}

	collapseAllFields() {
		this.expandedFieldIds = new SvelteSet();
	}

	numericInputValue(key: string, value: number, width = 4) {
		return key in this.numericDrafts
			? this.numericDrafts[key]
			: formatEditableValue(value, this.valueMode, width);
	}

	updateNumericDraft(key: string, rawValue: string) {
		this.numericDrafts = { ...this.numericDrafts, [key]: rawValue };
	}

	clearNumericDraft(key: string) {
		const rest = { ...this.numericDrafts };
		delete rest[key];
		this.numericDrafts = rest;
	}
}

function clampZoomPercent(value: number) {
	if (!Number.isFinite(value)) return defaultZoomPercent;
	return Math.min(maxZoomPercent, Math.max(minZoomPercent, Math.round(value)));
}

function normalizeZoomPercent(value: string | null) {
	if (value === null) return defaultZoomPercent;
	return clampZoomPercent(Number(value));
}

export const ui = new UiState();
