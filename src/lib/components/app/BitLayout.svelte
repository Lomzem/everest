<script lang="ts">
	import { buildBitAxisLabels, buildBitOverlapRuns, buildBitRuns } from '$lib/rdl/bit-layout';
	import { editor } from '$lib/state/editor.svelte';

	const bitRuns = $derived(buildBitRuns(editor.selectedRegister));
	const bitOverlapRuns = $derived(buildBitOverlapRuns(editor.selectedRegister));
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
	<div class="relative h-12 overflow-hidden rounded-md border border-border">
		<div
			class="grid h-full"
			style={`grid-template-columns: repeat(${editor.selectedRegister.width}, minmax(0, 1fr));`}
		>
			{#each bitRuns as run (run.key)}
				<div
					class={`min-w-0 border-r px-2 text-center text-base font-medium ${run.classes} ${
						run.fieldId === editor.selectedFieldId
							? 'outline outline-2 outline-primary outline-offset-[-2px]'
							: ''
					}`}
					style={`grid-column: span ${run.span} / span ${run.span};`}
					title={run.label}
				></div>
			{/each}
		</div>
		<div
			class="pointer-events-none absolute inset-0 z-10 grid"
			style={`grid-template-columns: repeat(${editor.selectedRegister.width}, minmax(0, 1fr));`}
		>
			{#each bitOverlapRuns as overlap (overlap.key)}
				<button
					class="pointer-events-auto relative min-w-0 border-x border-destructive/70"
					style={`grid-column: ${overlap.columnStart} / span ${overlap.span}; background-color: color-mix(in oklch, var(--destructive) 16%, transparent); background-image: repeating-linear-gradient(135deg, color-mix(in oklch, var(--destructive) 70%, transparent) 0, color-mix(in oklch, var(--destructive) 70%, transparent) 4px, transparent 4px, transparent 8px);`}
					onclick={() => overlap.fieldId && (editor.selectedFieldId = overlap.fieldId)}
					title={overlap.label}
				>
					<span
						class="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-destructive text-base font-semibold text-destructive-foreground"
					>
						!
					</span>
				</button>
			{/each}
		</div>
		<div
			class="pointer-events-none absolute inset-0 z-20 grid"
			style={`grid-template-columns: repeat(${editor.selectedRegister.width}, minmax(0, 1fr));`}
		>
			{#each bitRuns as run (run.key)}
				<button
					class={`pointer-events-auto min-w-0 px-2 text-center text-base font-medium ${
						run.fieldId === editor.selectedFieldId
							? 'outline outline-2 outline-primary outline-offset-[-2px]'
							: ''
					}`}
					style={`grid-column: span ${run.span} / span ${run.span};`}
					onclick={() => run.fieldId && (editor.selectedFieldId = run.fieldId)}
					title={run.label}
				>
					<span class="block truncate">{run.label}</span>
				</button>
			{/each}
		</div>
	</div>
</section>
