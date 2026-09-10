<script lang="ts">
	import { useDrafts } from '$lib/ui/drafts';
	const drafts = useDrafts();
	import {
		ChevronsDownUp,
		ChevronsUpDown,
		ChevronDown,
		ChevronRight,
		FolderPlus,
		FolderTree,
		ListTree,
		PanelLeftClose,
		PanelLeftOpen,
		Plus,
		Trash2,
		Edit3
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as Dropdown from '$lib/components/ui/dropdown-menu';
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import SettingsDialog from './SettingsDialog.svelte';
	import Control from './Control.svelte';
	import { tick } from 'svelte';
	import type { EditorSession } from '$lib/editor/session.svelte';
	import type { Workspace } from '$lib/ui/workspace.svelte';
	import {
		groups,
		newGroup,
		groupParent,
		title,
		address,
		renameGroup,
		flushNode
	} from '$lib/ui/original';
	import type { RdlNode } from '$lib/rdl/types';
	let { session, workspace }: { session: EditorSession; workspace: Workspace } = $props();
	let renamingPath = $state<string | undefined>();
	let paths = $derived(groups(session.compilation, workspace.emptyGroups));
	let root = $derived(session.compilation.roots[0]);
	let registers = $derived(session.compilation.nodes.filter((n) => n.kind === 'reg'));
	let allExpanded = $derived(
		workspace.expandedNodes.includes('') && paths.every((p) => workspace.expandedNodes.includes(p))
	);
	let anyExpanded = $derived(workspace.expandedNodes.length > 0);
	function renameEvents(element: HTMLElement, originalLabel: string) {
		const input = element.querySelector('input');
		const keydown = (event: KeyboardEvent) => {
			if (event.key === 'Escape' || (event.key === 'Enter' && input?.value === originalLabel))
				renamingPath = undefined;
		};
		const blur = () => {
			if (input?.value === originalLabel) renamingPath = undefined;
		};
		input?.addEventListener('keydown', keydown);
		input?.addEventListener('blur', blur);
		return {
			update(value: string) {
				originalLabel = value;
			},
			destroy() {
				input?.removeEventListener('keydown', keydown);
				input?.removeEventListener('blur', blur);
			}
		};
	}

	async function addFolder(parent: string) {
		if (!(await drafts.flush())) return;
		if (parent && !paths.includes(parent)) parent = workspace.selectedGroup ?? '';
		const path = newGroup(paths, parent);
		workspace.emptyGroups = [...workspace.emptyGroups, path];
		workspace.expandedNodes = [...workspace.expandedNodes, parent, path];
		workspace.selectedGroup = path;
	}
	function selectRegister(node: RdlNode) {
		workspace.selectedGroup = undefined;
		session.select(node.id);
	}
</script>

<aside
	aria-label="Hierarchy"
	class={['flex h-full shrink-0 flex-col bg-sidebar', workspace.leftCollapsed ? 'w-14' : 'w-full']}
>
	<div class="flex h-12 items-center justify-between border-b border-sidebar-border/40 px-3">
		{#if !workspace.leftCollapsed}<div
				class="flex items-center gap-2 text-sm font-semibold text-sidebar-foreground uppercase"
			>
				<FolderTree size={15} />Hierarchy
			</div>{/if}<Button
			variant="ghost"
			size="icon-lg"
			onclick={() => (workspace.leftCollapsed = !workspace.leftCollapsed)}
			aria-label="Toggle hierarchy"
			>{#if workspace.leftCollapsed}<PanelLeftOpen size={16} />{:else}<PanelLeftClose
					size={16}
				/>{/if}</Button
		>
	</div>
	{#if !workspace.leftCollapsed}<div
			class="flex items-center gap-1 border-b border-sidebar-border/40 py-1.5 pr-2 pl-3"
		>
			<span class="mr-auto min-w-0 truncate text-[11px] text-muted-foreground">
				{registers.length}
				{registers.length === 1 ? 'register' : 'registers'}
			</span>
			<Button
				variant="ghost"
				size="icon-sm"
				class="text-muted-foreground"
				aria-label="Expand all folders"
				title="Expand all"
				disabled={allExpanded}
				onclick={() => (workspace.expandedNodes = ['', ...paths])}><ChevronsUpDown /></Button
			>
			<Button
				variant="ghost"
				size="icon-sm"
				class="text-muted-foreground"
				aria-label="Collapse all folders"
				title="Collapse all"
				disabled={!anyExpanded}
				onclick={() => (workspace.expandedNodes = [])}><ChevronsDownUp /></Button
			>
			<Dropdown.Root
				><Dropdown.Trigger
					>{#snippet child({ props })}<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							class="text-muted-foreground"
							aria-label="Change navigation order"
							title="Navigation order"><ListTree /></Button
						>{/snippet}</Dropdown.Trigger
				><Dropdown.Content align="end"
					><Dropdown.Label>Navigation order</Dropdown.Label><Dropdown.Separator
					/><Dropdown.RadioGroup bind:value={workspace.navigationOrder}
						><Dropdown.RadioItem value="document">Document groups</Dropdown.RadioItem
						><Dropdown.RadioItem value="address">Address order</Dropdown.RadioItem
						></Dropdown.RadioGroup
					></Dropdown.Content
				></Dropdown.Root
			>
		</div>
		<div class="min-h-0 flex-1 overflow-auto p-2">
			{@render folder('', root ? title(root) : 'addrmap')}
		</div>{/if}
	<div class="mt-auto border-t border-sidebar-border/40 p-2"><SettingsDialog {workspace} /></div>
</aside>
{#snippet folder(path: string, label: string)}<div>
		<ContextMenu.Root
			><ContextMenu.Trigger>
				<div
					class={[
						'group grid h-8 grid-cols-[2rem_minmax(0,1fr)_2rem_2rem] items-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent',
						workspace.selectedGroup === path && 'bg-accent text-accent-foreground'
					]}
				>
					{#if renamingPath === path}
						<div class="col-span-4" data-folder-view={path} use:renameEvents={label}>
							<Control
								ariaLabel="Rename folder"
								value={label}
								commit={async (name) => {
									const ok = await renameGroup(session, workspace, path, name);
									if (ok) renamingPath = undefined;
									return ok;
								}}
							/>
						</div>
					{:else}
						<Button
							variant="ghost"
							size="icon-lg"
							aria-label={`Toggle ${label}`}
							onclick={() => workspace.toggleNode(path)}
							>{#if workspace.expandedNodes.includes(path)}<ChevronDown
									size={14}
								/>{:else}<ChevronRight size={14} />{/if}</Button
						><button
							class="min-w-0 truncate rounded-sm text-left text-sm focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none"
							onclick={() => {
								workspace.selectedGroup = path;
								if (root) session.select(root.id);
							}}>{label}</button
						><Button
							variant="ghost"
							size="icon-lg"
							class="opacity-0 group-hover:opacity-100 focus:opacity-100"
							aria-label={`Add folder in ${label}`}
							onclick={() => addFolder(path)}><FolderPlus size={14} /></Button
						><Button
							variant="ghost"
							size="icon-lg"
							class="opacity-0 group-hover:opacity-100 focus:opacity-100"
							aria-label={`Add register in ${label}`}
							onclick={async () => {
								if (!(await drafts.flush())) return;
								workspace.createRange = undefined;
								workspace.createAddress = undefined;
								workspace.createParent = path;
							}}><Plus size={14} /></Button
						>
					{/if}
				</div>
			</ContextMenu.Trigger><ContextMenu.Content
				><ContextMenu.Item
					onSelect={async () => {
						workspace.selectedGroup = path;
						renamingPath = path;
						await tick();
						document.querySelector<HTMLInputElement>('[aria-label="Rename folder"]')?.select();
					}}><Edit3 size={14} />Rename</ContextMenu.Item
				>{#if path}<ContextMenu.Item
						variant="destructive"
						onSelect={async () => {
							if (!(await drafts.flush())) return;
							if (
								session.compilation.groups?.some((g) => g.path === path) &&
								!(await session.edit({ type: 'delete-group', path }))
							)
								return;
							workspace.emptyGroups = workspace.emptyGroups.filter(
								(p) => p !== path && !p.startsWith(path + '/')
							);
							workspace.selectedGroup = '';
						}}><Trash2 size={14} />Delete</ContextMenu.Item
					>{/if}</ContextMenu.Content
			></ContextMenu.Root
		>
		{#if workspace.expandedNodes.includes(path)}<div
				class="ml-3 border-l border-sidebar-border/40 pl-2"
			>
				{#if workspace.navigationOrder === 'document'}{#each paths.filter((p) => groupParent(p) === path) as child (child)}{@render folder(
							child,
							child.split('/').at(-1)!
						)}{/each}{/if}{#each registers
					.filter( (n) => (workspace.navigationOrder === 'address' ? path === '' : (n.groupPath ?? '') === path) )
					.sort( (a, b) => (workspace.navigationOrder === 'address' ? Number((a.address ?? 0n) - (b.address ?? 0n)) : 0) ) as node (node.id)}{@render register(
						node
					)}{/each}
			</div>{/if}
	</div>{/snippet}
{#snippet register(node: RdlNode)}<ContextMenu.Root
		><ContextMenu.Trigger
			><div
				class={[
					'group grid h-8 grid-cols-[minmax(0,1fr)_auto_2rem] items-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent',
					workspace.selectedGroup === undefined &&
						session.selectedId === node.id &&
						'bg-accent text-accent-foreground'
				]}
			>
				<button
					class="h-8 min-w-0 truncate rounded-sm px-2 text-left text-sm font-medium focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none"
					aria-current={workspace.selectedGroup === undefined && session.selectedId === node.id
						? 'true'
						: undefined}
					onclick={() => selectRegister(node)}>{title(node)}</button
				><Badge variant="outline" class="px-1.5 font-mono text-[10px]"
					>@ {address(node.address)}</Badge
				><Button
					variant="ghost"
					size="icon-lg"
					class="opacity-0 group-hover:opacity-100 focus:opacity-100"
					aria-label={`Delete register ${node.name}`}
					disabled={!node.editable}
					onclick={async () => {
						const current = await flushNode(drafts, session, node);
						if (current) await session.edit({ type: 'delete-component', nodeId: current.id });
					}}><Trash2 size={14} /></Button
				>
			</div></ContextMenu.Trigger
		><ContextMenu.Content
			><ContextMenu.Item
				onSelect={() => {
					selectRegister(node);
					setTimeout(
						() =>
							document
								.querySelector<HTMLInputElement>('[aria-label="Register display name"]')
								?.select(),
						0
					);
				}}><Edit3 size={14} />Rename</ContextMenu.Item
			><ContextMenu.Item
				disabled={!node.editable}
				variant="destructive"
				onSelect={async () => {
					const current = await flushNode(drafts, session, node);
					if (current) await session.edit({ type: 'delete-component', nodeId: current.id });
				}}><Trash2 size={14} />Delete</ContextMenu.Item
			></ContextMenu.Content
		></ContextMenu.Root
	>{/snippet}
