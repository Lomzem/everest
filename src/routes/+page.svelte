<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { SvelteDate } from 'svelte/reactivity';
	import { provideDrafts } from '$lib/ui/drafts';
	import {
		FilePlus,
		FolderOpen,
		Copy,
		RefreshCw,
		Trash2,
		MousePointerClick,
		MountainSnow,
		Save,
		ShieldCheck,
		TriangleAlert,
		Upload
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Resizable from '$lib/components/ui/resizable';
	import { createEditorSession, type EditorLog } from '$lib/editor/session.svelte';
	import { Workspace } from '$lib/ui/workspace.svelte';
	import AppMenubar from '$lib/components/original/AppMenubar.svelte';
	import HierarchySidebar from '$lib/components/original/HierarchySidebar.svelte';
	import DocumentSearch from '$lib/components/original/DocumentSearch.svelte';
	import RegisterEditor from '$lib/components/original/RegisterEditor.svelte';
	import FolderView from '$lib/components/original/FolderView.svelte';
	import ProblemsPanel from '$lib/components/original/ProblemsPanel.svelte';
	import StatusBar from '$lib/components/original/StatusBar.svelte';
	import ShortcutsDialog from '$lib/components/original/ShortcutsDialog.svelte';
	import CreateRegisterDialog from '$lib/components/original/CreateRegisterDialog.svelte';
	import MoveDialog from '$lib/components/original/MoveDialog.svelte';
	let restoringDrafts = false;
	const drafts = provideDrafts((values) => {
		if (!restoringDrafts) session.setFormDrafts(values);
	});
	function revealDraft(key: string) {
		const scope = key.slice(0, key.indexOf(':'));
		const node = session.compilation.nodes.find((n) => n.id === scope);
		if (node) {
			workspace.selectedGroup = undefined;
			session.select(node.kind === 'field' ? node.parentId! : node.id);
			if (node.kind === 'field')
				workspace.expandedFields = [...new Set([...workspace.expandedFields, node.id])];
			return true;
		}
		if (
			key.endsWith(':Folder display name') &&
			(!scope ||
				session.emptyGroups.includes(scope) ||
				session.compilation.groups?.some((group) => group.path === scope))
		) {
			workspace.selectedGroup = scope;
			return true;
		}
		return false;
	}
	async function prepare() {
		for (let attempt = 0; attempt < 100; attempt++) {
			if (await drafts.flush()) return true;
			const key = drafts.hiddenKey;
			if (!key) return false;
			if (!revealDraft(key)) {
				drafts.accept(key);
				continue;
			}
			await tick();
			drafts.restore(drafts.values);
			await tick();
		}
		return false;
	}
	async function perform(action: () => unknown) {
		if (await prepare()) await action();
	}
	const session = createEditorSession(),
		workspace = new Workspace(session);
	let displayedLogs = $state<EditorLog[]>([]);
	let clipboardError = $state('');
	$effect(() => {
		if (workspace.logsOpen) displayedLogs = [...session.logs];
	});
	async function copyReport(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			clipboardError = '';
		} catch {
			clipboardError = 'The report could not be copied.';
		}
	}
	let ready = $state(false),
		confirm = $state<(() => void) | undefined>(),
		parseDismissed = $state(false),
		conflictDismissed = $state(false),
		shortcutsOpen = $state(false),
		draggingFile = $state(false);
	let selected = $derived(session.compilation.nodes.find((n) => n.id === session.selectedId));
	let register = $derived(
		selected?.kind === 'field'
			? session.compilation.nodes.find((n) => n.id === selected.parentId)
			: selected
	);
	function resetView(preserveRecovery = false) {
		drafts.reset();
		workspace.createdNodeIds = [];
		workspace.selectedGroup = '';
		if (!preserveRecovery) workspace.emptyGroups = [];
		workspace.expandedNodes = [''];
		workspace.expandedFields = [];
		workspace.search = '';
		parseDismissed = false;
		conflictDismissed = false;
	}
	async function load(kind: 'new' | 'open') {
		if (await (kind === 'new' ? session.newDocument() : session.open())) resetView();
	}
	function openDroppedFile(file: File) {
		void request(async () => {
			if (await session.open(file)) resetView();
		});
	}
	function dropFile(event: DragEvent) {
		event.preventDefault();
		draggingFile = false;
		const file = event.dataTransfer?.files?.[0];
		if (file) openDroppedFile(file);
	}
	async function request(action: () => void) {
		if (!(await prepare())) return;
		if (session.dirty) confirm = action;
		else action();
	}
	function keyboard(event: KeyboardEvent) {
		const target = event.target;
		const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
		if (event.key === '?' && !typing && !event.ctrlKey && !event.metaKey) {
			event.preventDefault();
			shortcutsOpen = true;
			return;
		}
		if (event.key === '/' && !typing) {
			event.preventDefault();
			document.querySelector<HTMLInputElement>('[aria-label="Search registers"]')?.focus();
		}
		if (!(event.ctrlKey || event.metaKey)) return;
		const key = event.key.toLowerCase();
		if (['s', 'o', 'n', 'q', 'k', 'z', 'y', '+', '=', '-', '0'].includes(key))
			event.preventDefault();
		if (key === 's') {
			conflictDismissed = false;
			void perform(() => (event.shiftKey ? session.saveAs() : session.save()));
		}
		if (key === 'o') request(() => void load('open'));
		if (key === 'n') request(() => void load('new'));
		if (key === 'q')
			request(() => {
				session.close();
				resetView();
			});
		if (key === 'k')
			document.querySelector<HTMLInputElement>('[aria-label="Search registers"]')?.focus();
		if (key === 'z') void perform(() => (event.shiftKey ? session.redo() : session.undo()));
		if (key === 'y') void perform(() => session.redo());
		if (key === '+' || key === '=') workspace.zoom = Math.min(200, workspace.zoom + 10);
		if (key === '-') workspace.zoom = Math.max(70, workspace.zoom - 10);
		if (key === '0') workspace.zoom = 100;
	}
	onMount(() => {
		ready = true;
		const cleanupPreferences = workspace.initializePreferences();
		workspace.expandedNodes = [''];
		try {
			const stored = localStorage.getItem('everest-original-theme');
			workspace.setTheme(stored === 'light' || stored === 'system' ? stored : 'dark');
		} catch {
			workspace.setTheme('dark');
		}
		void session.restore();
		return () => {
			cleanupPreferences();
			session.dispose();
		};
	});
</script>

<svelte:head
	><title
		>{session.hasDocument ? `${session.dirty ? '* ' : ''}${session.filename}` : 'Everest'}</title
	></svelte:head
>
<svelte:window
	onkeydown={keyboard}
	ondragover={(event) => event.preventDefault()}
	ondrop={(event) => event.preventDefault()}
	onbeforeunload={(event) => {
		if (session.dirty || drafts.dirty) {
			event.preventDefault();
			event.returnValue = '';
		}
	}}
/>
<svelte:document
	onvisibilitychange={() => {
		if (document.visibilityState === 'hidden') void session.flushPersistence();
	}}
/>
<div
	class="flex h-screen min-h-[720px] flex-col bg-background text-foreground"
	style:zoom={workspace.zoom / 100}
	inert={!ready}
>
	<AppMenubar
		run={perform}
		{session}
		{workspace}
		open={() => request(() => void load('open'))}
		newDocument={() => request(() => void load('new'))}
		shortcuts={() => (shortcutsOpen = true)}
		quit={() =>
			request(() => {
				session.close();
				resetView();
			})}
	/>{#if !session.hasDocument}<main
			class="flex min-h-0 flex-1 items-center justify-center bg-background p-6 text-foreground"
			ondragover={(event) => {
				event.preventDefault();
				draggingFile = true;
			}}
			ondragenter={(event) => {
				event.preventDefault();
				draggingFile = true;
			}}
			ondragleave={(event) => {
				const next = event.relatedTarget;
				if (!(next instanceof Node) || !event.currentTarget.contains(next)) draggingFile = false;
			}}
			ondrop={dropFile}
		>
			<section
				class={[
					'w-full max-w-md rounded-xl border bg-card p-8 text-card-foreground shadow-sm transition-colors',
					draggingFile && 'border-primary ring-2 ring-primary/25'
				]}
			>
				<div class="flex flex-col items-center text-center">
					<span
						aria-hidden="true"
						class="grid size-12 place-items-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/20 ring-inset"
						><MountainSnow size={24} /></span
					>
					<h1 class="mt-4 text-2xl font-semibold tracking-tight">Everest</h1>
					<p class="mt-1.5 text-sm text-muted-foreground">
						Edit SystemRDL registers and fields in a visual editor.
					</p>
				</div>
				<div class="mt-6 flex flex-col gap-2">
					<Button size="lg" disabled={session.busy} onclick={() => load('open')}
						><FolderOpen size={15} />Open RDL</Button
					><Button variant="outline" size="lg" disabled={session.busy} onclick={() => load('new')}
						><FilePlus size={15} />New RDL</Button
					>
				</div>
				<div
					class={[
						'mt-3 flex items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-xs transition-colors',
						draggingFile
							? 'border-primary bg-primary/5 font-medium text-foreground'
							: 'border-border text-muted-foreground'
					]}
				>
					<Upload size={13} />
					{draggingFile ? 'Drop to open' : 'Or drop a .rdl file here'}
				</div>
				<ul class="mt-6 space-y-2.5 border-t pt-5 text-xs text-muted-foreground">
					<li class="flex items-start gap-2">
						<ShieldCheck size={14} class="mt-px shrink-0 text-chart-2" />
						<span>Files stay on your device. All work happens in the browser.</span>
					</li>
					<li class="flex items-start gap-2">
						<MousePointerClick size={14} class="mt-px shrink-0 text-primary" />
						<span>Change registers, fields, and encodings with visual controls.</span>
					</li>
					<li class="flex items-start gap-2">
						<Save size={14} class="mt-px shrink-0 text-muted-foreground" />
						<span>Save back to the opened file, or download a new copy.</span>
					</li>
				</ul>
				<p class="mt-4 border-t pt-4 text-center text-xs text-muted-foreground">
					Press
					<kbd
						class="rounded border bg-muted px-1 py-0.5 font-sans text-[10px] font-medium text-foreground/80"
						>?</kbd
					>
					for keyboard shortcuts.
				</p>
			</section>
		</main>{:else}<div class="flex min-h-0 flex-1 flex-col bg-background">
			<div class="flex min-h-0 flex-1">
				{#if workspace.leftCollapsed}<HierarchySidebar {session} {workspace} />
					<div class="min-w-0 flex-1">{@render editorPane()}</div>{:else}<Resizable.PaneGroup
						direction="horizontal"
						autoSaveId="everest-original-layout"
						><Resizable.Pane defaultSize={22} minSize={20} maxSize={40}
							><HierarchySidebar {session} {workspace} /></Resizable.Pane
						><Resizable.Handle withHandle /><Resizable.Pane minSize={50}
							>{@render editorPane()}</Resizable.Pane
						></Resizable.PaneGroup
					>{/if}
			</div>
			<ProblemsPanel {session} {workspace} />
			<StatusBar {session} {workspace} />
		</div>{/if}
</div>
{#snippet editorPane()}<div class="flex h-full min-w-0 flex-col">
		<header class="relative z-40 border-b bg-background/95 px-3 py-2 backdrop-blur">
			<DocumentSearch {session} {workspace} />
		</header>
		<main class="min-h-0 min-w-0 flex-1 overflow-auto">
			{#if session.compilation.valid}{#if workspace.selectedGroup !== undefined || !register || register.kind !== 'reg'}<FolderView
						{session}
						{workspace}
					/>{:else}<RegisterEditor {session} node={register} {workspace} />{/if}{/if}
			{#if !session.compilation.valid}<div class="flex h-full items-center justify-center p-6">
					<section
						class="w-full max-w-sm rounded-xl border bg-card p-6 text-center text-card-foreground shadow-sm"
					>
						<span
							aria-hidden="true"
							class="mx-auto grid size-10 place-items-center rounded-lg bg-destructive/10 text-destructive"
							><TriangleAlert size={20} /></span
						>
						<h2 class="mt-3 text-base font-semibold">This document has errors</h2>
						<p class="mt-1 text-sm text-muted-foreground">
							{session.compilation.diagnostics.length}
							{session.compilation.diagnostics.length === 1 ? 'problem blocks' : 'problems block'}
							saving. The file stays unchanged until you correct it.
						</p>
						<Button variant="outline" class="mt-4" onclick={() => (workspace.problemsOpen = true)}
							>Show problems</Button
						>
					</section>
				</div>{/if}
		</main>
	</div>{/snippet}
{#if session.hasDocument && session.compilation.valid}<CreateRegisterDialog
		{session}
		{workspace}
	/><MoveDialog {session} {workspace} />{/if}
<ShortcutsDialog bind:open={shortcutsOpen} />
<Dialog.Root
	open={!!confirm}
	onOpenChange={(open) => {
		if (!open) confirm = undefined;
	}}
	><Dialog.Content
		><Dialog.Header
			><Dialog.Title>Unsaved changes</Dialog.Title><Dialog.Description
				>You have unsaved changes. Discard them and continue?</Dialog.Description
			></Dialog.Header
		><Dialog.Footer
			><Button variant="outline" onclick={() => (confirm = undefined)}>Cancel</Button><Button
				variant="destructive"
				onclick={() => {
					const action = confirm;
					confirm = undefined;
					action?.();
				}}>Discard changes</Button
			></Dialog.Footer
		></Dialog.Content
	></Dialog.Root
>
<Dialog.Root
	open={session.hasDocument && !session.compilation.valid && !parseDismissed}
	onOpenChange={(open) => (parseDismissed = !open)}
	><Dialog.Content class="sm:max-w-2xl"
		><Dialog.Header
			><Dialog.Title>Unable to open RDL</Dialog.Title><Dialog.Description
				>The file contains errors.</Dialog.Description
			></Dialog.Header
		>
		<div class="max-h-80 overflow-auto">
			{#each session.compilation.diagnostics as item, index (index)}<p class="mb-3 text-sm">
					Line {item.line}:{item.column} — {item.message}
				</p>{/each}
		</div>
		<Dialog.Footer
			><Button
				variant="outline"
				onclick={() =>
					copyReport(
						session.compilation.diagnostics
							.map((d) => `${d.line}:${d.column} ${d.message}`)
							.join('\n')
					)}><Copy size={14} />Copy report</Button
			><Button
				variant="outline"
				onclick={() => {
					parseDismissed = true;
					workspace.problemsOpen = true;
				}}>View diagnostics</Button
			><Button onclick={() => (parseDismissed = true)}>Close</Button></Dialog.Footer
		></Dialog.Content
	></Dialog.Root
>
<Dialog.Root
	open={session.saveFailed && !conflictDismissed}
	onOpenChange={(open) => (conflictDismissed = !open)}
	><Dialog.Content
		><Dialog.Header
			><Dialog.Title>File changed on disk</Dialog.Title><Dialog.Description
				>{session.error}</Dialog.Description
			></Dialog.Header
		><Dialog.Footer
			><Button variant="outline" onclick={() => (conflictDismissed = true)}>Cancel</Button><Button
				variant="outline"
				onclick={async () => {
					if (await session.reload()) {
						resetView();
						conflictDismissed = true;
					}
				}}>Reload</Button
			><Button
				variant="outline"
				onclick={async () => {
					if (await session.saveAs()) conflictDismissed = true;
				}}>Save As...</Button
			><Button
				variant="destructive"
				onclick={async () => {
					if (await session.overwrite()) conflictDismissed = true;
				}}>Overwrite</Button
			></Dialog.Footer
		></Dialog.Content
	></Dialog.Root
>
<Dialog.Root bind:open={workspace.logsOpen}
	><Dialog.Content class="sm:max-w-3xl"
		><Dialog.Header
			><Dialog.Title>Application Logs</Dialog.Title><Dialog.Description
				>Application events and errors.</Dialog.Description
			></Dialog.Header
		>
		{#if clipboardError}<p role="alert">{clipboardError}</p>{/if}
		<div class="flex gap-2">
			<Button variant="outline" onclick={() => copyReport(JSON.stringify(session.logs, null, 2))}
				><Copy size={14} />Copy report</Button
			><Button
				variant="outline"
				onclick={() => {
					displayedLogs = [...session.logs];
				}}><RefreshCw size={14} />Refresh</Button
			><Button
				variant="outline"
				onclick={() => {
					session.clearLogs();
					displayedLogs = [];
				}}><Trash2 size={14} />Clear</Button
			>
		</div>
		<div class="max-h-96 overflow-auto rounded border p-3 font-mono text-xs">
			{#each displayedLogs as log, index (index)}<p class="mb-2 whitespace-pre-wrap">
					{log.timestamp} [{log.source}] {log.message}
				</p>
				{#if log.details}<details class="mb-3">
						<summary>Technical details</summary>
						<pre class="whitespace-pre-wrap">{log.details}</pre>
					</details>{/if}{:else}No logs.{/each}
		</div></Dialog.Content
	></Dialog.Root
>
<Dialog.Root open={!!session.pendingRecovery} onOpenChange={() => {}}
	><Dialog.Content
		><Dialog.Header
			><Dialog.Title>Resume unsaved work?</Dialog.Title><Dialog.Description
				>{session.pendingRecovery?.filename} · {session.pendingRecovery?.timestamp
					? new SvelteDate(session.pendingRecovery.timestamp).toLocaleString()
					: ''}</Dialog.Description
			></Dialog.Header
		><Dialog.Footer
			><Button variant="outline" disabled={session.busy} onclick={() => session.discardRecovery()}
				>Discard</Button
			><Button
				disabled={session.busy}
				onclick={async () => {
					const recoveredDrafts = { ...session.pendingRecovery?.formDrafts };
					restoringDrafts = true;
					try {
						if (await session.resumeRecovery()) {
							resetView(true);
							drafts.restore(recoveredDrafts);
							if (
								session.compilation.nodes.some(
									(n) => n.id === session.selectedId && n.kind === 'reg'
								)
							)
								workspace.selectedGroup = undefined;
							for (const key of Object.keys(recoveredDrafts)) revealDraft(key);
							await tick();
							drafts.restore(recoveredDrafts);
							await tick();
							session.setFormDrafts(recoveredDrafts);
						}
					} finally {
						restoringDrafts = false;
					}
				}}>Resume</Button
			></Dialog.Footer
		>{#if session.persistenceError || session.error}<p role="alert" class="text-sm">
				{session.persistenceError || session.error}
			</p>{/if}</Dialog.Content
	></Dialog.Root
>

<Dialog.Root
	open={!session.hasDocument && !session.pendingRecovery && !!session.error}
	onOpenChange={(open) => {
		if (!open) session.clearError();
	}}
	><Dialog.Content
		><Dialog.Header
			><Dialog.Title>File operation failed</Dialog.Title><Dialog.Description
				>{session.error}</Dialog.Description
			></Dialog.Header
		><Dialog.Footer><Button onclick={() => session.clearError()}>Close</Button></Dialog.Footer
		></Dialog.Content
	></Dialog.Root
>
