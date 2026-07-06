<script lang="ts">
	import { Cpu, FolderPlus, FolderTree, Plus } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { formatAddress } from '$lib/rdl/format';
	import { rootBlockId } from '$lib/rdl/hierarchy';
	import { editor, textInput } from '$lib/state/editor.svelte';
	import EditorBreadcrumbs from './EditorBreadcrumbs.svelte';

	let canRenameSelectedFolder = $derived(
		editor.selectedFolder?.id === rootBlockId
			? editor.canEditAddrmapName()
			: !editor.structureReadOnly,
	);
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
						disabled={!canRenameSelectedFolder}
						onfocus={() => editor.beginGroupedDocumentEdit()}
						oninput={(event) =>
							editor.updateGroupLabel(editor.selectedFolder?.id ?? '', textInput(event))}
						onblur={() => editor.endGroupedDocumentEdit()}
						aria-label="Folder display name"
					/>
				</label>
			</div>
			<div class="flex shrink-0 items-center gap-2">
				<Button
					variant="outline"
					size="lg"
					class="text-primary"
					disabled={editor.structureReadOnly}
					onclick={() => editor.addSubdir(editor.selectedFolder?.path ?? '')}
				>
					<FolderPlus size={14} />
					Add Folder
				</Button>
				<Button
					variant="outline"
					size="lg"
					class="text-primary"
					disabled={editor.structureReadOnly}
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
				{#each editor.selectedFolderChildren as child (child.kind === 'folder' ? child.path : child.register.id)}
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
					{:else}
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
					{/if}
				{/each}
			{:else}
				<div class="flex min-h-36 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
					<div class="flex items-center gap-2">
						<Button
							variant="outline"
							size="lg"
							class="text-primary"
							disabled={editor.structureReadOnly}
							onclick={() => editor.addSubdir(editor.selectedFolder?.path ?? '')}
						>
							<FolderPlus size={14} />
							Add Folder
						</Button>
						<Button
							variant="outline"
							size="lg"
							class="text-primary"
							disabled={editor.structureReadOnly}
							onclick={() => editor.addRegister(editor.selectedFolder?.path ?? '')}
						>
							<Plus size={14} />
							Add Register
						</Button>
					</div>
				</div>
			{/if}
		</div>
	</section>
{/if}
