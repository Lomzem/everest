<script lang="ts">
	import { Search, ChevronRight, Layers, CircuitBoard, X } from '@lucide/svelte';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import type { EditorSession } from '$lib/editor/session.svelte';
	import type { RdlNode } from '$lib/rdl/types';
	import type { Workspace } from '$lib/ui/workspace.svelte';
	let { session, workspace }: { session: EditorSession; workspace: Workspace } = $props();
	function matches(node: RdlNode): boolean {
		return (
			node.name.toLowerCase().includes(workspace.search.toLowerCase()) ||
			node.children.some(matches)
		);
	}
	let count = $derived(session.compilation.nodes.filter((n) => n.kind === 'reg').length);
</script>

<aside
	aria-label="Components"
	class={[
		'flex w-64 shrink-0 flex-col border-r bg-sidebar/40 max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-20 max-md:w-72 max-md:bg-background max-md:shadow-xl',
		!workspace.navigationOpen && 'max-md:hidden'
	]}
>
	<div class="flex items-center justify-between px-5 pt-6 pb-4">
		<h2 class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Explorer</h2>
		<Button
			variant="ghost"
			size="icon-sm"
			class="md:hidden"
			onclick={() => (workspace.navigationOpen = false)}
			aria-label="Close explorer"><X /></Button
		><span class="text-xs text-muted-foreground max-md:hidden">{count} registers</span>
	</div>
	<div class="relative mx-4 mb-5">
		<Search class="absolute top-2.5 left-3 size-4 text-muted-foreground" /><Input
			aria-label="Search components"
			placeholder="Find a component…"
			class="pl-9"
			bind:value={workspace.search}
		/>
	</div>
	<nav class="min-h-0 flex-1 overflow-auto px-2 pb-6">
		{#each session.compilation.roots as node (node.id)}{@render tree(
				node,
				0
			)}{/each}{#if workspace.search && !session.compilation.roots.some(matches)}<p
				class="p-4 text-sm text-muted-foreground"
			>
				No matching components.
			</p>{/if}
	</nav>
</aside>
{#snippet tree(node: RdlNode, depth: number)}
	{#if matches(node)}<button
			class="mb-1 flex w-full items-center gap-2 rounded-md py-2.5 pr-3 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
			class:bg-accent={session.selectedId === node.id}
			class:font-semibold={session.selectedId === node.id}
			style:padding-left={`${12 + depth * 14}px`}
			onclick={() => {
				session.select(node.id);
				workspace.navigationOpen = false;
			}}
			aria-current={session.selectedId === node.id ? 'true' : undefined}
		>
			{#if node.children.length}<ChevronRight
					class="size-3 shrink-0 rotate-90 text-muted-foreground"
				/>{:else}<span class="w-3 shrink-0"></span>{/if}{#if node.kind === 'reg'}<CircuitBoard
					class="size-4 shrink-0 text-primary"
				/>{:else}<Layers class="size-4 shrink-0 text-muted-foreground" />{/if}<span class="truncate"
				>{node.name}</span
			>{#if node.kind === 'reg'}<span class="ml-auto font-mono text-[10px] text-muted-foreground"
					>{workspace.format(node.offset)}</span
				>{/if}</button
		>
		{#each node.children.filter((child) => child.kind !== 'field') as child (child.id)}{@render tree(
				child,
				depth + 1
			)}{/each}{/if}
{/snippet}
