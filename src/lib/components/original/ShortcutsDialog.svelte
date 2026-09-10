<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	let { open = $bindable(false) }: { open?: boolean } = $props();
	const shortcutGroups = [
		{
			title: 'File',
			items: [
				{ keys: ['Ctrl', 'N'], label: 'New RDL document' },
				{ keys: ['Ctrl', 'O'], label: 'Open an RDL file' },
				{ keys: ['Ctrl', 'S'], label: 'Save' },
				{ keys: ['Ctrl', 'Shift', 'S'], label: 'Save As' },
				{ keys: ['Ctrl', 'Q'], label: 'Quit' }
			]
		},
		{
			title: 'Edit',
			items: [
				{ keys: ['Ctrl', 'Z'], label: 'Undo' },
				{ keys: ['Ctrl', 'Y'], label: 'Redo' }
			]
		},
		{
			title: 'Find and navigate',
			items: [
				{ keys: ['Ctrl', 'K'], label: 'Search registers, fields, and encodings' },
				{ keys: ['/'], label: 'Focus the search field' },
				{ keys: ['↑', '↓'], label: 'Move through search results' },
				{ keys: ['Enter'], label: 'Open the selected result' }
			]
		},
		{
			title: 'View',
			items: [
				{ keys: ['Ctrl', '+'], label: 'Zoom in' },
				{ keys: ['Ctrl', '-'], label: 'Zoom out' },
				{ keys: ['Ctrl', '0'], label: 'Reset zoom' }
			]
		}
	];
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>Keyboard shortcuts</Dialog.Title>
			<Dialog.Description>Use these keys to work faster.</Dialog.Description>
		</Dialog.Header>
		<div class="grid max-h-[60vh] gap-5 overflow-auto sm:grid-cols-2">
			{#each shortcutGroups as group (group.title)}
				<section>
					<h3 class="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
						{group.title}
					</h3>
					<ul class="space-y-1.5">
						{#each group.items as item (item.label)}
							<li class="flex items-center justify-between gap-3 text-sm">
								<span>{item.label}</span>
								<span class="flex shrink-0 items-center gap-1">
									{#each item.keys as key (key)}<kbd
											class="rounded border border-muted-foreground/25 bg-muted px-1.5 py-0.5 font-sans text-[10px] font-medium text-foreground/80 shadow-xs"
											>{key}</kbd
										>{/each}
								</span>
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>Close</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
