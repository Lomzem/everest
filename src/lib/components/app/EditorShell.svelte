<script lang="ts">
	import * as Resizable from '$lib/components/ui/resizable';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import FolderView from './FolderView.svelte';
	import HierarchySidebar from './HierarchySidebar.svelte';
	import RegisterEditor from './RegisterEditor.svelte';
	import { editor } from '$lib/state/editor.svelte';
	import { ui } from '$lib/state/ui.svelte';
</script>

<div class="flex min-h-0 flex-1 flex-col bg-background text-foreground">
	{#if editor.readOnly}
		<div
			class="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-base text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
		>
			Read-only: {editor.readOnlyReason}
		</div>
	{/if}
	<div class="flex min-h-0 flex-1">
		{#if ui.leftCollapsed}
			<HierarchySidebar />
			<ScrollArea class="min-w-0 flex-1 bg-background">
				{#if editor.selectedKind === 'folder' && editor.selectedFolder}
					<FolderView />
				{:else}
					<RegisterEditor />
				{/if}
			</ScrollArea>
		{:else}
			<Resizable.PaneGroup direction="horizontal" autoSaveId="editor-shell-layout">
				<Resizable.Pane defaultSize={22} minSize={14} maxSize={40}>
					<HierarchySidebar resizable />
				</Resizable.Pane>
				<Resizable.Handle withHandle />
				<Resizable.Pane minSize={50}>
					<ScrollArea class="h-full min-w-0 bg-background">
						{#if editor.selectedKind === 'folder' && editor.selectedFolder}
							<FolderView />
						{:else}
							<RegisterEditor />
						{/if}
					</ScrollArea>
				</Resizable.Pane>
			</Resizable.PaneGroup>
		{/if}
	</div>
</div>
