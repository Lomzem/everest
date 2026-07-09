<script lang="ts">
	import { FileWarning } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { editor } from '$lib/state/editor.svelte';

	const fileName = $derived.by(() => {
		const path = editor.parseError?.path ?? '';
		return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
	});
	const location = $derived.by(() => {
		const error = editor.parseError;
		if (!error?.line) return '';
		return `Line ${error.line}${error.column ? `, column ${error.column}` : ''}`;
	});
</script>

<Dialog.Root
	bind:open={
		() => editor.parseErrorDialogOpen,
		(nextOpen) => {
			if (nextOpen) {
				editor.parseErrorDialogOpen = true;
				return;
			}
			editor.closeParseError();
		}
	}
>
	<Dialog.Content class="max-h-[85vh] max-w-2xl text-base">
		<Dialog.Header>
			<div class="flex items-start gap-3 pr-6">
				<FileWarning class="mt-0.5 size-5 shrink-0 text-destructive" />
				<div class="min-w-0 space-y-1">
					<Dialog.Title class="text-base">Could not open RDL file</Dialog.Title>
					<Dialog.Description class="break-all text-base">
						{editor.parseError?.path ?? ''}
					</Dialog.Description>
				</div>
			</div>
		</Dialog.Header>

		{#if editor.parseError}
			<div class="space-y-4">
				<div class="rounded-md border border-destructive/30 bg-destructive/10 p-3">
					<p class="text-base font-medium text-destructive">{editor.parseError.message}</p>
					{#if location}
						<p class="mt-1 text-base text-destructive/80">{location}</p>
					{/if}
				</div>

				{#if editor.parseError.snippet}
					<div class="space-y-2">
						<p class="text-base font-medium">{fileName}</p>
						<pre
							class="overflow-x-auto rounded-md border bg-muted/30 p-3 font-mono text-base whitespace-pre">{editor
								.parseError.snippet}</pre>
					</div>
				{/if}

				{#if editor.parseError.details && editor.parseError.details !== editor.parseError.snippet}
					<ScrollArea class="max-h-48 rounded-md border bg-muted/20">
						<pre class="p-3 font-mono text-base whitespace-pre-wrap text-muted-foreground">{editor
								.parseError.details}</pre>
					</ScrollArea>
				{/if}
			</div>
		{/if}

		<Dialog.Footer>
			<Button
				type="button"
				variant="outline"
				class="text-base"
				onclick={() => editor.closeParseError()}
			>
				Close
			</Button>
			<Button type="button" class="text-base" onclick={() => editor.showParseErrorDiagnostics()}>
				View diagnostics
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
