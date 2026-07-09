<script lang="ts">
	import { Folder, FolderTree, MoveRight } from '@lucide/svelte';
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
		},
		...folderTargets('', 1),
	]);

	const selectedDisabled = $derived(editor.moveTargetDisabled(kind, itemId, selectedPath));

	$effect(() => {
		if (open && !wasOpen) {
			selectedPath = editor.currentGroupPathForMove(kind, itemId);
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
				},
				...folderTargets(child.path, depth + 1),
			];
		});
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
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[min(36rem,calc(100vh-2rem))] max-w-xl gap-0 p-0 text-base">
		<Dialog.Header class="border-b border-border p-4 pr-12">
			<Dialog.Title class="flex items-center gap-2 text-base">
				<MoveRight size={16} />
				Move {kind === 'register' ? 'Register' : 'Folder'}
			</Dialog.Title>
			<Dialog.Description class="text-base">
				Choose a new folder for {movingLabel}.
			</Dialog.Description>
		</Dialog.Header>

		<ScrollArea class="max-h-96">
			<div class="space-y-1 p-2">
				{#each targets as target (target.id)}
					{@const disabled = editor.moveTargetDisabled(kind, itemId, target.path)}
					{@const hint = targetHint(target.path)}
					<button
						type="button"
						class={`flex h-10 w-full items-center gap-2 rounded-md px-2 text-left text-base outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30 ${
							selectedPath === target.path ? 'bg-muted text-foreground ring-1 ring-ring/30' : ''
						} ${disabled ? 'cursor-not-allowed opacity-45 hover:bg-transparent' : ''}`}
						style:padding-left={`${target.depth * 1.25 + 0.5}rem`}
						{disabled}
						onclick={() => {
							selectedPath = target.path;
						}}
						title={hint}
					>
						{#if target.id === rootBlockId}
							<FolderTree size={15} class="shrink-0 text-muted-foreground" />
						{:else}
							<Folder size={15} class="shrink-0 text-muted-foreground" />
						{/if}
						<span class="min-w-0 flex-1 truncate">{target.label}</span>
						{#if hint}
							<span class="shrink-0 text-base text-muted-foreground">{hint}</span>
						{/if}
					</button>
				{/each}
			</div>
		</ScrollArea>

		<Dialog.Footer class="border-t border-border p-4">
			<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
			<Button onclick={confirmMove} disabled={selectedDisabled}>Move</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
