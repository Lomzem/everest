import { SvelteSet } from 'svelte/reactivity';
import type { HierarchyDndItem } from '$lib/rdl/hierarchy';
import type { Register, ValueMode } from '$lib/rdl/model';
import { rootBlockId } from '$lib/rdl/hierarchy';
import { formatEditableValue } from '$lib/rdl/format';

export type ThemeMode = 'light' | 'dark' | 'system';

const themeStorageKey = 'everest.theme';
const themeModes = new Set<ThemeMode>(['light', 'dark', 'system']);

const isThemeMode = (value: string | null): value is ThemeMode =>
	value !== null && themeModes.has(value as ThemeMode);

export class UiState {
	searchInputText = $state('');
	searchText = $state('');
	valueMode = $state<ValueMode>('hex');
	themeMode = $state<ThemeMode>('system');
	leftCollapsed = $state(false);
	expandedBlocks = $state(new SvelteSet([rootBlockId]));
	expandedFieldIds = $state(new SvelteSet<string>());
	numericDrafts = $state<Record<string, string>>({});
	renamingGroupId = $state('');
	hierarchyDragPreview = $state<Record<string, HierarchyDndItem[]>>({});
	private removeSystemThemeListener?: () => void;
	private searchInputTimer?: ReturnType<typeof setTimeout>;

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
		this.finishHierarchyDrag();
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

	previewHierarchyDrag(groupPath: string, items: HierarchyDndItem[]) {
		this.hierarchyDragPreview = { ...this.hierarchyDragPreview, [groupPath]: items };
	}

	finishHierarchyDrag() {
		this.hierarchyDragPreview = {};
	}
}

export const ui = new UiState();
