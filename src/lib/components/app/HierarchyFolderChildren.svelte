<script lang="ts">
	import {
		SHADOW_ITEM_MARKER_PROPERTY_NAME,
		dragHandleZone,
		type DndEvent,
	} from 'svelte-dnd-action';
	import type { HierarchyDndItem } from '$lib/rdl/hierarchy';
	import { editor } from '$lib/state/editor.svelte';
	import HierarchyGroupItem from './HierarchyGroupItem.svelte';
	import HierarchyRegisterItem from './HierarchyRegisterItem.svelte';

	let { groupPath }: { groupPath: string } = $props();

	function handleConsider(event: CustomEvent<DndEvent<HierarchyDndItem>>) {
		editor.previewHierarchyDrop(groupPath, event.detail.items);
	}

	function handleFinalize(event: CustomEvent<DndEvent<HierarchyDndItem>>) {
		editor.finalizeHierarchyDrop(groupPath, event.detail.items, event.detail.info.id);
	}
</script>

<div
	class="ml-4 flex min-h-2 flex-col gap-1 border-l border-sidebar-border pl-2"
	use:dragHandleZone={{
		items: editor.hierarchyDndItems(groupPath),
		type: 'hierarchy-item',
		flipDurationMs: 80,
		dragDisabled: editor.searchActive,
		dropFromOthersDisabled: editor.searchActive,
		dropTargetClasses: ['bg-sidebar-accent/40', 'ring-1', 'ring-sidebar-ring'],
		delayTouchStart: true,
		useCursorForDetection: true,
	}}
	onconsider={handleConsider}
	onfinalize={handleFinalize}
	aria-label={`${groupPath || editor.addrmapLabel} children`}
>
	{#each editor.hierarchyDndItems(groupPath) as item (`${item.id}:${item[SHADOW_ITEM_MARKER_PROPERTY_NAME] ? 'shadow' : 'item'}`)}
		<div data-is-dnd-shadow-item-hint={item[SHADOW_ITEM_MARKER_PROPERTY_NAME]}>
			{#if item.kind === 'folder'}
				{@const group = editor.hierarchyGroupForPath(item.path)}
				{#if group}
					<HierarchyGroupItem {group} />
				{/if}
			{:else}
				{@const register = editor.document.registers.find((entry) => entry.id === item.registerId)}
				{#if register}
					<HierarchyRegisterItem {register} />
				{/if}
			{/if}
		</div>
	{/each}
</div>
