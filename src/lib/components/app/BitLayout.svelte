<script lang="ts">
	import { buildBitAxisLabels, buildBitSegments } from '$lib/rdl/bit-layout';
	import { editor } from '$lib/state/editor.svelte';

	const bitSegments = $derived(buildBitSegments(editor.selectedRegister));
	const bitAxisLabels = $derived(buildBitAxisLabels(editor.selectedRegister.width));
</script>

<section class="px-8 py-6">
	<div class="mb-3 flex items-center justify-between">
		<h2 class="text-base font-semibold">Bit Layout</h2>
	</div>

	<div class="relative mb-1 h-4 text-base text-muted-foreground">
		{#each bitAxisLabels as label (label.value)}
			<span class="absolute top-0 -translate-x-1/2" style={`left: ${label.position}%;`}>
				{label.value}
			</span>
		{/each}
	</div>
	<div
		class="grid h-12 overflow-hidden rounded-md border border-border"
		style={`grid-template-columns: repeat(${editor.selectedRegister.width}, minmax(0, 1fr));`}
	>
		{#each bitSegments as segment (segment.key)}
			<button
				class={`min-w-0 border-r px-2 text-center text-base font-medium ${segment.classes} ${
					segment.fieldId === editor.selectedFieldId
						? 'outline outline-2 outline-primary outline-offset-[-2px]'
						: ''
				}`}
				style={`grid-column: span ${segment.span} / span ${segment.span};`}
				onclick={() => segment.fieldId && (editor.selectedFieldId = segment.fieldId)}
				title={segment.label}
			>
				<span class="block truncate">{segment.label}</span>
			</button>
		{/each}
	</div>
</section>
