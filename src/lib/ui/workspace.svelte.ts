import type { EditorSession } from '$lib/editor/session.svelte';
export class Workspace {
	selectedGroup = $state<string | undefined>('');
	createdNodeIds = $state<string[]>([]);
	get emptyGroups() {
		return this.session.emptyGroups;
	}
	set emptyGroups(paths: string[]) {
		this.session.setEmptyGroups(paths);
	}
	search = $state('');
	searchOpen = $state(false);
	leftCollapsed = $state(false);
	navigationOrder = $state<'document' | 'address'>('document');
	expandedNodes = $state<string[]>([]);
	expandedFields = $state<string[]>([]);
	base = $state<16 | 10 | 2>(16);
	showReservedGaps = $state(true);
	zoom = $state(100);
	theme = $state<'dark' | 'light' | 'system'>('dark');
	settingsOpen = $state(false);
	problemsOpen = $state(false);
	logsOpen = $state(false);
	createParent = $state<string | undefined>();
	createAddress = $state<bigint | undefined>();
	createRange = $state<{ start: bigint; end: bigint } | undefined>();
	moveGroup = $state<string | undefined>();
	moveNode = $state<string | undefined>();
	private preferencesReady = $state(false);
	constructor(private session: EditorSession) {
		$effect(() => {
			if (!this.preferencesReady) return;
			try {
				localStorage.setItem(
					'everest-original-view',
					JSON.stringify({
						zoom: this.zoom,
						navigationOrder: this.navigationOrder,
						showReservedGaps: this.showReservedGaps
					})
				);
			} catch {
				/* Preference storage is optional. */
			}
		});
	}
	initializePreferences() {
		try {
			const value = JSON.parse(localStorage.getItem('everest-original-view') ?? '{}');
			if (typeof value.zoom === 'number') this.zoom = Math.max(70, Math.min(200, value.zoom));
			if (value.navigationOrder === 'address') this.navigationOrder = 'address';
			if (typeof value.showReservedGaps === 'boolean')
				this.showReservedGaps = value.showReservedGaps;
		} catch {
			/* Use default preferences. */
		}
		this.preferencesReady = true;
		const query = matchMedia('(prefers-color-scheme: dark)');
		const update = () => {
			if (this.theme === 'system') document.documentElement.classList.toggle('dark', query.matches);
		};
		query.addEventListener('change', update);
		return () => query.removeEventListener('change', update);
	}
	retarget(oldId: string, newId: string) {
		this.createdNodeIds = this.createdNodeIds.map((id) =>
			id === oldId || id.startsWith(oldId + '.') ? newId + id.slice(oldId.length) : id
		);
		this.expandedFields = this.expandedFields.map((id) =>
			id === oldId || id.startsWith(oldId + '.') ? newId + id.slice(oldId.length) : id
		);
	}
	toggleNode(id: string) {
		this.expandedNodes = this.expandedNodes.includes(id)
			? this.expandedNodes.filter((item) => item !== id)
			: [...this.expandedNodes, id];
	}
	toggleField(id: string) {
		this.expandedFields = this.expandedFields.includes(id)
			? this.expandedFields.filter((item) => item !== id)
			: [...this.expandedFields, id];
	}
	format(value: bigint | number | undefined, prefix = true) {
		if (value === undefined) return '--';
		return (
			(prefix ? (this.base === 16 ? '0x' : this.base === 2 ? '0b' : '') : '') +
			value.toString(this.base).toUpperCase()
		);
	}
	setTheme(value: 'dark' | 'light' | 'system') {
		this.theme = value;
		document.documentElement.classList.toggle(
			'dark',
			value === 'dark' || (value === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
		);
		try {
			localStorage.setItem('everest-original-theme', value);
		} catch {
			/* Preference storage is optional. */
		}
	}
}
