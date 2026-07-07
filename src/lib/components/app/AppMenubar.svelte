<script lang="ts">
	import * as Menubar from '$lib/components/ui/menubar';
	import { editor } from '$lib/state/editor.svelte';
</script>

<div class="shrink-0 border-b bg-background px-2 py-1 text-foreground">
	<Menubar.Root class="h-9 border-0 bg-transparent p-0 shadow-none">
		<Menubar.Menu>
			<Menubar.Trigger class="text-base">File</Menubar.Trigger>
			<Menubar.Content align="start" class="min-w-52">
				<Menubar.Item class="text-base" onclick={() => editor.requestNewDocument()}>
					New RDL
					<Menubar.Shortcut class="text-base tracking-normal">Ctrl+N</Menubar.Shortcut>
				</Menubar.Item>
				<Menubar.Item class="text-base" onclick={() => editor.requestOpenDocument()}>
					Open RDL...
					<Menubar.Shortcut class="text-base tracking-normal">Ctrl+O</Menubar.Shortcut>
				</Menubar.Item>
				<Menubar.Separator />
				<Menubar.Item
					class="text-base"
					disabled={editor.appView !== 'editor'}
					onclick={() => editor.saveDocument(false)}
				>
					Save
					<Menubar.Shortcut class="text-base tracking-normal">Ctrl+S</Menubar.Shortcut>
				</Menubar.Item>
				<Menubar.Item
					class="text-base"
					disabled={editor.appView !== 'editor'}
					onclick={() => editor.saveDocument(true)}
				>
					Save As...
					<Menubar.Shortcut class="text-base tracking-normal">Ctrl+Shift+S</Menubar.Shortcut>
				</Menubar.Item>
				<Menubar.Separator />
				<Menubar.Item class="text-base" onclick={() => editor.requestQuitApplication()}>
					Quit
					<Menubar.Shortcut class="text-base tracking-normal">Ctrl+Q</Menubar.Shortcut>
				</Menubar.Item>
			</Menubar.Content>
		</Menubar.Menu>

		<Menubar.Menu>
			<Menubar.Trigger class="text-base">Edit</Menubar.Trigger>
			<Menubar.Content align="start" class="min-w-44">
				<Menubar.Item class="text-base" disabled={!editor.canUndo} onclick={() => editor.undo()}>
					Undo
					<Menubar.Shortcut class="text-base tracking-normal">Ctrl+Z</Menubar.Shortcut>
				</Menubar.Item>
				<Menubar.Item class="text-base" disabled={!editor.canRedo} onclick={() => editor.redo()}>
					Redo
					<Menubar.Shortcut class="text-base tracking-normal">Ctrl+Y</Menubar.Shortcut>
				</Menubar.Item>
			</Menubar.Content>
		</Menubar.Menu>
	</Menubar.Root>
</div>
