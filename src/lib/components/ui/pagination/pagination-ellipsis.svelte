<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef, type WithoutChildren } from '$lib/utils.js';
	import MoreHorizontalIcon from '@lucide/svelte/icons/more-horizontal';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithoutChildren<WithElementRef<HTMLAttributes<HTMLSpanElement>>> = $props();
</script>

<span
	bind:this={ref}
	aria-hidden="true"
	data-slot="pagination-ellipsis"
	class={cn(
		"size-7 items-center justify-center [&_svg:not([class*='size-'])]:size-3.5 flex items-center justify-center",
		className,
	)}
	{...restProps}
>
	<MoreHorizontalIcon />
	<span class="sr-only">More pages</span>
</span>
