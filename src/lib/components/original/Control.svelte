<script lang="ts">
	import { onMount, untrack, tick } from 'svelte';
	import { useDrafts } from '$lib/ui/drafts';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Select from '$lib/components/ui/select';
	let {
		label = '',
		ariaLabel = label,
		value,
		commit,
		disabled = false,
		multiline = false,
		options = [],
		prefix = '',
		mono = false,
		placeholder = '',
		dataName = '',
		type = 'text'
	}: {
		label?: string;
		ariaLabel?: string;
		value: string;
		commit: (value: string) => Promise<boolean>;
		disabled?: boolean;
		multiline?: boolean;
		options?: string[];
		prefix?: string;
		mono?: boolean;
		placeholder?: string;
		dataName?: string;
		type?: string;
	} = $props();
	let draft = $derived(value);
	let failure = $state<string | undefined>();
	let invalid = $derived(failure === draft && draft !== value);
	const drafts = useDrafts();
	let pending: Promise<boolean> | undefined;
	let element = $state<HTMLLabelElement | null>(null);
	function draftKey() {
		const scope = element?.closest('[data-field-card],[data-register-editor],[data-folder-view]');
		return `${scope?.getAttribute('data-field-card') ?? scope?.getAttribute('data-register-editor') ?? scope?.getAttribute('data-folder-view') ?? 'document'}:${ariaLabel}`;
	}
	onMount(() =>
		drafts.register({
			key: draftKey,
			dirty: () => draft !== value,
			value: () => draft,
			restore: (text) => (draft = text),
			apply
		})
	);
	$effect(() => {
		void draft;
		void value;
		if (element) untrack(() => drafts.changed());
	});
	function apply(): Promise<boolean> {
		if (pending) return pending;
		if (draft === value) return Promise.resolve(true);
		pending = drafts
			.enqueue(async () => {
				if (draft === value) return true;
				const candidate = draft;
				const candidateKey = draftKey();
				const accepted = await commit(candidate);
				await tick();
				if (accepted) drafts.accept(candidateKey);
				failure = accepted ? undefined : candidate;
				return accepted;
			})
			.finally(() => (pending = undefined));
		return pending;
	}

	const keydown = (event: KeyboardEvent) => {
		if (event.key === 'Enter' && !multiline) {
			event.preventDefault();
			void apply();
		}
		if (event.key === 'Escape') {
			draft = value;
			failure = undefined;
		}
	};
</script>

<label bind:this={element} class="block min-w-0 space-y-1"
	><span class="text-xs font-medium text-foreground">{label}</span><span
		class="group/error relative block"
	>
		{#if options.length}<Select.Root
				type="single"
				value={draft}
				onValueChange={(next) => {
					draft = next;
					void apply();
				}}
				{disabled}
				><Select.Trigger class="w-full" aria-label={ariaLabel}>{draft}</Select.Trigger
				><Select.Content
					>{#each options as option (option)}<Select.Item value={option}>{option}</Select.Item
						>{/each}</Select.Content
				></Select.Root
			>
		{:else if multiline}<Textarea
				class="min-h-16"
				aria-label={ariaLabel}
				bind:value={draft}
				{disabled}
				{placeholder}
				onblur={apply}
				onkeydown={keydown}
				aria-invalid={invalid}
			/>
		{:else}<span
				class="flex items-center rounded-md border border-input bg-input/20 focus-within:ring-2 focus-within:ring-ring/30"
				>{#if prefix}<span class="shrink-0 pl-3 font-mono text-sm text-muted-foreground"
						>{prefix}</span
					>{/if}<Input
					aria-label={ariaLabel}
					data-control={dataName || undefined}
					bind:value={draft}
					{disabled}
					{type}
					{placeholder}
					class={[
						'min-w-0 border-0 bg-transparent shadow-none focus-visible:ring-0',
						mono && 'font-mono'
					]}
					onblur={apply}
					onkeydown={keydown}
					aria-invalid={invalid}
				/></span
			>{/if}
		{#if invalid}<span
				class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-destructive"
				>!</span
			><span
				role="alert"
				class="absolute bottom-full left-0 z-20 mb-2 hidden rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow group-focus-within/error:block group-hover/error:block"
				>Invalid value</span
			>{/if}
	</span></label
>
