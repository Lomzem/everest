<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { ChevronDown, ChevronRight, Folder, FolderTree, MoveRight } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import {
		buildHierarchyChildren,
		parentGroupPath,
		rootBlockId,
		type SelectionKind,
	} from '$lib/rdl/hierarchy';
	import { editor } from '$lib/state/editor.svelte';

	let {
		open = $bindable(false),
		kind,
		itemId,
	}: { open?: boolean; kind: SelectionKind; itemId: string } = $props();

	let selectedPath = $state('');
	const expandedPaths = new SvelteSet(['']);
	let wasOpen = false;

	const movingLabel = $derived.by(() => {
		if (kind === 'register') {
			const register = editor.document.registers.find((item) => item.id === itemId);
			return register?.title || register?.name || 'register';
		}

		const group = editor.document.hierarchyGroups.find((item) => item.id === itemId);
		return group?.label || 'folder';
	});

	const targets = $derived.by(() => [
		{
			id: rootBlockId,
			label: editor.addrmapLabel,
			path: '',
			depth: 0,
			hasChildren: hasFolderChildren(''),
		},
		...(expandedPaths.has('') ? folderTargets('', 1) : []),
	]);

	const selectedDisabled = $derived(editor.moveTargetDisabled(kind, itemId, selectedPath));

	$effect(() => {
		if (open && !wasOpen) {
			selectedPath = editor.currentGroupPathForMove(kind, itemId);
			expandedPaths.clear();
			expandedPaths.add('');
			for (const path of ancestorPaths(selectedPath)) {
				expandedPaths.add(path);
			}
		}
		wasOpen = open;
	});

	function folderTargets(parentPath: string, depth: number): FolderTarget[] {
		return buildHierarchyChildren(
			parentPath,
			editor.document.hierarchyGroups,
			editor.document.registers,
		).flatMap((child) => {
			if (child.kind !== 'folder') return [];
			return [
				{
					id: child.id,
					label: child.label,
					path: child.path,
					depth,
					hasChildren: hasFolderChildren(child.path),
				},
				...(expandedPaths.has(child.path) ? folderTargets(child.path, depth + 1) : []),
			];
		});
	}

	function hasFolderChildren(parentPath: string) {
		return buildHierarchyChildren(
			parentPath,
			editor.document.hierarchyGroups,
			editor.document.registers,
		).some((child) => child.kind === 'folder');
	}

	function ancestorPaths(path: string) {
		const parts = path.split('/').filter(Boolean);
		return parts.map((_, index) => parts.slice(0, index + 1).join('/'));
	}

	function toggleExpanded(path: string) {
		if (expandedPaths.has(path)) {
			expandedPaths.delete(path);
		} else {
			expandedPaths.add(path);
		}
	}

	function targetHint(path: string) {
		if (kind === 'register') {
			return editor.currentGroupPathForMove(kind, itemId) === path ? 'Current folder' : '';
		}

		const group = editor.document.hierarchyGroups.find((item) => item.id === itemId);
		if (!group) return 'Unavailable';
		if (group.path === path) return 'Current folder';
		if (path.startsWith(`${group.path}/`)) return 'Inside moved folder';
		if (parentGroupPath(group.path) === path) return 'Current parent';
		const nextPath = path ? `${path}/${group.label}` : group.label;
		if (
			editor.document.hierarchyGroups.some((item) => item.id !== itemId && item.path === nextPath)
		) {
			return 'Name already exists';
		}
		return '';
	}

	function confirmMove() {
		if (selectedDisabled) return;
		if (kind === 'register') {
			editor.moveRegisterToGroup(itemId, selectedPath);
		} else {
			editor.moveGroupToGroup(itemId, selectedPath);
		}
		open = false;
	}

	type FolderTarget = {
		id: string;
		label: string;
		path: string;
		depth: number;
		hasChildren: boolean;
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		class="grid h-[min(36rem,calc(100vh-2rem))] max-w-[min(34rem,calc(100vw-2rem))] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 text-base sm:max-w-lg"
	>
		<Dialog.Header class="border-b border-border p-4 pr-12">
			<Dialog.Title class="flex items-center gap-2 text-base">
				<MoveRight size={16} />
				Move {kind === 'register' ? 'Register' : 'Folder'}
			</Dialog.Title>
			<Dialog.Description class="text-base">
				Choose a new folder for {movingLabel}.
			</Dialog.Description>
		</Dialog.Header>

		<ScrollArea
			class="h-full min-h-0 overflow-hidden px-2 py-2"
			scrollbarYClasses="right-1"
			viewportClasses="overflow-x-hidden overflow-y-auto"
		>
			<div class="min-w-0 space-y-1 pb-2 pr-3">
				{#each targets as target (target.id)}
					{@const disabled = editor.moveTargetDisabled(kind, itemId, target.path)}
					{@const hint = targetHint(target.path)}
					<div
						class={`flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-base outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30 ${
							selectedPath === target.path ? 'bg-muted text-foreground ring-1 ring-ring/30' : ''
						} ${disabled ? 'cursor-not-allowed opacity-45 hover:bg-transparent' : ''}`}
						style:padding-left={`${target.depth * 1.25 + 0.5}rem`}
						title={hint}
					>
						{#if target.hasChildren}
							<button
								type="button"
								class="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
								onclick={() => toggleExpanded(target.path)}
								aria-label={expandedPaths.has(target.path)
									? `Collapse ${target.label}`
									: `Expand ${target.label}`}
							>
								{#if expandedPaths.has(target.path)}
									<ChevronDown size={14} />
								{:else}
									<ChevronRight size={14} />
								{/if}
							</button>
						{:else}
							<span class="size-6 shrink-0" aria-hidden="true"></span>
						{/if}
						{#if target.id === rootBlockId}
							<FolderTree size={15} class="shrink-0 text-muted-foreground" />
						{:else}
							<Folder size={15} class="shrink-0 text-muted-foreground" />
						{/if}
						<button
							type="button"
							class="min-w-0 flex-1 truncate text-left disabled:cursor-not-allowed"
							{disabled}
							onclick={() => {
								selectedPath = target.path;
							}}
						>
							{target.label}
						</button>
						{#if hint}
							<span
								class="shrink-0 rounded-sm bg-background px-2 py-1 text-base whitespace-nowrap text-muted-foreground"
								>{hint}</span
							>
						{/if}
					</div>
				{/each}
			</div>
		</ScrollArea>

		<Dialog.Footer class="relative z-10 border-t border-border bg-popover p-3">
			<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
			<Button onclick={confirmMove} disabled={selectedDisabled}>Move</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
