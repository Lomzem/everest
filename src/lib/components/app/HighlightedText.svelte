<script lang="ts">
	import { highlightTextParts, type HighlightRange, type HighlightPart } from '$lib/rdl/search';

	let { text, ranges = [] }: { text: string; ranges?: HighlightRange[] } = $props();
	let parts = $derived<HighlightPart[]>(highlightTextParts(text, ranges));
</script>

{#each parts as part, index (`${index}-${part.match}`)}
	{#if part.match}
		<mark class="rounded-sm bg-primary/15 px-0.5 text-inherit dark:bg-primary/25">
			{part.text}
		</mark>
	{:else}
		{part.text}
	{/if}
{/each}
