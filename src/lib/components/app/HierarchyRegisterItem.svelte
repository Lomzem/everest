<script lang="ts">
	import { Edit3, Trash2 } from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge';
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import type { Register } from '$lib/rdl/model';
	import { formatAddress } from '$lib/rdl/format';
	import { registerIdentifierErrors } from '$lib/rdl/validation';
	import { editor } from '$lib/state/editor.svelte';
	import { ui } from '$lib/state/ui.svelte';
	import HighlightedText from './HighlightedText.svelte';

	let { register }: { register: Register } = $props();
	let searchResult = $derived(editor.searchResultForRegister(register.id));
	let label = $derived(register.title || register.name);
	let labelRanges = $derived(register.title ? searchResult?.titleRanges : searchResult?.nameRanges);
	let registerIdErrors = $derived(registerIdentifierErrors(editor.document, register));
</script>

<ContextMenu.Root>
	<ContextMenu.Trigger class="block">
		<div
			class={`group relative flex w-full items-center rounded-md border border-transparent ${
				editor.selectedKind === 'register' && register.id === editor.selectedRegister.id
					? 'bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-sidebar-ring'
					: 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
			} ${ui.draggedRegisterId === register.id ? 'opacity-50' : ''} ${
				ui.dragOverRegisterId === register.id && ui.dragOverRegisterPosition === 'before'
					? 'border-t-2 border-t-blue-500'
					: ''
			} ${
				ui.dragOverRegisterId === register.id && ui.dragOverRegisterPosition === 'after'
					? 'border-b-2 border-b-blue-500'
					: ''
			}`}
			draggable={!editor.structureReadOnly}
			ondragstart={(event) => ui.beginRegisterDrag(event, register.id)}
			ondragend={() => ui.finishRegisterDrag()}
			ondragover={(event) => {
				if (!editor.structureReadOnly) ui.dragRegisterOverRegister(event, register.id);
			}}
			ondragleave={() => {
				if (ui.dragOverRegisterId === register.id) {
					ui.dragOverRegisterId = '';
					ui.dragOverRegisterPosition = '';
				}
			}}
			ondrop={(event) => {
				if (!editor.structureReadOnly) editor.dropRegisterOnRegister(event, register);
			}}
			role="listitem"
		>
			<button
				class="relative min-w-0 w-full px-2 py-2 pr-14 text-left"
				onclick={() => editor.selectRegister(register.id)}
			>
				<span class="min-w-0">
					<span class="block truncate font-medium">
						<HighlightedText text={label} ranges={labelRanges ?? []} />
					</span>
					<span
						class={`block truncate font-mono text-base ${
							registerIdErrors.length ? 'text-destructive' : 'text-muted-foreground/80'
						}`}
						title={registerIdErrors.join(' ')}
					>
						<HighlightedText text={register.name} ranges={searchResult?.nameRanges ?? []} />
					</span>
					<span class="block text-base text-muted-foreground/80"
						>{register.fields.length} fields</span
					>
				</span>
				<Badge
					variant="outline"
					class="absolute right-2 top-2.5 justify-end text-right font-mono text-sidebar-foreground"
				>
					@ {formatAddress(register.address)}
				</Badge>
				{#if searchResult?.snippet}
					<span class="mt-1 block truncate text-base text-muted-foreground">
						<span class="font-medium text-sidebar-foreground">{searchResult.snippet.label}</span>
						<span aria-hidden="true">: </span>
						<HighlightedText
							text={searchResult.snippet.text}
							ranges={searchResult.snippet.ranges}
						/>
					</span>
				{/if}
			</button>
			<button
				class="absolute right-1 top-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive focus:opacity-100"
				disabled={editor.structureReadOnly}
				onclick={(event) => {
					event.stopPropagation();
					editor.deleteRegister(register.id);
				}}
				title="Delete register"
			>
				<Trash2 size={14} />
			</button>
		</div>
	</ContextMenu.Trigger>
	<ContextMenu.Content class="w-36">
		<ContextMenu.Item
			disabled={!editor.canEditRegister(register.id, 'name')}
			onSelect={() => editor.startRenameRegister(register.id)}
		>
			<Edit3 size={14} />
			Rename
		</ContextMenu.Item>
		<ContextMenu.Item
			variant="destructive"
			disabled={editor.structureReadOnly}
			onSelect={() => editor.deleteRegister(register.id)}
		>
			<Trash2 size={14} />
			Delete
		</ContextMenu.Item>
	</ContextMenu.Content>
</ContextMenu.Root>
