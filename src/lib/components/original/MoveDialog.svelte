<script lang="ts">
	import { useDrafts } from '$lib/ui/drafts';
	const drafts = useDrafts();
	import { MoveRight, FolderTree, Folder, ChevronDown, ChevronRight } from '@lucide/svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import type { EditorSession } from '$lib/editor/session.svelte';
	import type { Workspace } from '$lib/ui/workspace.svelte';
	import { groups, title, groupParent } from '$lib/ui/original';
	let { session, workspace }: { session: EditorSession; workspace: Workspace } = $props();
	let node = $derived(session.compilation.nodes.find((n) => n.id === workspace.moveNode));
	let target = $state('');
	let expanded = $state<string[]>(['']);
	let paths = $derived(groups(session.compilation, workspace.emptyGroups));
	let current = $derived(
		workspace.moveGroup !== undefined ? groupParent(workspace.moveGroup) : (node?.groupPath ?? '')
	);
	$effect(() => {
		const key = workspace.moveNode ?? workspace.moveGroup;
		if (key !== undefined) {
			target = current;
			expanded = ['', ...paths];
		}
	});
	function blocked(path: string) {
		const old = workspace.moveGroup;
		if (old === undefined) return path === current;
		const destination = path ? `${path}/${old.split('/').at(-1)}` : old.split('/').at(-1)!;
		return (
			path === current || path === old || path.startsWith(old + '/') || paths.includes(destination)
		);
	}
	let canMove = $derived(!blocked(target) && (target === '' || paths.includes(target)));
	function visible(path: string) {
		if (!path) return true;
		let parent = groupParent(path);
		while (parent) {
			if (!expanded.includes(parent)) return false;
			parent = groupParent(parent);
		}
		return expanded.includes('');
	}

	async function move() {
		if (!(await drafts.flush())) return;
		if (!canMove) return;
		const old = workspace.moveGroup;
		let ok = true;
		if (old !== undefined) {
			if (session.compilation.groups?.some((g) => g.path === old))
				ok = await session.edit({ type: 'move-group', path: old, parentPath: target });
			if (ok) {
				const next = target ? `${target}/${old.split('/').at(-1)}` : old.split('/').at(-1)!;
				workspace.emptyGroups = workspace.emptyGroups.map((p) =>
					p === old || p.startsWith(old + '/') ? next + p.slice(old.length) : p
				);
				workspace.selectedGroup = next;
			}
		} else if (node)
			ok = await session.edit({ type: 'move-to-group', nodeId: node.id, path: target });
		if (ok) {
			workspace.moveGroup = undefined;
			workspace.moveNode = undefined;
		}
	}
	function close() {
		workspace.moveNode = undefined;
		workspace.moveGroup = undefined;
	}
</script>

<Dialog.Root
	open={workspace.moveNode !== undefined || workspace.moveGroup !== undefined}
	onOpenChange={(open) => {
		if (!open) close();
	}}
	><Dialog.Content class="sm:max-w-lg"
		><Dialog.Header
			><Dialog.Title
				><MoveRight class="inline size-4" />Move {node ? 'Register' : 'Folder'}</Dialog.Title
			><Dialog.Description
				>Choose a new folder for {node ? title(node) : workspace.moveGroup}.</Dialog.Description
			></Dialog.Header
		>
		<div class="max-h-80 overflow-auto">
			{#each ['', ...paths].filter(visible) as path (path)}
				<div
					class="flex items-center"
					style:padding-left={`${path.split('/').filter(Boolean).length * 1.25}rem`}
				>
					{#if paths.some((item) => groupParent(item) === path)}
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={`${expanded.includes(path) ? 'Collapse' : 'Expand'} ${path || 'root'}`}
							onclick={() =>
								(expanded = expanded.includes(path)
									? expanded.filter((item) => item !== path)
									: [...expanded, path])}
						>
							{#if expanded.includes(path)}<ChevronDown size={14} />{:else}<ChevronRight
									size={14}
								/>{/if}
						</Button>
					{:else}<span class="w-7 shrink-0"></span>{/if}
					<button
						class={[
							'flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-base hover:bg-muted disabled:opacity-45',
							target === path && 'bg-muted'
						]}
						disabled={blocked(path)}
						onclick={() => (target = path)}
					>
						{#if path}<Folder size={15} />{:else}<FolderTree size={15} />{/if}{path
							.split('/')
							.at(-1) || title(session.compilation.roots[0])}
					</button>
				</div>
			{/each}
		</div>
		{#if session.error}<p role="alert" class="text-sm text-destructive">
				{session.error}
			</p>{/if}<Dialog.Footer
			><Button variant="outline" onclick={close}>Cancel</Button><Button
				onclick={move}
				disabled={!canMove || session.busy}>Move</Button
			></Dialog.Footer
		></Dialog.Content
	></Dialog.Root
>
