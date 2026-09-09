<script lang="ts">
	import { useDrafts } from '$lib/ui/drafts';
	const drafts = useDrafts();
	import { Cpu, FolderPlus, FolderTree, LocateFixed, MoveRight, Plus } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import Control from './Control.svelte';
	import Breadcrumbs from './Breadcrumbs.svelte';
	import type { EditorSession } from '$lib/editor/session.svelte';
	import type { Workspace } from '$lib/ui/workspace.svelte';
	import { groups, newGroup, groupParent, title, address, renameGroup } from '$lib/ui/original';
	import { tick } from 'svelte';
	let { session, workspace }: { session: EditorSession; workspace: Workspace } = $props();
	let path = $derived(workspace.selectedGroup ?? '');
	let paths = $derived(groups(session.compilation, workspace.emptyGroups));
	let root = $derived(session.compilation.roots[0]);
	let registers = $derived(
		session.compilation.nodes
			.filter(
				(n) =>
					n.kind === 'reg' &&
					(workspace.navigationOrder === 'address' || (n.groupPath ?? '') === path)
			)
			.sort((a, b) => Number((a.address ?? 0n) - (b.address ?? 0n)))
	);
	let gaps = $derived.by(() => {
		let cursor = 0n;
		const result: { start: bigint; end: bigint }[] = [];
		for (const n of session.compilation.nodes
			.filter((n) => n.kind === 'reg')
			.sort((a, b) => Number((a.address ?? 0n) - (b.address ?? 0n)))) {
			if ((n.address ?? 0n) > cursor) result.push({ start: cursor, end: n.address! - 1n });
			const end = (n.address ?? 0n) + (n.size ?? 1n);
			if (end > cursor) cursor = end;
		}
		return result;
	});
	async function addFolder() {
		if (!(await drafts.flush())) return;
		const next = newGroup(paths, path);
		workspace.emptyGroups = [...workspace.emptyGroups, next];
		workspace.selectedGroup = next;
		workspace.expandedNodes = [...workspace.expandedNodes, path, next];
	}

	async function findFree() {
		if (!(await drafts.flush())) return;
		workspace.search = '';
		workspace.navigationOrder = 'address';
		workspace.showReservedGaps = true;
		workspace.selectedGroup = '';
		await tick();
		const target = document.querySelector<HTMLButtonElement>('[data-gap-action]');
		if (target) {
			target.focus();
			target.scrollIntoView({ block: 'center' });
		} else {
			workspace.createRange = undefined;
			workspace.createAddress = registers.reduce((max, n) => {
				const end = (n.address ?? 0n) + (n.size ?? 1n);
				return end > max ? end : max;
			}, 0n);
			workspace.createParent = '';
		}
	}
</script>

<div class="border-b px-6 py-5" data-folder-view={workspace.selectedGroup ?? ''}>
	<div class="flex items-start justify-between gap-6 max-[900px]:flex-col">
		<div class="min-w-0">
			<div class="mb-3"><Breadcrumbs {session} {workspace} /></div>
			<Control
				label="Name"
				ariaLabel="Folder display name"
				value={path ? path.split('/').at(-1)! : root ? title(root) : ''}
				commit={(name) => renameGroup(session, workspace, path, name)}
				disabled={!path && !root?.editable}
			/>
		</div>
		<div class="flex shrink-0 flex-wrap items-center gap-2">
			{#if path}<Button
					variant="outline"
					size="lg"
					onclick={async () => {
						if (await drafts.flush()) workspace.moveGroup = path;
					}}><MoveRight size={14} />Move</Button
				>{/if}<Button variant="outline" size="lg" onclick={addFolder}
				><FolderPlus size={14} />Add Folder</Button
			><Button variant="outline" size="lg" onclick={findFree}
				><LocateFixed size={14} />Find Free Address</Button
			><Button
				variant="outline"
				size="lg"
				onclick={async () => {
					if (!(await drafts.flush())) return;
					workspace.createRange = undefined;
					workspace.createAddress = undefined;
					workspace.createParent = path;
				}}><Plus size={14} />Add Register</Button
			>
		</div>
	</div>
</div>
<section class="max-w-4xl px-6 py-5">
	<div
		class="mb-2 grid grid-cols-[7rem_1fr] gap-4 px-3 text-sm font-semibold text-muted-foreground uppercase"
	>
		<span>Address</span><span>Name</span>
	</div>
	<div class="overflow-hidden rounded-md border bg-card">
		{#if workspace.navigationOrder === 'document'}{#each paths.filter((p) => groupParent(p) === path) as child (child)}<button
					class="grid w-full grid-cols-[7rem_1fr] items-center gap-4 border-b px-3 py-3 text-left hover:bg-muted"
					onclick={() => (workspace.selectedGroup = child)}
					><span class="font-mono text-muted-foreground">--</span><span
						class="flex items-center gap-3"><FolderTree size={15} />{child.split('/').at(-1)}</span
					></button
				>{/each}{/if}{#each registers as node (node.id)}{#if workspace.showReservedGaps}{#each gaps.filter((g) => g.end === (node.address ?? 0n) - 1n) as gap (String(gap.start))}<div
						class="grid grid-cols-[7rem_1fr_auto] items-center gap-4 border-b border-dashed bg-muted/30 px-3 py-3"
					>
						<span class="font-mono text-sm text-muted-foreground"
							>{address(gap.start)}-{address(gap.end)}</span
						><span class="text-sm text-muted-foreground"
							>Reserved, <span class="font-mono"
								>{String(gap.end - gap.start + 1n)} bytes available</span
							></span
						><Button
							variant="outline"
							data-gap-action={String(gap.start)}
							onclick={async () => {
								if (!(await drafts.flush())) return;
								workspace.createRange = gap;
								workspace.createAddress = gap.start;
								workspace.createParent = path;
							}}><Plus size={14} />Add Register</Button
						>
					</div>{/each}{/if}<button
				class="grid w-full grid-cols-[7rem_1fr] items-center gap-4 border-b px-3 py-3 text-left last:border-0 hover:bg-muted"
				onclick={async () => {
					if (!(await drafts.flush())) return;
					workspace.selectedGroup = undefined;
					session.select(node.id);
				}}
				><span class="font-mono text-base text-muted-foreground">{address(node.address)}</span><span
					class="flex min-w-0 items-center gap-3"
					><span
						class="inline-flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary"
						><Cpu size={15} /></span
					><span class="min-w-0"
						><span class="block truncate font-medium">{title(node)}</span><span
							class="block truncate font-mono text-base text-muted-foreground">{node.id}</span
						></span
					></span
				></button
			>{/each}{#if !registers.length && !paths.some((p) => groupParent(p) === path)}<div
				class="flex min-h-48 flex-col items-center justify-center gap-3"
			>
				<p class="font-medium">No registers yet</p>
				<p class="text-sm text-muted-foreground">Add a register to define this addrmap.</p>
				<div class="flex gap-2">
					<Button variant="outline" onclick={addFolder}><FolderPlus size={14} />Add Folder</Button
					><Button
						variant="outline"
						onclick={async () => {
							if (!(await drafts.flush())) return;
							workspace.createRange = undefined;
							workspace.createAddress = undefined;
							workspace.createParent = path;
						}}><Plus size={14} />Add Register</Button
					>
				</div>
			</div>{/if}
	</div>
</section>
