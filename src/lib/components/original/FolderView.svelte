<script lang="ts">
	import { useDrafts } from '$lib/ui/drafts';
	const drafts = useDrafts();
	import { Cpu, FolderPlus, FolderTree, MapPinHouse, MoveRight, Plus } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
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
	let children = $derived(paths.filter((p) => groupParent(p) === path));
	let used = $derived(
		registers.reduce(
			(max, n) =>
				(n.address ?? 0n) + (n.size ?? 1n) > max ? (n.address ?? 0n) + (n.size ?? 1n) : max,
			0n
		)
	);
	function count(child: string) {
		return registers.filter((n) => (n.groupPath ?? '') === child).length;
	}
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

<div class="border-b px-6 py-5 max-[900px]:px-3" data-folder-view={workspace.selectedGroup ?? ''}>
	<div class="mb-4"><Breadcrumbs {session} {workspace} /></div>
	<div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
		<div class="w-full max-w-xs">
			<Control
				label="Name"
				ariaLabel="Folder display name"
				value={path ? path.split('/').at(-1)! : root ? title(root) : ''}
				commit={(name) => renameGroup(session, workspace, path, name)}
				disabled={!path && !root?.editable}
			/>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			{#if path}<Button
					variant="outline"
					size="lg"
					onclick={async () => {
						if (await drafts.flush()) workspace.moveGroup = path;
					}}><MoveRight size={14} />Move</Button
				>{/if}<Button variant="outline" size="lg" onclick={addFolder}
				><FolderPlus size={14} />Add Folder</Button
			><Button variant="outline" size="lg" onclick={findFree}
				><MapPinHouse size={14} />Find Free Address</Button
			><Button
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
<section class="max-w-5xl px-6 py-5 max-[900px]:px-3">
	<div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
		<h2 class="text-sm font-semibold">Registers</h2>
		<p class="text-xs text-muted-foreground">
			{registers.length}
			{registers.length === 1 ? 'register' : 'registers'}{#if used}
				·
				<span class="font-mono">{address(used - 1n)}</span> highest address{/if}
		</p>
	</div>
	<div class="overflow-hidden rounded-lg border bg-card shadow-xs">
		<div
			class="grid grid-cols-[7rem_minmax(0,1fr)] gap-4 border-b bg-muted/40 px-3 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase"
		>
			<span>Address</span><span>Name</span>
		</div>
		{#if workspace.navigationOrder === 'document'}{#each children as child (child)}<button
					class="grid w-full grid-cols-[7rem_minmax(0,1fr)] items-center gap-4 border-b border-border/60 px-3 py-3 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
					onclick={() => (workspace.selectedGroup = child)}
					><span class="font-mono text-sm text-muted-foreground/70">--</span><span
						class="flex min-w-0 items-center gap-3"
						><span
							class="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
							><FolderTree size={15} /></span
						><span class="truncate font-medium">{child.split('/').at(-1)}</span><Badge
							variant="secondary"
							class="shrink-0 font-normal"
							>{count(child)}
							{count(child) === 1 ? 'register' : 'registers'}</Badge
						></span
					></button
				>{/each}{/if}{#each registers as node (node.id)}{#if workspace.showReservedGaps}{#each gaps.filter((g) => g.end === (node.address ?? 0n) - 1n) as gap (String(gap.start))}<div
						class="grid grid-cols-[7rem_minmax(0,1fr)_auto] items-center gap-4 border-y border-dashed border-border bg-muted/20 px-3 py-3"
					>
						<span class="font-mono text-sm text-muted-foreground"
							>{address(gap.start)}–{address(gap.end)}</span
						><span class="text-sm text-muted-foreground"
							>Reserved · <span class="font-mono"
								>{String(gap.end - gap.start + 1n)} bytes available</span
							></span
						><Button
							variant="outline"
							size="sm"
							data-gap-action={String(gap.start)}
							onclick={async () => {
								if (!(await drafts.flush())) return;
								workspace.createRange = gap;
								workspace.createAddress = gap.start;
								workspace.createParent = path;
							}}><Plus size={14} />Add Register</Button
						>
					</div>{/each}{/if}<button
				class="grid w-full grid-cols-[7rem_minmax(0,1fr)] items-center gap-4 border-b border-border/60 px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-muted focus-visible:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
				onclick={async () => {
					if (!(await drafts.flush())) return;
					workspace.selectedGroup = undefined;
					session.select(node.id);
				}}
				><span class="font-mono text-base text-muted-foreground">{address(node.address)}</span><span
					class="flex min-w-0 items-center gap-3"
					><span
						class="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
						><Cpu size={15} /></span
					><span class="min-w-0"
						><span class="block truncate font-medium">{title(node)}</span><span
							class="block truncate font-mono text-xs text-muted-foreground">{node.id}</span
						></span
					></span
				></button
			>{/each}{#if !registers.length && !children.length}<div
				class="flex min-h-48 flex-col items-center justify-center gap-3 px-6 py-10 text-center"
			>
				<span
					class="inline-flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
					><Cpu size={18} /></span
				>
				<p class="font-medium">No registers yet</p>
				<p class="text-sm text-muted-foreground">
					Add a register to define this addrmap, or create a folder to group them.
				</p>
				<div class="mt-1 flex gap-2">
					<Button variant="outline" onclick={addFolder}><FolderPlus size={14} />Add Folder</Button
					><Button
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
