<script lang="ts">
	import { Plus } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import type { ValueMode } from '$lib/rdl/model';
	import { editor } from '$lib/state/editor.svelte';
	import { ui } from '$lib/state/ui.svelte';
	import FieldCard from './FieldCard.svelte';

	const valueModes: ValueMode[] = ['hex', 'dec', 'bin'];

	async function addField() {
		await editor.addField();
		globalThis.document
			.querySelector<HTMLElement>(`[data-field-card="${CSS.escape(editor.selectedFieldId)}"]`)
			?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}
</script>

<section class="px-8 pb-8">
	<div class="mb-3 flex items-center justify-between">
		<h2 class="text-base font-semibold">Fields</h2>
		<div class="flex items-center gap-2">
			<div class="flex items-center overflow-hidden rounded-md border border-border text-base">
				{#each valueModes as mode (mode)}
					<button
						class={`h-8 px-3 uppercase ${
							ui.valueMode === mode
								? 'bg-primary text-primary-foreground'
								: 'bg-background text-muted-foreground hover:bg-muted'
						}`}
						onclick={() => (ui.valueMode = mode)}
					>
						{mode}
					</button>
				{/each}
			</div>
			<Button
				variant="outline"
				size="lg"
				class="text-muted-foreground"
				onclick={() => ui.expandAllFields(editor.selectedRegister)}
			>
				Expand All
			</Button>
			<Button
				variant="outline"
				size="lg"
				class="text-muted-foreground"
				onclick={() => ui.collapseAllFields()}
			>
				Collapse All
			</Button>
			<Button
				variant="outline"
				size="lg"
				class="text-primary"
				disabled={editor.structureReadOnly}
				onclick={addField}
			>
				<Plus size={14} />
				Add Field
			</Button>
		</div>
	</div>

	<div class="space-y-3">
		{#if editor.selectedRegister.fields.length}
			{#each editor.selectedRegister.fields as field (field.id)}
				<FieldCard {field} />
			{/each}
		{:else}
			<Empty.Root class="min-h-48 rounded-md border border-border">
				<Empty.Content>
					<Empty.Title class="text-base">No fields</Empty.Title>
					<Empty.Description class="text-base">
						Add a field to define this register's bit layout.
					</Empty.Description>
				</Empty.Content>
			</Empty.Root>
		{/if}
	</div>
</section>
