<script lang="ts">
	import { Minus, Plus, Download, PanelLeftClose, PanelLeftOpen } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import type { EditorSession } from '$lib/editor/session.svelte';
	import type { Workspace } from '$lib/ui/workspace.svelte';
	import { title } from '$lib/ui/original';
	let { session, workspace }: { session: EditorSession; workspace: Workspace } = $props();
	let registers = $derived(session.compilation.nodes.filter((node) => node.kind === 'reg'));
	let fields = $derived(session.compilation.nodes.filter((node) => node.kind === 'field'));
	let selected = $derived(session.compilation.nodes.find((node) => node.id === session.selectedId));
	let location = $derived.by(() => {
		const parts: string[] = [];
		const root = session.compilation.roots[0];
		if (root) parts.push(title(root));
		if (selected && selected.id !== root?.id) {
			if (selected.groupPath) parts.push(...selected.groupPath.split('/').filter(Boolean));
			const chain: string[] = [];
			let node: typeof selected | undefined = selected;
			while (node && node.id !== root?.id) {
				chain.unshift(title(node));
				node = session.compilation.nodes.find((item) => item.id === node?.parentId);
			}
			parts.push(...chain);
		} else if (workspace.selectedGroup) {
			parts.push(...workspace.selectedGroup.split('/').filter(Boolean));
		} else if (root) {
			parts.push('Overview');
		}
		return parts.filter(Boolean).join(' / ') || 'Overview';
	});
	let problems = $derived(session.compilation.diagnostics.length);
	let state = $derived.by(() => {
		if (!session.hasDocument) return { label: 'No document open', tone: 'idle' as const };
		if (problems) {
			return {
				label: `Fix ${problems} ${problems === 1 ? 'problem' : 'problems'} to save`,
				tone: 'error' as const
			};
		}
		if (session.dirty) return { label: 'Unsaved changes', tone: 'dirty' as const };
		return { label: 'All changes saved', tone: 'saved' as const };
	});
	const tones = {
		idle: 'bg-muted-foreground/50',
		dirty: 'bg-primary',
		saved: 'bg-chart-2',
		error: 'bg-destructive'
	};
	function step(amount: number) {
		workspace.zoom = Math.max(70, Math.min(200, workspace.zoom + amount));
	}
</script>

<footer
	class="shrink-0 border-t bg-sidebar/60 text-sidebar-foreground"
	aria-label="Document status"
>
	<div class="flex h-7 items-center gap-3 px-2 text-[11px]">
		<div class="flex min-w-0 items-center gap-2">
			<span class="sr-only">Status: {state.label}</span>
			<span aria-hidden="true" class={['size-1.5 shrink-0 rounded-full', tones[state.tone]]}></span>
			<span class={['truncate font-medium', state.tone === 'error' && 'text-destructive']}
				>{state.label}</span
			>
			{#if session.hasDocument && !session.canWriteBack}<span
					class="hidden items-center gap-1 text-muted-foreground lg:inline-flex"
					title="This browser cannot write back to the opened file. Save downloads a new copy."
					><Download size={11} />Saves as a download</span
				>{/if}
		</div>
		{#if session.hasDocument}<div
				class="mx-auto hidden min-w-0 items-center gap-1.5 truncate text-muted-foreground md:flex"
				title={location}
			>
				<span class="truncate">{location}</span>
			</div>{/if}
		<div class="ml-auto flex shrink-0 items-center gap-2">
			{#if session.hasDocument}<span class="hidden text-muted-foreground sm:inline"
					>{registers.length}
					{registers.length === 1 ? 'register' : 'registers'} ·
					{fields.length}
					{fields.length === 1 ? 'field' : 'fields'}</span
				>{/if}
			<div class="flex items-center gap-0.5">
				<Button
					variant="ghost"
					size="icon-xs"
					class="text-muted-foreground"
					aria-label="Zoom out"
					title="Zoom out (Ctrl+-)"
					onclick={() => step(-10)}><Minus /></Button
				>
				<Button
					variant="ghost"
					size="icon-xs"
					class="w-11 text-muted-foreground"
					aria-label="Reset zoom"
					title="Reset zoom (Ctrl+0)"
					onclick={() => (workspace.zoom = 100)}>{workspace.zoom}%</Button
				>
				<Button
					variant="ghost"
					size="icon-xs"
					class="text-muted-foreground"
					aria-label="Zoom in"
					title="Zoom in (Ctrl++)"
					onclick={() => step(10)}><Plus /></Button
				>
			</div>
			<Button
				variant="ghost"
				size="icon-xs"
				class="hidden text-muted-foreground sm:inline-flex"
				aria-label="Collapse sidebar"
				title={workspace.leftCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
				onclick={() => (workspace.leftCollapsed = !workspace.leftCollapsed)}
				>{#if workspace.leftCollapsed}<PanelLeftOpen />{:else}<PanelLeftClose />{/if}</Button
			>
		</div>
	</div>
</footer>
