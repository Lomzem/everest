<script lang="ts">
	import { editor } from '$lib/state/editor.svelte';
	import HierarchyGroupItem from './HierarchyGroupItem.svelte';
	import HierarchyRegisterItem from './HierarchyRegisterItem.svelte';

	let { groupPath }: { groupPath: string } = $props();
</script>

<div class="ml-4 flex flex-col gap-1 border-l border-sidebar-border pl-2">
	{#each editor.folderChildren(groupPath) as child (child.kind === 'folder' ? child.id : child.register.id)}
		{#if child.kind === 'folder'}
			{@const group = editor.hierarchyGroupForPath(child.path)}
			{#if group}
				<HierarchyGroupItem {group} />
			{/if}
		{:else}
			<HierarchyRegisterItem register={child.register} />
		{/if}
	{/each}
</div>
