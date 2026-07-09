<script lang="ts">
	import { RefreshCw, Trash2 } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { diagnostics } from '$lib/state/diagnostics.svelte';

	const timestampFormatter = new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'medium',
	});

	function formatTimestamp(timestamp: string) {
		const date = new Date(timestamp);
		return Number.isNaN(date.getTime()) ? timestamp : timestampFormatter.format(date);
	}
</script>

<Dialog.Root bind:open={diagnostics.open}>
	<Dialog.Content class="max-h-[85vh] max-w-3xl text-base">
		<Dialog.Header>
			<div class="flex items-start justify-between gap-4 pr-6">
				<div class="min-w-0 space-y-1">
					<Dialog.Title class="text-base">Diagnostics</Dialog.Title>
					<Dialog.Description class="break-all text-base">
						{diagnostics.path || 'No diagnostics path loaded'}
					</Dialog.Description>
				</div>
				<div class="flex shrink-0 items-center gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						class="text-base"
						disabled={diagnostics.loading}
						onclick={() => diagnostics.refresh()}
					>
						<RefreshCw class="size-4" />
						Refresh
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						class="text-base"
						disabled={diagnostics.loading || diagnostics.entries.length === 0}
						onclick={() => diagnostics.clear()}
					>
						<Trash2 class="size-4" />
						Clear
					</Button>
				</div>
			</div>
		</Dialog.Header>

		{#if diagnostics.error}
			<p
				class="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-base text-destructive"
			>
				{diagnostics.error}
			</p>
		{/if}

		{#if diagnostics.ignoredLines > 0}
			<p class="text-base text-muted-foreground">
				Skipped {diagnostics.ignoredLines} malformed log
				{diagnostics.ignoredLines === 1 ? 'line' : 'lines'}.
			</p>
		{/if}

		<ScrollArea class="h-[50vh] rounded-md border bg-muted/20">
			{#if diagnostics.loading}
				<p class="p-4 text-base text-muted-foreground">Loading diagnostics...</p>
			{:else if diagnostics.entries.length === 0}
				<p class="p-4 text-base text-muted-foreground">No persisted app errors.</p>
			{:else}
				<ol class="divide-y">
					{#each diagnostics.entries as entry (`${entry.timestamp}:${entry.source}:${entry.message}`)}
						<li class="space-y-2 p-4">
							<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
								<span class="font-mono text-base text-muted-foreground">
									{formatTimestamp(entry.timestamp)}
								</span>
								<span class="rounded-md bg-destructive/10 px-2 py-1 text-base text-destructive">
									{entry.level}
								</span>
								<span class="font-mono text-base text-muted-foreground">{entry.source}</span>
							</div>
							<p class="text-base">{entry.message}</p>
							{#if entry.details}
								<pre
									class="whitespace-pre-wrap break-words font-mono text-base text-muted-foreground">{entry.details}</pre>
							{/if}
						</li>
					{/each}
				</ol>
			{/if}
		</ScrollArea>
	</Dialog.Content>
</Dialog.Root>
