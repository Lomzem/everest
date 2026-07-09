<script lang="ts">
	import { ChevronDown, ChevronRight, Plus, FolderPlus, Trash2, PenLine } from '@lucide/svelte';
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import type { HierarchyGroup } from '$lib/rdl/model';
	import { editor, textInput } from '$lib/state/editor.svelte';
	import { ui } from '$lib/state/ui.svelte';
	import HierarchyFolderChildren from './HierarchyFolderChildren.svelte';

	let { group }: { group: HierarchyGroup } = $props();
	let expanded = $derived(editor.searchActive || ui.expandedBlocks.has(group.id));
</script>

<div>
	<ContextMenu.Root>
		<ContextMenu.Trigger class="block">
			<div
				class={`group flex items-center gap-1 rounded-md ${
					editor.selectedKind === 'folder' && editor.selectedGroupPath === group.path
						? 'bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-sidebar-ring'
						: ui.dragOverGroupId === group.id
							? 'bg-sidebar-accent/70 ring-1 ring-sidebar-ring'
							: ''
				}`}
				ondragover={(event) => {
					ui.dragRegisterOverGroup(event, group.id);
				}}
				ondragleave={() => {
					if (ui.dragOverGroupId === group.id) ui.dragOverGroupId = '';
				}}
				ondrop={(event) => {
					editor.dropRegisterOnGroup(event, group);
				}}
				role="presentation"
			>
				{#if ui.renamingGroupId === group.id}
					<div
						class="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-1 text-left text-sidebar-foreground"
					>
						{#if expanded}<ChevronDown size={14} />{:else}<ChevronRight size={14} />{/if}
						<input
							class="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-1 text-base text-foreground outline-none focus:border-primary"
							data-group-name-input={group.id}
							value={group.label}
							onfocus={() => editor.beginGroupedDocumentEdit()}
							oninput={(event) => editor.updateGroupLabel(group.id, textInput(event))}
							onblur={() => {
								editor.endGroupedDocumentEdit();
								editor.finishRenameGroup();
							}}
							onkeydown={(event) => {
								if (event.key === 'Enter') {
									editor.endGroupedDocumentEdit();
									editor.finishRenameGroup();
								}
							}}
						/>
					</div>
				{:else}
					<button
						class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
						onclick={() => ui.toggleBlock(group.id)}
						title="Toggle folder"
					>
						{#if expanded}<ChevronDown size={14} />{:else}<ChevronRight size={14} />{/if}
					</button>
					<button
						class="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-1 text-left text-sidebar-foreground hover:text-sidebar-accent-foreground"
						onclick={() => editor.selectGroup(group.path)}
						title={group.path}
					>
						<span class="truncate">{group.label}</span>
					</button>
				{/if}
				<button
					class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-sidebar-accent hover:text-sidebar-primary focus:opacity-100 group-hover:opacity-100"
					onclick={() => editor.addSubdir(group.path)}
					title="Add folder"
				>
					<FolderPlus size={14} />
				</button>
				<button
					class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-sidebar-accent hover:text-sidebar-primary focus:opacity-100 group-hover:opacity-100"
					onclick={() => editor.addRegister(group.path)}
					title="Add register"
				>
					<Plus size={14} />
				</button>
			</div>
		</ContextMenu.Trigger>
		<ContextMenu.Content class="w-36">
			<ContextMenu.Item onSelect={() => editor.startRenameGroup(group.id)}>
				<PenLine size={14} />
				Rename
			</ContextMenu.Item>
			<ContextMenu.Item variant="destructive" onSelect={() => editor.deleteGroup(group.id)}>
				<Trash2 size={14} />
				Delete
			</ContextMenu.Item>
		</ContextMenu.Content>
	</ContextMenu.Root>
	{#if expanded}
		<HierarchyFolderChildren groupPath={group.path} />
	{/if}
</div>
