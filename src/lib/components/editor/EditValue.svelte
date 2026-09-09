<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	let {
		label,
		value,
		commit,
		disabled = false,
		type = 'text',
		options = [],
		hint = ''
	}: {
		label: string;
		value: string;
		commit: (value: string) => Promise<boolean>;
		disabled?: boolean;
		type?: string;
		options?: string[];
		hint?: string;
	} = $props();
	let draft = $derived(value);
	let failedValue = $state<string | undefined>();
	let invalid = $derived(failedValue === draft && draft !== value);
	async function apply() {
		if (draft !== value) failedValue = (await commit(draft)) ? undefined : draft;
	}
</script>

<label class="flex min-w-0 flex-col gap-2 text-sm">
	<span class="font-medium">{label}</span>
	{#if options.length}<select
			aria-label={label}
			class="h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
			bind:value={draft}
			onchange={(event) => {
				draft = event.currentTarget.value;
				void apply();
			}}
			{disabled}
			aria-invalid={invalid}
			>{#each options as option (option)}<option value={option}>{option || 'Not set'}</option
				>{/each}</select
		>
	{:else}<Input
			aria-label={label}
			{type}
			bind:value={draft}
			{disabled}
			aria-invalid={invalid}
			onblur={apply}
			onkeydown={(event) => {
				if (event.key === 'Enter') void apply();
				if (event.key === 'Escape') {
					draft = value;
					failedValue = undefined;
				}
			}}
		/>{/if}
	{#if hint}<span class="text-xs text-muted-foreground">{hint}</span>{/if}
	{#if invalid}<span class="text-xs text-destructive dark:text-foreground"
			>Check this value. The edit was not applied.</span
		>{/if}
</label>
