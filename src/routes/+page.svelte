<script lang="ts">
	import { onMount } from 'svelte';
	import {
		FolderOpen,
		Plus,
		Undo2,
		Redo2,
		GitCompareArrows,
		Save,
		Download,
		Moon,
		Sun,
		Menu,
		CircleCheck,
		CircleAlert,
		LoaderCircle
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import Brand from '$lib/components/editor/Brand.svelte';
	import Navigation from '$lib/components/editor/Navigation.svelte';
	import NodeDetail from '$lib/components/editor/NodeDetail.svelte';
	import Changes from '$lib/components/editor/Changes.svelte';
	import { createEditorSession } from '$lib/editor/session.svelte';
	import { Workspace } from '$lib/ui/workspace.svelte';
	const session = createEditorSession();
	const workspace = new Workspace();
	let ready = $state(false);
	let confirmAction = $state<(() => void) | undefined>(),
		confirmText = $state('');
	let selected = $derived(
		session.compilation.nodes.find((node) => node.id === session.selectedId) ??
			session.compilation.roots[0]
	);
	function replace(action: () => void) {
		if (session.dirty) {
			confirmText = 'Open another document? Pending edits to this file will be lost.';
			confirmAction = action;
		} else action();
	}
	function discard() {
		confirmText =
			'Discard all pending changes? The document will return to the opened or last saved file.';
		confirmAction = () => {
			void session.discard();
		};
	}
	function keyboard(event: KeyboardEvent) {
		if (!(event.ctrlKey || event.metaKey)) return;
		if (event.key.toLowerCase() === 's') {
			event.preventDefault();
			if (session.hasDocument && session.compilation.valid) void session.save();
		}
		if (event.key.toLowerCase() === 'o') {
			event.preventDefault();
			replace(() => void session.open());
		}
		if (
			event.key.toLowerCase() === 'z' &&
			!(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
		) {
			event.preventDefault();
			if (event.shiftKey) void session.redo();
			else void session.undo();
		}
	}
	onMount(() => {
		ready = true;
		try {
			workspace.dark = localStorage.getItem('everest-theme') === 'dark';
			document.documentElement.classList.toggle('dark', workspace.dark);
		} catch {
			/* Theme preference is optional. */
		}
		return () => session.dispose();
	});
</script>

<svelte:head
	><title
		>{session.hasDocument ? `${session.filename} · Everest` : 'Everest — SystemRDL editor'}</title
	><meta
		name="description"
		content="A visual SystemRDL editor. Build register maps, review exact code changes, and keep your files on your device."
	/></svelte:head
>
<svelte:window
	onkeydown={keyboard}
	onbeforeunload={(event) => {
		if (session.dirty) {
			event.preventDefault();
			event.returnValue = '';
		}
	}}
/>
<div class="flex h-dvh min-h-0 flex-col overflow-hidden" inert={!ready}>
	<header
		class="z-30 flex h-17 shrink-0 items-center justify-between gap-3 border-b bg-card px-5 sm:px-7"
	>
		<div class="flex min-w-0 items-center gap-5">
			<Brand />{#if session.hasDocument}<div class="hidden h-5 w-px bg-border sm:block"></div>
				<span class="hidden truncate text-sm text-muted-foreground sm:block"
					>{session.filename}{#if session.dirty}<span
							class="ml-2 inline-block size-1.5 rounded-full bg-primary"
							aria-label="Unsaved changes"
						></span>{/if}</span
				>{/if}
		</div>
		<div class="flex shrink-0 items-center gap-2">
			{#if session.hasDocument}<Button
					variant="ghost"
					size="sm"
					onclick={() => replace(() => void session.open())}
					disabled={session.busy}><FolderOpen /><span class="max-sm:hidden">Open</span></Button
				>
				<div class="mx-1 h-5 w-px bg-border max-sm:hidden"></div>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Undo"
					title="Undo (Ctrl+Z)"
					disabled={!session.canUndo || session.busy}
					onclick={() => session.undo()}><Undo2 /></Button
				><Button
					variant="ghost"
					size="icon-sm"
					aria-label="Redo"
					title="Redo (Ctrl+Shift+Z)"
					disabled={!session.canRedo || session.busy}
					onclick={() => session.redo()}><Redo2 /></Button
				><Button
					variant={workspace.changesOpen ? 'secondary' : 'outline'}
					size="sm"
					aria-pressed={workspace.changesOpen}
					onclick={() => (workspace.changesOpen = !workspace.changesOpen)}
					><GitCompareArrows /><span class="max-sm:hidden">Changes</span>{#if session.dirty}<span
							class="size-1.5 rounded-full bg-primary"
						></span>{/if}</Button
				><Button
					size="sm"
					disabled={session.busy || !session.compilation.valid || !session.dirty}
					onclick={() => session.save()}
					>{#if session.canWriteBack}<Save />{:else}<Download />{/if}<span class="max-sm:hidden"
						>{session.canWriteBack ? 'Save' : 'Download RDL'}</span
					></Button
				>{/if}<Button
				variant="ghost"
				size="icon-sm"
				onclick={() => workspace.toggleTheme()}
				aria-label={workspace.dark ? 'Use light theme' : 'Use dark theme'}
				>{#if workspace.dark}<Sun />{:else}<Moon />{/if}</Button
			>
		</div>
	</header>
	{#if !session.hasDocument}
		<main class="flex flex-1 items-center justify-center gap-3 p-6">
			<Button onclick={() => session.open()} disabled={session.busy}
				><FolderOpen />Open .rdl file</Button
			>
			<Button variant="outline" onclick={() => session.newDocument()} disabled={session.busy}
				><Plus />New document</Button
			>
		</main>
	{:else}<div class="relative flex min-h-0 flex-1">
			{#if session.compilation.valid}<Navigation {session} {workspace} />
				<main class="min-w-0 flex-1 overflow-y-auto">
					<div class="border-b px-5 py-2 md:hidden">
						<Button
							variant="ghost"
							size="sm"
							onclick={() => (workspace.navigationOpen = !workspace.navigationOpen)}
							><Menu />Explorer</Button
						>
					</div>
					{#if selected}{#key selected.id}<NodeDetail
								{session}
								node={selected}
								{workspace}
							/>{/key}{:else}<div class="p-10 text-center text-muted-foreground">
							No components to display.
						</div>{/if}
				</main>{:else}<main class="mx-auto w-full max-w-3xl overflow-auto px-6 py-12">
					<CircleAlert class="mb-5 size-10 text-destructive" />
					<h1 class="text-2xl font-semibold">This file needs attention</h1>
					<p class="mt-3 text-sm leading-relaxed text-muted-foreground">
						Correct these errors in your source file, then open it again. Your file has not changed.
					</p>
					<div class="mt-7 space-y-3">
						{#each session.compilation.diagnostics as diagnostic, index (index)}<div
								class="rounded-lg border bg-card p-5"
							>
								<p class="mb-2 font-mono text-xs text-muted-foreground">
									Line {diagnostic.line}, column {diagnostic.column} · {diagnostic.code}
								</p>
								<p class="text-sm">{diagnostic.message}</p>
							</div>{/each}
					</div>
					<Button class="mt-7" onclick={() => session.open()}
						><FolderOpen />Open corrected file</Button
					>
				</main>{/if}{#if workspace.changesOpen}<Changes
					{session}
					close={() => (workspace.changesOpen = false)}
					{discard}
				/>{/if}
		</div>{/if}
	{#if session.error}<div
			role="alert"
			class="flex items-start gap-3 border-t bg-destructive/10 px-5 py-3 text-sm"
		>
			<CircleAlert class="mt-0.5 size-4 shrink-0" />
			<p class="flex-1">{session.error}</p>
			{#if session.saveFailed}<Button
					variant="outline"
					size="sm"
					onclick={() => session.download()}
					disabled={session.busy}><Download />Download RDL</Button
				>{/if}
		</div>{/if}
	{#if session.hasDocument || session.busy}
		<footer
			class="flex min-h-9 shrink-0 items-center justify-between gap-3 border-t bg-card px-5 py-2 text-[11px] text-muted-foreground"
		>
			<span class="flex items-center gap-2" role="status"
				>{#if session.busy}<LoaderCircle
						class="size-3 animate-spin"
					/>{:else if session.hasDocument && session.compilation.valid}<CircleCheck
						class="size-3"
					/>{/if}{session.status}</span
			><span class="shrink-0 max-sm:hidden"
				>{session.hasDocument
					? session.dirty
						? 'Unsaved changes'
						: 'No pending changes'
					: ''}</span
			>
		</footer>
	{/if}
</div>
<Dialog.Root
	open={!!confirmAction}
	onOpenChange={(open) => {
		if (!open) confirmAction = undefined;
	}}
	><Dialog.Content
		><Dialog.Header
			><Dialog.Title>Pending changes</Dialog.Title><Dialog.Description
				>{confirmText}</Dialog.Description
			></Dialog.Header
		><Dialog.Footer
			><Button variant="outline" onclick={() => (confirmAction = undefined)}>Keep editing</Button
			><Button
				variant="destructive"
				onclick={() => {
					const action = confirmAction;
					confirmAction = undefined;
					action?.();
				}}>Discard and continue</Button
			></Dialog.Footer
		></Dialog.Content
	></Dialog.Root
>
