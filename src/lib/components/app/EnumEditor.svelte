<script lang="ts">
	import { Braces, Plus, Trash2 } from '@lucide/svelte';
	import type { Field } from '$lib/rdl/model';
	import { enumValueErrors } from '$lib/rdl/validation';
	import { fieldBitWidth, valuePrefix } from '$lib/rdl/format';
	import { editor, textInput } from '$lib/state/editor.svelte';
	import { ui } from '$lib/state/ui.svelte';

	let { field }: { field: Field } = $props();
</script>

{#if field.values.length}
	<div class="mt-4 rounded-md border border-border bg-card p-3">
		<div class="mb-3 grid grid-cols-[auto_1fr_auto] items-center gap-2 text-base">
			<Braces size={15} class="text-muted-foreground" />
			<label class="flex items-center gap-2">
				<span class="font-semibold">Enum</span>
				<input
					class="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 font-mono text-base outline-none focus:border-primary"
					data-enum-name-input={field.id}
					value={field.enumName}
					disabled={!editor.canEditField(field.id, 'enumName')}
					oninput={(event) => editor.updateField(field.id, { enumName: textInput(event) })}
				/>
			</label>
			<button
				class="inline-flex h-8 items-center gap-2 rounded-md border border-border px-3 text-base font-medium text-primary hover:bg-muted"
				disabled={editor.structureReadOnly}
				onclick={() => editor.addEnumValue(field.id)}
			>
				<Plus size={14} />
				Add Encoding
			</button>
		</div>
		<div class="space-y-2">
			{#each field.values as value (value.id)}
				{@const errors = enumValueErrors(field, value, ui.valueMode)}
				<div class="grid grid-cols-[160px_160px_1fr_auto] gap-3 text-base">
					<input
						class="h-8 rounded-md border border-input bg-background px-2 font-semibold outline-none focus:border-primary"
						data-enum-variant-name-input={`${field.id}:${value.id}`}
						value={value.name}
						disabled={!editor.canEditEnumValue(field.id, value.id, 'name')}
						oninput={(event) =>
							editor.updateEnumValue(field.id, value.id, { name: textInput(event) })}
					/>
					{#key `${ui.valueMode}:${value.id}`}
						<span class="relative">
							<span
								class={`flex h-8 overflow-hidden rounded-md border bg-background ${
									errors.length
										? 'border-destructive/50 focus-within:border-destructive'
										: 'border-input focus-within:border-primary'
								}`}
								title={errors.join(' ')}
							>
								{#if valuePrefix(ui.valueMode)}
									<span
										class="flex items-center border-r border-border bg-muted px-2 font-mono text-base text-muted-foreground"
									>
										{valuePrefix(ui.valueMode)}
									</span>
								{/if}
								<input
									class="min-w-0 flex-1 py-0 pl-2 pr-6 font-mono text-base text-muted-foreground outline-none"
									data-enum-value-input={`${field.id}:${value.id}`}
									inputmode={ui.valueMode === 'dec' ? 'numeric' : 'text'}
									disabled={!editor.canEditEnumValue(field.id, value.id, 'value')}
									value={ui.numericInputValue(
										`enum:${field.id}:${value.id}`,
										value.value,
										fieldBitWidth(field),
									)}
									oninput={(event) =>
										editor.updateEnumNumericValue(field.id, value.id, textInput(event))}
									onblur={() => editor.commitEnumNumericValue(field.id, value.id)}
									onkeydown={(event) => {
										if (event.key === 'Enter') {
											event.preventDefault();
											editor.commitEnumNumericValue(field.id, value.id, true);
										}
									}}
								/>
							</span>
							{#if errors.length}
								<span
									class="pointer-events-none absolute right-1 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full bg-destructive/10 text-base font-semibold text-destructive"
								>
									!
								</span>
								<span
									class="pointer-events-none absolute left-full top-1/2 z-20 ml-2 w-max max-w-sm -translate-y-1/2 rounded-md border border-destructive/30 bg-popover px-2 py-1 text-base leading-5 text-destructive shadow-lg"
								>
									{errors.join(' ')}
								</span>
							{/if}
						</span>
					{/key}
					<input
						class="h-8 rounded-md border border-input bg-background px-2 text-muted-foreground outline-none focus:border-primary"
						value={value.desc}
						disabled={!editor.canEditEnumValue(field.id, value.id, 'desc')}
						oninput={(event) =>
							editor.updateEnumValue(field.id, value.id, { desc: textInput(event) })}
					/>
					<button
						class="inline-flex size-8 items-center justify-center rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10"
						disabled={editor.structureReadOnly}
						onclick={() => editor.removeEnumValue(field.id, value.id)}
						title="Remove encoding"
					>
						<Trash2 size={14} />
					</button>
				</div>
			{/each}
		</div>
	</div>
{:else}
	<button
		class="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-base font-medium text-primary hover:bg-muted"
		disabled={editor.structureReadOnly}
		onclick={() => editor.addEnumValue(field.id)}
	>
		<Braces size={15} />
		Add Enum
	</button>
{/if}
