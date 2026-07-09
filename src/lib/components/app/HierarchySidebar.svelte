<script lang="ts">
	import { tick } from 'svelte';
	import {
		ChevronDown,
		ChevronRight,
		FolderPlus,
		FolderTree,
		PanelLeftClose,
		PanelLeftOpen,
		Plus,
		Search,
		Settings,
		X,
	} from '@lucide/svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { rootBlockId } from '$lib/rdl/hierarchy';
	import { editor } from '$lib/state/editor.svelte';
	import { ui } from '$lib/state/ui.svelte';
	import HierarchyFolderChildren from './HierarchyFolderChildren.svelte';

	let { resizable = false } = $props<{ resizable?: boolean }>();
	let rootExpanded = $derived(editor.searchActive || ui.expandedBlocks.has(rootBlockId));

	function focusSearchInput() {
		ui.leftCollapsed = false;
		void tick().then(() => {
			globalThis.document.querySelector<HTMLInputElement>('[data-hierarchy-search-input]')?.focus();
		});
	}

	function handleKeydown(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
			event.preventDefault();
			focusSearchInput();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<aside
	class={`${ui.leftCollapsed ? 'w-14' : resizable ? 'w-full' : 'w-80'} flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width]`}
>
	<div class="flex h-12 items-center justify-between border-b border-sidebar-border px-3">
		{#if !ui.leftCollapsed}
			<div
				class="flex items-center gap-2 text-base font-semibold uppercase tracking-normal text-sidebar-foreground"
			>
				<FolderTree size={15} />
				Hierarchy
			</div>
		{/if}
		<button
			class="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
			onclick={() => ui.toggleLeftCollapsed()}
			title="Toggle hierarchy"
		>
			{#if ui.leftCollapsed}<PanelLeftOpen size={16} />{:else}<PanelLeftClose size={16} />{/if}
		</button>
	</div>

	{#if !ui.leftCollapsed}
		<div class="border-b border-sidebar-border p-3">
			<label class="relative block">
				<Search class="absolute left-2.5 top-2.5 text-muted-foreground" size={15} />
				<input
					class="h-9 w-full rounded-md border border-input bg-background pl-8 pr-8 text-base outline-none ring-primary/20 placeholder:text-muted-foreground focus:border-primary focus:ring-4"
					data-hierarchy-search-input
					placeholder="Search names, enums, addresses"
					value={ui.searchInputText}
					oninput={(event) => ui.updateSearchInput((event.currentTarget as HTMLInputElement).value)}
					onkeydown={(event) => {
						if (event.key === 'Escape' && ui.searchInputText) {
							event.preventDefault();
							event.stopPropagation();
							ui.clearSearch();
						}
					}}
				/>
				{#if ui.searchInputText}
					<button
						type="button"
						class="absolute right-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
						onclick={() => ui.clearSearch()}
						title="Clear search"
					>
						<X size={14} />
					</button>
				{/if}
			</label>
		</div>

		<ScrollArea class="min-h-0 flex-1 text-base">
			<div class="p-2">
				<div
					class={`group flex items-center gap-1 rounded-md ${
						editor.selectedKind === 'folder' && editor.selectedGroupPath === ''
							? 'bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-sidebar-ring'
							: ''
					}`}
					role="presentation"
				>
					<button
						class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
						onclick={() => ui.toggleBlock(rootBlockId)}
						title="Toggle addrmap"
					>
						{#if rootExpanded}<ChevronDown size={14} />{:else}<ChevronRight size={14} />{/if}
					</button>
					<button
						class="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-1.5 text-left font-medium text-sidebar-foreground hover:text-sidebar-accent-foreground"
						onclick={() => editor.selectGroup('')}
						title={editor.addrmapLabel}
					>
						<span class="truncate">{editor.addrmapLabel}</span>
					</button>
					<button
						class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-sidebar-accent hover:text-sidebar-primary focus:opacity-100 group-hover:opacity-100"
						onclick={() => editor.addSubdir()}
						title="Add folder"
					>
						<FolderPlus size={14} />
					</button>
					<button
						class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-sidebar-accent hover:text-sidebar-primary focus:opacity-100 group-hover:opacity-100"
						onclick={() => editor.addRegister('')}
						title="Add register"
					>
						<Plus size={14} />
					</button>
				</div>
				{#if rootExpanded}
					{#if editor.searchActive && editor.searchResults.length === 0}
						<div class="px-9 py-4 text-base text-muted-foreground">No matches</div>
					{:else}
						<HierarchyFolderChildren groupPath="" />
					{/if}
				{/if}
			</div>
		</ScrollArea>
	{/if}

	<div class="mt-auto border-t border-sidebar-border p-2">
		<DropdownMenu.Root>
			<DropdownMenu.Trigger
				class={`inline-flex h-9 w-full items-center rounded-md text-base text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring ${ui.leftCollapsed ? 'justify-center' : 'justify-start gap-2 px-2'}`}
				aria-label="Settings"
			>
				<Settings size={16} />
				{#if !ui.leftCollapsed}
					<span>Settings</span>
				{/if}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content side="right" align="end" class="w-52">
				<DropdownMenu.Label>Appearance</DropdownMenu.Label>
				<DropdownMenu.RadioGroup
					value={ui.themeMode}
					onValueChange={(value) => ui.setThemeMode(value)}
				>
					<DropdownMenu.RadioItem value="light">Light Mode</DropdownMenu.RadioItem>
					<DropdownMenu.RadioItem value="dark">Dark Mode</DropdownMenu.RadioItem>
					<DropdownMenu.RadioItem value="system">Follow System</DropdownMenu.RadioItem>
				</DropdownMenu.RadioGroup>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>
</aside>
