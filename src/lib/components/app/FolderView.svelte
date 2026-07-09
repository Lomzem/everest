<script lang="ts">
	import { Cpu, FolderPlus, FolderTree, MoveRight, Plus } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import { formatAddress } from '$lib/rdl/format';
	import { rootBlockId } from '$lib/rdl/hierarchy';
	import { editor, textInput } from '$lib/state/editor.svelte';
	import EditorBreadcrumbs from './EditorBreadcrumbs.svelte';
	import MoveToFolderDialog from './MoveToFolderDialog.svelte';

	let moveDialogOpen = $state(false);

	function reservedAddressLabel(address: number, endAddress: number) {
		return address === endAddress
			? formatAddress(address)
			: `${formatAddress(address)}-${formatAddress(endAddress)}`;
	}
</script>

{#if editor.selectedFolder}
	<div class="border-b border-border px-8 py-6" data-folder-view>
		<div class="flex items-start justify-between gap-6">
			<div class="min-w-0">
				<div class="mb-3">
					<EditorBreadcrumbs />
				</div>
				<label class="block w-full space-y-1">
					<span class="text-base font-semibold uppercase tracking-normal text-muted-foreground"
						>Name</span
					>
					<input
						class="w-full rounded-md border border-input bg-background px-2 py-2 text-2xl font-semibold leading-8 tracking-normal text-foreground outline-none hover:border-primary/60 focus:border-primary disabled:border-transparent disabled:px-0"
						data-folder-label-input={editor.selectedFolder.id}
						value={editor.selectedFolder.label}
						onfocus={() => editor.beginGroupedDocumentEdit()}
						oninput={(event) =>
							editor.updateGroupLabel(editor.selectedFolder?.id ?? '', textInput(event))}
						onblur={() => editor.endGroupedDocumentEdit()}
						aria-label="Folder display name"
					/>
				</label>
			</div>
			<div class="flex shrink-0 items-center gap-2">
				{#if editor.selectedFolder.id !== rootBlockId}
					<Button
						variant="outline"
						size="lg"
						class="text-primary"
						onclick={() => (moveDialogOpen = true)}
					>
						<MoveRight size={14} />
						Move
					</Button>
				{/if}
				<Button
					variant="outline"
					size="lg"
					class="text-primary"
					onclick={() => editor.addSubdir(editor.selectedFolder?.path ?? '')}
				>
					<FolderPlus size={14} />
					Add Folder
				</Button>
				<Button
					variant="outline"
					size="lg"
					class="text-primary"
					onclick={() => editor.addRegister(editor.selectedFolder?.path ?? '')}
				>
					<Plus size={14} />
					Add Register
				</Button>
			</div>
		</div>
	</div>

	<section class="max-w-4xl px-8 py-6">
		<div
			class="mb-2 grid grid-cols-[7rem_minmax(0,1fr)] gap-4 px-3 text-base font-semibold uppercase tracking-normal text-muted-foreground"
		>
			<span>Address</span>
			<span>Name</span>
		</div>
		<div class="overflow-hidden rounded-md border border-border bg-card">
			{#if editor.selectedFolderChildren.length}
				{#each editor.selectedFolderChildren as child (child.id)}
					{#if child.kind === 'folder'}
						<button
							class="grid w-full grid-cols-[7rem_minmax(0,1fr)] items-center gap-4 border-b border-border px-3 py-3 text-left last:border-b-0 hover:bg-muted"
							onclick={() => editor.selectGroup(child.path)}
						>
							<span class="font-mono text-base text-muted-foreground">
								{child.address === null ? '--' : formatAddress(child.address)}
							</span>
							<span class="flex min-w-0 items-center gap-3">
								<span
									class="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
								>
									<FolderTree size={15} />
								</span>
								<span class="min-w-0">
									<span class="block truncate font-medium text-foreground">{child.label}</span>
								</span>
							</span>
						</button>
					{:else if child.kind === 'register'}
						<button
							class="grid w-full grid-cols-[7rem_minmax(0,1fr)] items-center gap-4 border-b border-border px-3 py-3 text-left last:border-b-0 hover:bg-muted"
							onclick={() => editor.selectRegister(child.register.id)}
						>
							<span class="font-mono text-base text-muted-foreground"
								>{formatAddress(child.address)}</span
							>
							<span class="flex min-w-0 items-center gap-3">
								<span
									class="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
								>
									<Cpu size={15} />
								</span>
								<span class="min-w-0">
									<span class="block truncate font-medium text-foreground">
										{child.register.title || child.register.name}
									</span>
									<span class="block truncate font-mono text-base text-muted-foreground"
										>{child.register.id}</span
									>
								</span>
							</span>
						</button>
					{:else}
						<div
							class="grid w-full grid-cols-[7rem_minmax(0,1fr)_auto] items-center gap-4 border-b border-dashed border-border bg-muted/30 px-3 py-3 last:border-b-0"
						>
							<span class="font-mono text-base text-muted-foreground"
								>{reservedAddressLabel(child.address, child.endAddress)}</span
							>
							<span class="flex min-w-0 items-center gap-3">
								<span
									class="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground"
								>
									<Plus size={15} />
								</span>
								<span class="min-w-0">
									<span class="block truncate font-medium text-muted-foreground">Reserved</span>
								</span>
							</span>
							<Button
								variant="ghost"
								size="sm"
								class="text-primary"
								onclick={() => editor.addRegister(editor.selectedFolder?.path ?? '', child.address)}
							>
								<Plus size={14} />
								Add
							</Button>
						</div>
					{/if}
				{/each}
			{:else}
				<Empty.Root class="min-h-48 rounded-none border-0">
					<Empty.Content>
						<Empty.Title class="text-base">No registers yet</Empty.Title>
						<Empty.Description class="text-base">
							Add a register to define this addrmap.
						</Empty.Description>
					</Empty.Content>
					<div class="flex items-center gap-2">
						<Button
							variant="outline"
							size="lg"
							class="text-primary"
							onclick={() => editor.addSubdir(editor.selectedFolder?.path ?? '')}
						>
							<FolderPlus size={14} />
							Add Folder
						</Button>
						<Button
							variant="outline"
							size="lg"
							class="text-primary"
							onclick={() => editor.addRegister(editor.selectedFolder?.path ?? '')}
						>
							<Plus size={14} />
							Add Register
						</Button>
					</div>
				</Empty.Root>
			{/if}
		</div>
	</section>

	{#if editor.selectedFolder.id !== rootBlockId}
		<MoveToFolderDialog
			bind:open={moveDialogOpen}
			kind="folder"
			itemId={editor.selectedFolder.id}
		/>
	{/if}
{/if}
