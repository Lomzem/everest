<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { X, Check } from '@lucide/svelte';
	import PropertyValueEditor from './PropertyValueEditor.svelte';
	import type { EditorSession } from '$lib/editor/session.svelte';
	import type { RdlNode, PropertyValue } from '$lib/rdl/types';
	let {
		item,
		node,
		session,
		options = []
	}: { item: PropertyValue; node: RdlNode; session: EditorSession; options?: string[] } = $props();
	let draft = $derived(item.text),
		failure = $state('');
	let aggregate = $derived(
		item.type.endsWith('[]') ||
			session.compilation.structs?.some((struct) => struct.name === item.type)
	);
	async function apply() {
		if (draft === item.text || session.busy) return;
		const ok = await session.edit({
			type: 'set-property',
			nodeId: node.id,
			property: item.name,
			value: draft
		});
		failure = ok ? '' : session.error || 'This value is not valid.';
	}
</script>

<div class="min-w-0 space-y-2">
	<div class="flex items-start gap-1">
		<div class="min-w-0 flex-1">
			<PropertyValueEditor
				label={item.name}
				type={item.type}
				bind:text={draft}
				compilation={session.compilation}
				scopeOffset={node.bodyRange.start}
				disabled={!node.editable || !item.editable || session.busy}
				{options}
				oncommit={aggregate ? undefined : apply}
			/>
		</div>
		{#if !item.inherited && item.editable}<Button
				type="button"
				class="mt-6"
				size="icon-sm"
				variant="ghost"
				aria-label={`Remove ${item.name} property`}
				disabled={session.busy}
				onclick={() =>
					session.edit({ type: 'remove-property', nodeId: node.id, property: item.name })}
				><X /></Button
			>{/if}
	</div>
	{#if aggregate && draft !== item.text}<Button
			type="button"
			size="sm"
			variant="outline"
			onclick={apply}
			disabled={session.busy}><Check />Apply value</Button
		>{/if}
	{#if failure}<p role="alert" class="text-xs text-destructive dark:text-foreground">
			{failure}
		</p>{:else if item.unassigned}<p class="text-xs text-muted-foreground">
			Not set
		</p>{:else if item.inherited}<p class="text-xs text-muted-foreground">
			Inherited
		</p>{:else if !item.editable}<p class="text-xs text-muted-foreground">Read-only</p>{/if}
</div>
