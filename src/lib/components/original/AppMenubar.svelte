<script lang="ts">
	import * as Menubar from '$lib/components/ui/menubar';
	import type { EditorSession } from '$lib/editor/session.svelte';
	import type { Workspace } from '$lib/ui/workspace.svelte';
	let {
		session,
		workspace,
		open,
		newDocument,
		quit,
		run
	}: {
		session: EditorSession;
		workspace: Workspace;
		open: () => void;
		newDocument: () => void;
		quit: () => void;
		run: (action: () => unknown) => Promise<void>;
	} = $props();
</script>

<div class="shrink-0 border-b bg-background px-2 py-0.5 text-foreground">
	<Menubar.Root class="h-8 w-fit rounded-none border-0 bg-transparent p-0 shadow-none"
		><Menubar.Menu
			><Menubar.Trigger>File</Menubar.Trigger><Menubar.Content align="start" class="min-w-52"
				><Menubar.Item onclick={newDocument}
					>New RDL<Menubar.Shortcut>Ctrl+N</Menubar.Shortcut></Menubar.Item
				><Menubar.Item onclick={open}
					>Open RDL...<Menubar.Shortcut>Ctrl+O</Menubar.Shortcut></Menubar.Item
				><Menubar.Separator /><Menubar.Item
					disabled={!session.hasDocument || !session.compilation.valid || session.busy}
					onclick={() => run(() => session.save())}
					>Save<Menubar.Shortcut>Ctrl+S</Menubar.Shortcut></Menubar.Item
				><Menubar.Item
					disabled={!session.hasDocument || !session.compilation.valid || session.busy}
					onclick={() => run(() => session.saveAs())}
					>Save As...<Menubar.Shortcut>Ctrl+Shift+S</Menubar.Shortcut></Menubar.Item
				><Menubar.Separator /><Menubar.Item onclick={quit}
					>Quit<Menubar.Shortcut>Ctrl+Q</Menubar.Shortcut></Menubar.Item
				></Menubar.Content
			></Menubar.Menu
		><Menubar.Menu
			><Menubar.Trigger>Edit</Menubar.Trigger><Menubar.Content class="min-w-44"
				><Menubar.Item
					disabled={!session.canUndo && !Object.keys(session.formDrafts).length}
					onclick={() => run(() => session.undo())}
					>Undo<Menubar.Shortcut>Ctrl+Z</Menubar.Shortcut></Menubar.Item
				><Menubar.Item disabled={!session.canRedo} onclick={() => run(() => session.redo())}
					>Redo<Menubar.Shortcut>Ctrl+Y</Menubar.Shortcut></Menubar.Item
				></Menubar.Content
			></Menubar.Menu
		><Menubar.Menu
			><Menubar.Trigger>View</Menubar.Trigger><Menubar.Content class="min-w-48"
				><Menubar.Label>Zoom {workspace.zoom}%</Menubar.Label><Menubar.Separator /><Menubar.Item
					onclick={() => (workspace.zoom = Math.min(200, workspace.zoom + 10))}
					>Zoom In<Menubar.Shortcut>Ctrl++</Menubar.Shortcut></Menubar.Item
				><Menubar.Item onclick={() => (workspace.zoom = Math.max(70, workspace.zoom - 10))}
					>Zoom Out<Menubar.Shortcut>Ctrl+-</Menubar.Shortcut></Menubar.Item
				><Menubar.Item onclick={() => (workspace.zoom = 100)}
					>Reset Zoom<Menubar.Shortcut>Ctrl+0</Menubar.Shortcut></Menubar.Item
				></Menubar.Content
			></Menubar.Menu
		><Menubar.Menu
			><Menubar.Trigger>Help</Menubar.Trigger><Menubar.Content class="min-w-44"
				><Menubar.Item onclick={() => (workspace.logsOpen = true)}>Application Logs</Menubar.Item
				></Menubar.Content
			></Menubar.Menu
		></Menubar.Root
	>
</div>
