import { getContext, setContext } from 'svelte';
interface Draft {
	key: () => string;
	dirty: () => boolean;
	value: () => string;
	restore: (value: string) => void;
	apply: () => Promise<boolean>;
}
const key = Symbol('editor-drafts');
/** One registry per editor. File actions wait for visible input to reach source. */
export class EditorDrafts {
	private entries = new Set<Draft>();
	private tail = Promise.resolve();
	private stored: Record<string, string> = {};
	constructor(private publish: (drafts: Record<string, string>) => void = () => {}) {}
	register(draft: Draft) {
		this.entries.add(draft);
		const value = this.stored[draft.key()];
		if (value !== undefined) draft.restore(value);
		return () => this.entries.delete(draft);
	}
	changed() {
		const next = { ...this.stored };
		for (const entry of this.entries) {
			if (entry.dirty()) next[entry.key()] = entry.value();
			else delete next[entry.key()];
		}
		this.stored = next;
		this.publish(next);
	}
	accept(key: string) {
		delete this.stored[key];
		this.publish({ ...this.stored });
	}
	reset() {
		this.stored = {};
		this.publish({});
	}
	restore(values: Record<string, string>) {
		this.stored = { ...values };
		for (const entry of this.entries) {
			const value = values[entry.key()];
			if (value !== undefined) entry.restore(value);
		}
	}
	get values() {
		return { ...this.stored };
	}
	get hiddenKey() {
		const visible = new Set([...this.entries].map((entry) => entry.key()));
		return Object.keys(this.stored).find((key) => !visible.has(key));
	}
	get dirty() {
		return Object.keys(this.stored).length > 0 || [...this.entries].some((entry) => entry.dirty());
	}
	enqueue(action: () => Promise<boolean>): Promise<boolean> {
		const result = this.tail.then(action);
		this.tail = result.then(
			() => undefined,
			() => undefined
		);
		return result;
	}
	async flush() {
		await this.tail;
		for (const entry of [...this.entries])
			if (entry.dirty() && !(await entry.apply())) return false;
		await this.tail;
		this.changed();
		return !this.dirty;
	}
}
export function provideDrafts(publish: (drafts: Record<string, string>) => void) {
	const drafts = new EditorDrafts(publish);
	setContext(key, drafts);
	return drafts;
}
export function useDrafts() {
	return getContext<EditorDrafts>(key);
}
