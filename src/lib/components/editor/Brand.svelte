<script lang="ts">
	let { large = false }: { large?: boolean } = $props();
</script>

<div class="flex items-center gap-3" aria-label="Everest">
	<div
		class="flex items-center justify-center rounded-lg bg-primary text-primary-foreground"
		class:size-10={!large}
		class:size-14={large}
	>
		<svg
			width={large ? 34 : 25}
			height={large ? 34 : 25}
			viewBox="0 0 32 32"
			fill="none"
			aria-hidden="true"
			><path
				d="M3 25 13 7l5 9 3-5 8 14H3Z"
				stroke="currentColor"
				stroke-width="2"
				stroke-linejoin="round"
			/><path
				d="m10 13 3 3 3-3M19 16l2 3 2-3"
				stroke="currentColor"
				stroke-width="2"
				stroke-linejoin="round"
			/></svg
		>
	</div>
	<span class="font-semibold tracking-tight" class:text-xl={!large} class:text-3xl={large}
		>everest<span class="text-primary">.</span></span
	>
</div>
