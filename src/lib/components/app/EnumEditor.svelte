<script lang="ts">
	import { Braces, Plus, Trash2 } from '@lucide/svelte';
	import type { Field } from '$lib/rdl/model';
	import { enumValueErrors, identifierErrors } from '$lib/rdl/validation';
	import { fieldBitWidth, valuePrefix } from '$lib/rdl/format';
	import { editor, textInput } from '$lib/state/editor.svelte';
	import { ui } from '$lib/state/ui.svelte';

	let { field }: { field: Field } = $props();

	const errorClass = (errors: string[]) =>
		errors.length
			? 'border-destructive/50 focus:border-destructive'
			: 'border-input focus:border-primary';

	async function addEncoding() {
		await editor.addEnumValue(field.id);
		globalThis.document
			.querySelector<HTMLElement>(`[data-enum-editor="${CSS.escape(field.id)}"]`)
			?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}
</script>

{#if field.values.length}
	{@const enumNameErrors = identifierErrors(field.enumName, 'Enum name')}
	<div class="mt-4 rounded-md border border-border bg-card p-3" data-enum-editor={field.id}>
		<div class="mb-3 grid grid-cols-[auto_1fr_auto] items-center gap-2 text-base">
			<Braces size={15} class="text-muted-foreground" />
			<label class="flex items-center gap-2">
				<span class="font-semibold">Enum</span>
				<span class="group/error relative min-w-0 flex-1">
					<input
						class={`h-8 w-full rounded-md border bg-background px-2 pr-6 font-mono text-base outline-none ${errorClass(
							enumNameErrors,
						)}`}
						data-enum-name-input={field.id}
						value={field.enumName}
						disabled={!editor.canEditField(field.id, 'enumName')}
						title={enumNameErrors.join(' ')}
						onfocus={() => editor.beginGroupedDocumentEdit()}
						oninput={(event) => editor.updateField(field.id, { enumName: textInput(event) })}
						onblur={() => editor.endGroupedDocumentEdit()}
					/>
					{#if enumNameErrors.length}
						<span
							class="pointer-events-none absolute right-1 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full bg-destructive/10 text-base font-semibold text-destructive"
						>
							!
						</span>
						<span
							class="pointer-events-none absolute bottom-full left-0 z-20 mb-2 hidden w-max max-w-sm rounded-md border border-destructive/30 bg-popover px-2 py-1 text-base leading-5 text-destructive shadow-lg group-hover/error:block group-focus-within/error:block"
						>
							{enumNameErrors.join(' ')}
						</span>
					{/if}
				</span>
			</label>
			<button
				class="inline-flex h-8 items-center gap-2 rounded-md border border-border px-3 text-base font-medium text-primary hover:bg-muted"
				disabled={editor.structureReadOnly}
				onclick={addEncoding}
			>
				<Plus size={14} />
				Add Encoding
			</button>
		</div>
		<div class="space-y-2">
			{#each field.values as value (value.id)}
				{@const errors = enumValueErrors(field, value, ui.valueMode)}
				{@const nameErrors = identifierErrors(value.name, 'Enum value name')}
				<div class="grid grid-cols-[160px_160px_1fr_auto] gap-3 text-base">
					<span class="group/error relative">
						<input
							class={`h-8 w-full rounded-md border bg-background px-2 pr-6 font-semibold outline-none ${errorClass(
								nameErrors,
							)}`}
							data-enum-variant-name-input={`${field.id}:${value.id}`}
							value={value.name}
							disabled={!editor.canEditEnumValue(field.id, value.id, 'name')}
							title={nameErrors.join(' ')}
							onfocus={() => editor.beginGroupedDocumentEdit()}
							oninput={(event) =>
								editor.updateEnumValue(field.id, value.id, { name: textInput(event) })}
							onblur={() => editor.endGroupedDocumentEdit()}
						/>
						{#if nameErrors.length}
							<span
								class="pointer-events-none absolute right-1 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full bg-destructive/10 text-base font-semibold text-destructive"
							>
								!
							</span>
							<span
								class="pointer-events-none absolute bottom-full left-0 z-20 mb-2 hidden w-max max-w-sm rounded-md border border-destructive/30 bg-popover px-2 py-1 text-base leading-5 text-destructive shadow-lg group-hover/error:block group-focus-within/error:block"
							>
								{nameErrors.join(' ')}
							</span>
						{/if}
					</span>
					{#key `${ui.valueMode}:${value.id}`}
						<span class="group/error relative">
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
									onfocus={() => editor.beginGroupedDocumentEdit()}
									oninput={(event) =>
										editor.updateEnumNumericValue(field.id, value.id, textInput(event))}
									onblur={() => {
										void editor
											.commitEnumNumericValue(field.id, value.id)
											.then(() => editor.endGroupedDocumentEdit());
									}}
									onkeydown={(event) => {
										if (event.key === 'Enter') {
											event.preventDefault();
											void editor
												.commitEnumNumericValue(field.id, value.id, true)
												.then(() => editor.endGroupedDocumentEdit());
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
									class="pointer-events-none absolute left-full top-1/2 z-20 ml-2 hidden w-max max-w-sm -translate-y-1/2 rounded-md border border-destructive/30 bg-popover px-2 py-1 text-base leading-5 text-destructive shadow-lg group-hover/error:block group-focus-within/error:block"
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
						onfocus={() => editor.beginGroupedDocumentEdit()}
						oninput={(event) =>
							editor.updateEnumValue(field.id, value.id, { desc: textInput(event) })}
						onblur={() => editor.endGroupedDocumentEdit()}
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
		onclick={addEncoding}
	>
		<Braces size={15} />
		Add Enum
	</button>
{/if}
