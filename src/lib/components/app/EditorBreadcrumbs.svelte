<script lang="ts">
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import { editor } from '$lib/state/editor.svelte';

	function openBreadcrumb(event: MouseEvent, action: () => void) {
		event.preventDefault();
		action();
	}
</script>

<Breadcrumb.Root class="min-w-0">
	<Breadcrumb.List class="flex-nowrap overflow-hidden text-base">
		<Breadcrumb.Item class="min-w-0">
			{#if editor.selectedKind === 'folder' && editor.selectedGroupPath === ''}
				<Breadcrumb.Page class="block max-w-48 truncate font-medium text-primary">
					{editor.addrmapLabel}
				</Breadcrumb.Page>
			{:else}
				<Breadcrumb.Link
					class="block max-w-48 truncate"
					href="#"
					onclick={(event) => openBreadcrumb(event, () => editor.revealDocumentRoot())}
				>
					{editor.addrmapLabel}
				</Breadcrumb.Link>
			{/if}
		</Breadcrumb.Item>
		{#each editor.selectedGroupCrumbs as group, index (group.path)}
			<Breadcrumb.Separator />
			<Breadcrumb.Item class="min-w-0">
				{#if editor.selectedKind === 'folder' && index === editor.selectedGroupCrumbs.length - 1}
					<Breadcrumb.Page class="block max-w-40 truncate font-medium text-primary">
						{group.label}
					</Breadcrumb.Page>
				{:else}
					<Breadcrumb.Link
						class="block max-w-40 truncate"
						href="#"
						onclick={(event) => openBreadcrumb(event, () => editor.selectGroup(group.path))}
					>
						{group.label}
					</Breadcrumb.Link>
				{/if}
			</Breadcrumb.Item>
		{/each}
		{#if editor.selectedKind === 'register' && editor.selectedRegister.id}
			<Breadcrumb.Separator />
			<Breadcrumb.Item class="min-w-0">
				<Breadcrumb.Page class="block max-w-56 truncate font-medium text-primary">
					{editor.selectedRegister.name}
				</Breadcrumb.Page>
			</Breadcrumb.Item>
		{/if}
	</Breadcrumb.List>
</Breadcrumb.Root>
