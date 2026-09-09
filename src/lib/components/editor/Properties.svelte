<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Plus } from '@lucide/svelte';
	import PropertyRow from './PropertyRow.svelte';
	import PropertyValueEditor from './PropertyValueEditor.svelte';
	import { valueDefault } from '$lib/ui/values';
	import { builtinProperties } from '$lib/rdl/properties';
	import type { RdlNode } from '$lib/rdl/types';
	import type { EditorSession } from '$lib/editor/session.svelte';
	let { node, session }: { node: RdlNode; session: EditorSession } = $props();
	let bindOnly = $state(false);
	let adding = $state(false),
		property = $state(''),
		value = $state('');
	let definitions = $derived(
		session.compilation.properties.filter(
			(p) => p.components.includes(node.kind) || p.components.includes('all')
		)
	);
	let suggestions = $derived(
		[
			...new Set([
				...Object.entries(builtinProperties)
					.filter(([, p]) => p.components.includes(node.kind))
					.map(([name]) => name),
				...definitions.map((p) => p.name)
			])
		].filter((p) => !node.properties[p])
	);
	let selectedType = $derived(
		definitions.find((d) => d.name === property)?.type ??
			builtinProperties[property]?.type ??
			'string'
	);
	async function add() {
		if (
			await session.edit({
				type: 'set-property',
				nodeId: node.id,
				property,
				value: bindOnly ? '' : value
			})
		) {
			adding = false;
			property = '';
			value = '';
		}
	}
	function options(name: string) {
		if (name === 'sw') return ['rw', 'r', 'w', 'rw1', 'w1', 'na'];
		if (name === 'hw') return ['rw', 'r', 'w', 'na'];
		if (name === 'encode')
			return [
				...new Set(
					session.compilation.enums
						.filter(
							(e) =>
								!e.scopeRange ||
								(e.scopeRange.start <= node.bodyRange.start &&
									node.bodyRange.start <= e.scopeRange.end)
						)
						.map((e) => e.name)
				)
			];
		if (name === 'onread') return ['rclr', 'rset', 'ruser'];
		if (name === 'onwrite')
			return ['woset', 'woclr', 'wot', 'wzs', 'wzc', 'wzt', 'wclr', 'wset', 'wuser'];
		if (name === 'addressing') return ['compact', 'regalign', 'fullalign'];
		if (name === 'precedence') return ['sw', 'hw'];
		return [];
	}
</script>

<div class="space-y-5">
	<div class="flex items-center justify-between">
		<h3 class="text-sm font-semibold">Properties</h3>
		<Button
			type="button"
			size="sm"
			variant="ghost"
			disabled={!node.editable || session.busy}
			onclick={() => (adding = !adding)}><Plus />Add property</Button
		>
	</div>
	{#if adding}<form
			class="space-y-3 rounded-lg border bg-muted/30 p-4"
			onsubmit={(event) => {
				event.preventDefault();
				void add();
			}}
		>
			<div class="grid gap-3 sm:grid-cols-2">
				<label class="grid content-start gap-2 text-sm font-medium"
					>Property<select
						bind:value={property}
						onchange={(event) => {
							property = event.currentTarget.value;
							bindOnly = false;
							value = valueDefault(selectedType, session.compilation, node.bodyRange.start);
						}}
						required
						class="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
						><option value="" disabled>Select a property</option
						>{#each suggestions as name (name)}<option>{name}</option>{/each}</select
					></label
				>{#if property && !bindOnly}<PropertyValueEditor
						label="Value"
						type={selectedType}
						bind:text={value}
						compilation={session.compilation}
						scopeOffset={node.bodyRange.start}
						options={options(property)}
					/>{/if}
			</div>
			{#if definitions.some((d) => d.name === property)}<label
					class="flex items-center gap-2 text-sm"
					><input
						type="checkbox"
						class="accent-primary"
						bind:checked={bindOnly}
					/>{definitions.find((d) => d.name === property)?.defaultText !== undefined
						? 'Use default'
						: 'No value'}</label
				>{/if}
			<div class="flex justify-end gap-2">
				<Button type="button" variant="ghost" size="sm" onclick={() => (adding = false)}
					>Cancel</Button
				><Button type="submit" size="sm" disabled={!property || session.busy}>Add</Button>
			</div>
			{#if session.error}<p role="alert" class="text-xs text-destructive">{session.error}</p>{/if}
		</form>{/if}
	<div class="grid gap-x-5 gap-y-4 sm:grid-cols-2">
		{#each Object.values(node.properties).filter((item) => !(node.kind === 'reg' && item.name === 'regwidth')) as item (item.name)}<PropertyRow
				{item}
				{node}
				{session}
				options={options(item.name)}
			/>{:else}<p class="text-sm text-muted-foreground sm:col-span-2">No properties.</p>{/each}
	</div>
</div>
