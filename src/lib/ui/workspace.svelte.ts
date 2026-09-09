/** Presentation state only. Document state belongs to the editor session. */
export class Workspace {
	search = $state('');
	changesOpen = $state(false);
	navigationOpen = $state(false);
	base = $state<16 | 10 | 2>(16);
	dark = $state(false);
	format(value: bigint | number | undefined) {
		if (value === undefined) return '—';
		const prefix = this.base === 16 ? '0x' : this.base === 2 ? '0b' : '';
		return prefix + value.toString(this.base).toUpperCase();
	}
	toggleTheme() {
		this.dark = !this.dark;
		document.documentElement.classList.toggle('dark', this.dark);
		try {
			localStorage.setItem('everest-theme', this.dark ? 'dark' : 'light');
		} catch {
			/* Storage can be unavailable. */
		}
	}
}
