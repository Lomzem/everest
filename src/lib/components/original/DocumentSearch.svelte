<script lang="ts">
	import { tick, onMount, onDestroy } from 'svelte';
	import { Search } from '@lucide/svelte';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import type { EditorSession } from '$lib/editor/session.svelte';
	import type { Workspace } from '$lib/ui/workspace.svelte';
	import { searchDocument } from '$lib/ui/search';
	let { session, workspace }: { session: EditorSession; workspace: Workspace } = $props();
	let input = $state<HTMLInputElement | null>(null),
		active = $state(-1);
	let focusTimer: ReturnType<typeof setTimeout> | undefined;
	const results = $derived(searchDocument(session.compilation, workspace.search));
	const open = $derived(workspace.searchOpen && Boolean(workspace.search.trim()));
	function focusSearch() {
		input?.focus();
		input?.select();
	}
	onMount(() => {
		const key = (event: KeyboardEvent) => {
			const target = event.target;
			const editing =
				target instanceof HTMLElement &&
				(target.matches('input,textarea,select') || target.isContentEditable);
			if (
				((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') ||
				(event.key === '/' && !editing)
			) {
				event.preventDefault();
				focusSearch();
			}
		};
		window.addEventListener('keydown', key);
		return () => window.removeEventListener('keydown', key);
	});
	onDestroy(() => {
		if (focusTimer) clearTimeout(focusTimer);
	});
	async function activate(index: number) {
		active = Math.max(0, Math.min(results.length - 1, index));
		await tick();
		document
			.getElementById(`document-search-result-${active}`)
			?.scrollIntoView({ block: 'nearest' });
	}
	async function select(index: number) {
		const result = results[index];
		if (!result) return;
		workspace.selectedGroup = undefined;
		session.select(result.registerId);
		const register = session.compilation.nodes.find((n) => n.id === result.registerId);
		const segments = (register?.groupPath ?? '').split('/').filter(Boolean);
		workspace.expandedNodes = [
			...new Set([
				...workspace.expandedNodes,
				'',
				...segments.map((_, i) => segments.slice(0, i + 1).join('/'))
			])
		];
		if (result.fieldId && !workspace.expandedFields.includes(result.fieldId))
			workspace.expandedFields = [...workspace.expandedFields, result.fieldId];
		workspace.searchOpen = false;
		input?.blur();
		await tick();
		if (result.fieldId) {
			const card = document.querySelector(`[data-field-card="${CSS.escape(result.fieldId)}"]`);
			const target = result.member
				? card?.querySelector(`[data-enum-value-row="${CSS.escape(result.member)}"]`)
				: result.kind === 'enum'
					? card?.querySelector('[data-enum-editor]')
					: card;
			target?.scrollIntoView({ block: 'center' });
		}
	}
	function keydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			workspace.searchOpen = false;
			input?.blur();
			return;
		}
		if (!results.length) return;
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			void activate(active + 1);
		}
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			void activate(active - 1);
		}
		if (event.key === 'Home') {
			event.preventDefault();
			void activate(0);
		}
		if (event.key === 'End') {
			event.preventDefault();
			void activate(results.length - 1);
		}
		if (event.key === 'Enter') {
			event.preventDefault();
			void select(Math.max(active, 0));
		}
	}
	function parts(text: string) {
		const query = workspace.search.trim();
		if (!query) return [{ text, match: false }];
		const result: { text: string; match: boolean }[] = [];
		let start = 0,
			at = text.toLowerCase().indexOf(query.toLowerCase());
		while (at >= 0) {
			if (at > start) result.push({ text: text.slice(start, at), match: false });
			result.push({ text: text.slice(at, at + query.length), match: true });
			start = at + query.length;
			at = text.toLowerCase().indexOf(query.toLowerCase(), start);
		}
		result.push({ text: text.slice(start), match: false });
		return result;
	}
</script>

{#snippet highlighted(text: string)}{#each parts(text) as part, index (index)}{#if part.match}<mark
				class="rounded-sm bg-primary/15 px-0.5 text-inherit dark:bg-primary/25">{part.text}</mark
			>{:else}{part.text}{/if}{/each}{/snippet}
<div
	class="relative min-w-0 flex-1"
	data-document-search
	onfocusin={() => {
		if (focusTimer) clearTimeout(focusTimer);
		workspace.searchOpen = true;
	}}
	onfocusout={(event) => {
		if (
			!(event.relatedTarget instanceof Node) ||
			!event.currentTarget.contains(event.relatedTarget)
		) {
			focusTimer = setTimeout(() => (workspace.searchOpen = false), 0);
		}
	}}
>
	<Search
		class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
	/>
	<Input
		bind:ref={input}
		class="h-9 bg-card pr-16 pl-9 font-mono text-sm text-card-foreground"
		placeholder="Search by address, register, field, or enum"
		aria-label="Search registers"
		aria-keyshortcuts="Control+K Meta+K /"
		role="combobox"
		aria-expanded={open}
		aria-controls={open ? 'document-search-results' : undefined}
		aria-activedescendant={open && active >= 0 ? `document-search-result-${active}` : undefined}
		autocomplete="off"
		bind:value={workspace.search}
		oninput={() => {
			workspace.searchOpen = true;
			active = -1;
		}}
		onkeydown={keydown}
	/>
	<kbd
		class="absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border px-1 text-[10px] text-muted-foreground sm:inline-flex"
		>Ctrl K</kbd
	>
	{#if open}<div
			id="document-search-results"
			role="listbox"
			class="relative z-50 mt-2 max-h-[min(46vh,21.0625rem)] snap-y [scrollbar-width:thin] [scrollbar-color:var(--muted-foreground)_var(--muted)] [scrollbar-gutter:stable] overflow-y-scroll rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-xl"
		>
			{#each results as result, index (result.id)}<button
					type="button"
					id={`document-search-result-${index}`}
					role="option"
					aria-selected={active === index}
					class="grid h-14 w-full snap-start grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-2 rounded-md px-3 py-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none aria-selected:bg-muted max-[700px]:grid-cols-[6.5rem_minmax(0,1fr)]"
					onmouseenter={() => (active = index)}
					onclick={() => select(index)}
					><Badge variant="outline" class="mt-0.5 justify-self-start"
						>{result.kind.replace('-', ' ')}</Badge
					><span class="min-w-0"
						><span class="block truncate text-sm font-medium"
							>{@render highlighted(result.label)}</span
						><span class="mt-0.5 block truncate font-mono text-xs text-muted-foreground"
							>{@render highlighted(result.context)}</span
						></span
					></button
				>{:else}<p class="px-3 py-7 text-center text-sm text-muted-foreground">
					No matching registers or fields
				</p>{/each}
		</div>{/if}
	<p class="sr-only" aria-live="polite">
		{workspace.search.trim() ? `${results.length} search results` : ''}
	</p>
</div>
