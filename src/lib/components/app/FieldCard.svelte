<script lang="ts">
	import { ChevronDown, ChevronRight, Plus, Trash2 } from '@lucide/svelte';
	import type { Access, Field } from '$lib/rdl/model';
	import { fieldBitWidth, formatValue, valuePrefix } from '$lib/rdl/format';
	import { resetErrors } from '$lib/rdl/validation';
	import { accessOptions, editor, numberInput, textInput } from '$lib/state/editor.svelte';
	import { ui } from '$lib/state/ui.svelte';
	import * as Select from '$lib/components/ui/select';
	import EnumEditor from './EnumEditor.svelte';

	let { field }: { field: Field } = $props();
	let headerResetMode = $state<'enum' | 'numeric'>('enum');

	const resetEnumValue = $derived(
		field.values.find((value) => value.id === field.resetEnumValueId),
	);
	const resetHeaderText = $derived(
		headerResetMode === 'enum' && resetEnumValue
			? resetEnumValue.name
			: formatValue(field.reset, ui.valueMode, fieldBitWidth(field)),
	);
	const resetValidationErrors = $derived(resetErrors(field, ui.valueMode));
	const errorClass = (errors: string[]) =>
		errors.length
			? 'border-destructive/50 focus:border-destructive'
			: 'border-input focus:border-primary';
</script>

<article
	class={`${field.id === editor.selectedFieldId ? 'border-primary ring-2 ring-primary/20' : 'border-border'} overflow-hidden rounded-md border bg-card text-card-foreground shadow-sm`}
>
	<div class={`${field.color} flex items-center gap-2 pr-3`}>
		<div class="w-1.5 shrink-0 self-stretch"></div>
		<div
			class="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 text-base"
		>
			<button
				class="grid min-w-0 grid-cols-[20px_80px_minmax(0,1fr)] items-center gap-4 text-left"
				onclick={() => editor.toggleField(field.id)}
			>
				{#if ui.expandedFieldIds.has(field.id)}
					<ChevronDown size={14} class="text-muted-foreground" />
				{:else}
					<ChevronRight size={14} class="text-muted-foreground" />
				{/if}
				<span class="font-mono text-primary">[{field.msb}:{field.lsb}]</span>
				<span class="min-w-0">
					<span class="block truncate font-semibold">{field.title}</span>
					<span class="block truncate font-mono text-base text-muted-foreground">{field.name}</span>
				</span>
			</button>
			<span class="grid grid-cols-[176px_86px_86px] items-center gap-2 text-base">
				<button
					class={`whitespace-nowrap rounded-md border bg-background px-2 py-1 text-center text-muted-foreground ${
						resetValidationErrors.length
							? 'border-destructive/50 text-destructive'
							: 'border-border'
					}`}
					title={resetValidationErrors.join(' ') || 'Toggle reset display'}
					onclick={() => {
						headerResetMode = headerResetMode === 'enum' ? 'numeric' : 'enum';
					}}
				>
					Reset: <span
						class={resetEnumValue && headerResetMode === 'enum' ? 'font-semibold' : 'font-mono'}
						>{resetHeaderText}</span
					>
				</button>
				<span
					class="whitespace-nowrap rounded-md border border-chart-2/30 bg-chart-2/10 px-2 py-1 text-center font-medium text-chart-2"
				>
					SW: {field.sw}
				</span>
				<span
					class="whitespace-nowrap rounded-md border border-chart-3/30 bg-chart-3/10 px-2 py-1 text-center font-medium text-chart-3"
				>
					HW: {field.hw}
				</span>
			</span>
		</div>
		<button
			class="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-destructive/30 bg-background text-destructive hover:bg-destructive/10"
			disabled={editor.structureReadOnly}
			onclick={() => editor.removeField(field.id)}
			title="Delete field"
		>
			<Trash2 size={14} />
		</button>
	</div>
	{#if ui.expandedFieldIds.has(field.id)}
		<div class="border-t border-border bg-muted/50 px-8 py-5">
			<div class="space-y-4">
				<div
					class="grid grid-cols-[1fr_1fr_96px_96px_minmax(200px,1fr)_120px_120px] items-end gap-3"
				>
					<label class="space-y-1">
						<span class="text-base font-medium text-muted-foreground">Name</span>
						<input
							class="h-9 w-full rounded-md border border-input bg-background px-2 text-base outline-none focus:border-primary"
							data-field-name-input={field.id}
							value={field.title}
							disabled={!editor.canEditField(field.id, 'title')}
							oninput={(event) => editor.updateField(field.id, { title: textInput(event) })}
						/>
					</label>
					<label class="space-y-1">
						<span class="text-base font-medium text-muted-foreground">ID</span>
						<input
							class="h-9 w-full rounded-md border border-input bg-background px-2 font-mono text-base outline-none focus:border-primary"
							value={field.name}
							disabled={!editor.canEditField(field.id, 'name')}
							oninput={(event) => editor.updateField(field.id, { name: textInput(event) })}
						/>
					</label>
					<label class="space-y-1">
						<span class="text-base font-medium text-muted-foreground">MSB</span>
						<input
							class="h-9 w-full rounded-md border border-input bg-background px-2 font-mono text-base outline-none focus:border-primary"
							type="number"
							min="0"
							max={editor.selectedRegister.width - 1}
							value={field.msb}
							disabled={!editor.canEditField(field.id, 'bitRange')}
							oninput={(event) => editor.updateField(field.id, { msb: numberInput(event) })}
						/>
					</label>
					<label class="space-y-1">
						<span class="text-base font-medium text-muted-foreground">LSB</span>
						<input
							class="h-9 w-full rounded-md border border-input bg-background px-2 font-mono text-base outline-none focus:border-primary"
							type="number"
							min="0"
							max={editor.selectedRegister.width - 1}
							value={field.lsb}
							disabled={!editor.canEditField(field.id, 'bitRange')}
							oninput={(event) => editor.updateField(field.id, { lsb: numberInput(event) })}
						/>
					</label>
					<div class="space-y-1">
						<span class="text-base font-medium text-muted-foreground">Reset</span>
						{#key ui.valueMode}
							{#if field.values.length}
								<div class="grid grid-cols-[minmax(0,1fr)_minmax(104px,0.7fr)] gap-2">
									<span class="group/error relative min-w-0">
										<Select.Root
											type="single"
											value={field.resetEnumValueId}
											disabled={!editor.canEditField(field.id, 'reset')}
											onValueChange={(value: string) => {
												editor.updateResetEnumValue(field.id, value);
											}}
										>
											<Select.Trigger
												class={`flex h-9 w-full rounded-md border bg-background px-2 text-base focus-visible:ring-0 ${errorClass(
													resetValidationErrors,
												)}`}
												title={resetValidationErrors.join(' ')}
											>
												<span class="truncate">{resetEnumValue?.name ?? 'Invalid reset'}</span>
											</Select.Trigger>
											<Select.Content>
												{#each field.values as value (value.id)}
													<Select.Item class="text-base" value={value.id} label={value.name}>
														<span class="truncate">{value.name}</span>
													</Select.Item>
												{/each}
											</Select.Content>
										</Select.Root>
										{#if resetValidationErrors.length}
											<span
												class="pointer-events-none absolute right-1 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full bg-destructive/10 text-base font-semibold text-destructive"
											>
												!
											</span>
											<span
												class="pointer-events-none absolute bottom-full left-0 z-20 mb-2 hidden w-max max-w-sm rounded-md border border-destructive/30 bg-popover px-2 py-1 text-base leading-5 text-destructive shadow-lg group-hover/error:block group-focus-within/error:block"
											>
												{resetValidationErrors.join(' ')}
											</span>
										{/if}
									</span>
									<span
										class={`flex h-9 overflow-hidden rounded-md border bg-background focus-within:border-primary ${
											resetValidationErrors.length ? 'border-destructive/50' : 'border-input'
										}`}
										title={resetValidationErrors.join(' ')}
									>
										{#if valuePrefix(ui.valueMode)}
											<span
												class="flex items-center border-r border-border bg-muted px-2 font-mono text-base text-muted-foreground"
											>
												{valuePrefix(ui.valueMode)}
											</span>
										{/if}
										<input
											class="min-w-0 flex-1 px-2 font-mono text-base outline-none"
											inputmode={ui.valueMode === 'dec' ? 'numeric' : 'text'}
											disabled={!editor.canEditField(field.id, 'reset')}
											value={ui.numericInputValue(
												`reset:${field.id}`,
												field.reset,
												fieldBitWidth(field),
											)}
											oninput={(event) => editor.updateResetDraft(field.id, textInput(event))}
											onblur={() => editor.commitResetDraft(field.id)}
										/>
									</span>
								</div>
								{#if resetValidationErrors.length}
									<button
										class="mt-2 inline-flex h-8 items-center gap-2 rounded-md border border-border bg-background px-3 text-base font-medium text-primary hover:bg-muted"
										disabled={editor.structureReadOnly}
										onclick={() => editor.addEnumValueForReset(field.id)}
									>
										<Plus size={14} />
										Add Encoding
									</button>
								{/if}
							{:else}
								<span
									class="flex h-9 overflow-hidden rounded-md border border-input bg-background focus-within:border-primary"
								>
									{#if valuePrefix(ui.valueMode)}
										<span
											class="flex items-center border-r border-border bg-muted px-2 font-mono text-base text-muted-foreground"
										>
											{valuePrefix(ui.valueMode)}
										</span>
									{/if}
									<input
										class="min-w-0 flex-1 px-2 font-mono text-base outline-none"
										inputmode={ui.valueMode === 'dec' ? 'numeric' : 'text'}
										disabled={!editor.canEditField(field.id, 'reset')}
										value={ui.numericInputValue(
											`reset:${field.id}`,
											field.reset,
											fieldBitWidth(field),
										)}
										oninput={(event) => editor.updateResetDraft(field.id, textInput(event))}
										onblur={() => editor.commitResetDraft(field.id)}
									/>
								</span>
							{/if}
						{/key}
					</div>
					<div class="space-y-1">
						<span class="text-base font-medium text-muted-foreground">SW</span>
						<Select.Root
							type="single"
							value={field.sw}
							disabled={!editor.canEditField(field.id, 'sw')}
							onValueChange={(sw: string) => editor.updateField(field.id, { sw: sw as Access })}
						>
							<Select.Trigger
								class="h-9 w-full bg-background text-base focus-visible:border-primary focus-visible:ring-0"
							>
								{field.sw}
							</Select.Trigger>
							<Select.Content>
								{#each accessOptions as access (access)}
									<Select.Item class="text-base" value={access} label={access} />
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
					<div class="space-y-1">
						<span class="text-base font-medium text-muted-foreground">HW</span>
						<Select.Root
							type="single"
							value={field.hw}
							disabled={!editor.canEditField(field.id, 'hw')}
							onValueChange={(hw: string) => editor.updateField(field.id, { hw: hw as Access })}
						>
							<Select.Trigger
								class="h-9 w-full bg-background text-base focus-visible:border-primary focus-visible:ring-0"
							>
								{field.hw}
							</Select.Trigger>
							<Select.Content>
								{#each accessOptions as access (access)}
									<Select.Item class="text-base" value={access} label={access} />
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
				</div>

				<label class="block space-y-1">
					<span class="text-base font-medium text-muted-foreground">Desc</span>
					<textarea
						class="min-h-20 w-full resize-none rounded-md border border-input bg-background p-2 text-base leading-6 outline-none focus:border-primary"
						value={field.desc}
						disabled={!editor.canEditField(field.id, 'desc')}
						oninput={(event) => editor.updateField(field.id, { desc: textInput(event) })}
					></textarea>
				</label>

				<EnumEditor {field} />
			</div>
		</div>
	{/if}
</article>
