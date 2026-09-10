<script lang="ts">
	import * as Menubar from '$lib/components/ui/menubar';
	import { Button } from '$lib/components/ui/button';
	import { Keyboard, Moon, MountainSnow, Save, Sun } from '@lucide/svelte';
	import type { EditorSession } from '$lib/editor/session.svelte';
	import type { Workspace } from '$lib/ui/workspace.svelte';
	let {
		session,
		workspace,
		open,
		newDocument,
		quit,
		run,
		shortcuts
	}: {
		session: EditorSession;
		workspace: Workspace;
		open: () => void;
		newDocument: () => void;
		quit: () => void;
		run: (action: () => unknown) => Promise<void>;
		shortcuts: () => void;
	} = $props();
	let canSave = $derived(session.hasDocument && session.compilation.valid && !session.busy);
</script>

<header class="shrink-0 border-b bg-background text-foreground">
	<div class="flex h-11 items-center gap-1 pr-2">
		<div class="flex shrink-0 items-center gap-2 pr-2 pl-3">
			<span
				aria-hidden="true"
				class="grid size-6 shrink-0 place-items-center rounded-md bg-primary/12 text-primary ring-1 ring-primary/25 ring-inset"
				><MountainSnow size={14} /></span
			>
			<span class="text-sm font-semibold tracking-tight">Everest</span>
		</div>
		<Menubar.Root class="h-8 w-fit rounded-none border-0 bg-transparent p-0 shadow-none"
			><Menubar.Menu
				><Menubar.Trigger>File</Menubar.Trigger><Menubar.Content align="start" class="min-w-52"
					><Menubar.Item onclick={newDocument}
						>New RDL<Menubar.Shortcut>Ctrl+N</Menubar.Shortcut></Menubar.Item
					><Menubar.Item onclick={open}
						>Open RDL...<Menubar.Shortcut>Ctrl+O</Menubar.Shortcut></Menubar.Item
					><Menubar.Separator /><Menubar.Item
						disabled={!canSave}
						onclick={() => run(() => session.save())}
						>Save<Menubar.Shortcut>Ctrl+S</Menubar.Shortcut></Menubar.Item
					><Menubar.Item disabled={!canSave} onclick={() => run(() => session.saveAs())}
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
				><Menubar.Trigger>Help</Menubar.Trigger><Menubar.Content class="min-w-52"
					><Menubar.Item onclick={shortcuts}
						>Keyboard Shortcuts<Menubar.Shortcut>?</Menubar.Shortcut></Menubar.Item
					><Menubar.Separator /><Menubar.Item onclick={() => (workspace.logsOpen = true)}
						>Application Logs</Menubar.Item
					></Menubar.Content
				></Menubar.Menu
			></Menubar.Root
		>
		<div class="ml-auto flex min-w-0 items-center gap-1.5">
			{#if session.hasDocument}<span
					class="hidden min-w-0 items-center gap-2 rounded-md border bg-card py-1 pr-2.5 pl-2 text-xs sm:inline-flex"
					title={session.filename}
				>
					<span
						aria-hidden="true"
						class={['size-1.5 shrink-0 rounded-full', session.dirty ? 'bg-primary' : 'bg-chart-2']}
					></span>
					<span class="max-w-[18rem] truncate font-medium">{session.filename}</span>
					<span class="sr-only">
						{session.dirty ? 'Unsaved changes' : 'All changes saved'}
					</span>
				</span>{/if}
			{#if session.hasDocument}<Button
					variant={session.dirty ? 'default' : 'outline'}
					size="sm"
					disabled={!canSave}
					title="Save (Ctrl+S)"
					onclick={() => run(() => session.save())}><Save size={14} />Save</Button
				>{/if}
			<Button
				variant="ghost"
				size="icon-sm"
				class="text-muted-foreground"
				aria-label={workspace.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
				title={workspace.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
				onclick={() => workspace.setTheme(workspace.theme === 'dark' ? 'light' : 'dark')}
				>{#if workspace.theme === 'dark'}<Sun />{:else}<Moon />{/if}</Button
			>
			<Button
				variant="ghost"
				size="icon-sm"
				class="text-muted-foreground"
				aria-label="Keyboard shortcuts"
				title="Keyboard shortcuts"
				onclick={shortcuts}><Keyboard /></Button
			>
		</div>
	</div>
</header>
