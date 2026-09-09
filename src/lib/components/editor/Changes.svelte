<script lang="ts">
	import { X, GitCompareArrows, RotateCcw } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { diffContext } from '$lib/editor/diff';
	import type { EditorSession } from '$lib/editor/session.svelte';
	let {
		session,
		close,
		discard
	}: { session: EditorSession; close: () => void; discard: () => void } = $props();
	let added = $derived(session.diff.filter((row) => row.type === 'add').length);
	let removed = $derived(session.diff.filter((row) => row.type === 'remove').length);
</script>

<aside
	aria-label="Code changes"
	class="flex min-h-0 flex-col border-l bg-card max-lg:fixed max-lg:inset-y-16 max-lg:right-0 max-lg:z-30 max-lg:w-[min(100vw,30rem)] max-lg:shadow-xl lg:w-[25rem] lg:shrink-0"
>
	<div class="flex items-center justify-between border-b p-5">
		<div class="flex items-center gap-2 font-semibold">
			<GitCompareArrows class="size-4" />Changes
			<span class="text-xs font-normal text-muted-foreground">+{added} −{removed}</span>
		</div>
		<Button variant="ghost" size="icon-sm" onclick={close} aria-label="Close changes"><X /></Button>
	</div>
	<div class="border-b px-5 py-3">
		<p class="truncate font-mono text-xs">{session.filename}</p>
	</div>
	{#if session.dirty}<div class="min-h-0 flex-1 overflow-auto py-3">
			<table class="w-full border-collapse font-mono text-xs">
				<tbody
					>{#each diffContext(session.diff) as line, index (index)}
						{#if line.type === 'gap'}<tr
								><td colspan="4" class="bg-muted px-4 py-2 text-center text-muted-foreground"
									>{line.count} unchanged lines</td
								></tr
							>{:else}<tr
								class={[
									line.type === 'add' && 'bg-primary/10',
									line.type === 'remove' && 'bg-destructive/10'
								]}
								><td class="w-9 px-2 text-right text-muted-foreground select-none"
									>{line.oldLine ?? ''}</td
								><td class="w-9 px-2 text-right text-muted-foreground select-none"
									>{line.newLine ?? ''}</td
								><td class="w-4 text-center"
									>{line.type === 'add' ? '+' : line.type === 'remove' ? '−' : ' '}</td
								><td class="py-0.5 pr-4 whitespace-pre">{line.text}</td></tr
							>{/if}{/each}</tbody
				>
			</table>
		</div>
		<div class="border-t p-4">
			<Button variant="outline" size="sm" onclick={discard}><RotateCcw />Discard changes</Button>
		</div>
	{:else}<div class="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
			<p class="text-sm text-muted-foreground">No pending changes</p>
		</div>{/if}
</aside>
