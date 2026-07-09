<script lang="ts">
	import { FileWarning } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { editor } from '$lib/state/editor.svelte';

	const compilerDetails = $derived.by(() => {
		const error = editor.parseError;
		return error?.details ?? error?.message ?? '';
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
	<Dialog.Content
		class="max-h-[85vh] w-[min(calc(100vw-2rem),34rem)] overflow-hidden text-base sm:max-w-none"
	>
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

		{#if compilerDetails}
			<ScrollArea class="max-h-[45vh] rounded-md border bg-muted/20">
				<pre
					class="whitespace-pre-wrap break-words p-3 font-mono text-base text-muted-foreground">{compilerDetails}</pre>
			</ScrollArea>
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
