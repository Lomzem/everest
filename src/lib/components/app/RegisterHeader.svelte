<script lang="ts">
	import { accessOptions, editor, textInput } from '$lib/state/editor.svelte';
	import type { Access } from '$lib/rdl/model';
	import {
		addressInputPattern,
		formatEditableAddress,
		isValidAddressInput,
		parseAddress,
	} from '$lib/rdl/format';
	import { identifierErrors, registerIdentifierErrors } from '$lib/rdl/validation';
	import * as Select from '$lib/components/ui/select';
	import EditorBreadcrumbs from './EditorBreadcrumbs.svelte';

	const registerIdErrors = $derived([
		...identifierErrors(editor.selectedRegister.name, 'Register ID'),
		...registerIdentifierErrors(editor.document, editor.selectedRegister),
	]);
	const errorClass = (errors: string[]) =>
		errors.length
			? 'border-destructive/50 focus:border-destructive'
			: 'border-input focus:border-primary';

	function updateAddressInput(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const value = textInput(event);
		if (!isValidAddressInput(value)) {
			input.value = formatEditableAddress(editor.selectedRegister.address);
			return;
		}

		editor.updateSelectedRegister({ address: parseAddress(value) });
	}
</script>

<div class="border-b border-border px-8 py-6" data-register-editor>
	<div class="flex items-start justify-between gap-6">
		<div class="min-w-0 flex-1">
			<div class="mb-4">
				<EditorBreadcrumbs />
			</div>
			<div class="mb-4 flex items-start justify-between gap-4">
				<label class="space-y-1">
					<span class="text-base font-semibold uppercase tracking-normal text-muted-foreground"
						>Address</span
					>
					<span
						class="flex h-8 overflow-hidden rounded-md border border-input bg-background focus-within:border-primary"
					>
						<span
							class="flex items-center border-r border-border bg-muted px-2 font-mono text-base text-muted-foreground"
						>
							@ 0x
						</span>
						<input
							class="w-20 px-2 font-mono text-base outline-none"
							type="text"
							spellcheck="false"
							pattern={addressInputPattern}
							value={formatEditableAddress(editor.selectedRegister.address)}
							disabled={!editor.canEditSelectedRegister('address')}
							onfocus={() => editor.beginGroupedDocumentEdit()}
							oninput={updateAddressInput}
							onblur={() => editor.endGroupedDocumentEdit()}
						/>
					</span>
				</label>
				<div class="flex items-center gap-3">
					<div class="space-y-1">
						<span class="text-base font-semibold uppercase tracking-normal text-muted-foreground"
							>Default SW</span
						>
						<Select.Root
							type="single"
							value={editor.selectedRegister.sw}
							disabled={!editor.canEditSelectedRegister('sw')}
							onValueChange={(sw: string) => editor.updateSelectedRegister({ sw: sw as Access })}
						>
							<Select.Trigger
								class="h-8 w-24 bg-background text-base focus-visible:border-primary focus-visible:ring-0"
							>
								{editor.selectedRegister.sw}
							</Select.Trigger>
							<Select.Content>
								{#each accessOptions as access (access)}
									<Select.Item class="text-base" value={access} label={access} />
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
					<div class="space-y-1">
						<span class="text-base font-semibold uppercase tracking-normal text-muted-foreground"
							>Default HW</span
						>
						<Select.Root
							type="single"
							value={editor.selectedRegister.hw}
							disabled={!editor.canEditSelectedRegister('hw')}
							onValueChange={(hw: string) => editor.updateSelectedRegister({ hw: hw as Access })}
						>
							<Select.Trigger
								class="h-8 w-24 bg-background text-base focus-visible:border-primary focus-visible:ring-0"
							>
								{editor.selectedRegister.hw}
							</Select.Trigger>
							<Select.Content>
								{#each accessOptions as access (access)}
									<Select.Item class="text-base" value={access} label={access} />
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
				</div>
			</div>
			<label class="block w-full space-y-1">
				<span class="text-base font-semibold uppercase tracking-normal text-muted-foreground"
					>Name</span
				>
				<input
					class="w-full rounded-md border border-input bg-background px-2 py-2 text-2xl font-semibold leading-8 tracking-normal text-foreground outline-none hover:border-primary/60 focus:border-primary"
					data-register-title-input={editor.selectedRegister.id}
					placeholder="New Register"
					value={editor.selectedRegister.title}
					disabled={!editor.canEditSelectedRegister('title')}
					onfocus={() => editor.beginGroupedDocumentEdit()}
					oninput={(event) => editor.updateSelectedRegister({ title: textInput(event) })}
					onblur={() => editor.endGroupedDocumentEdit()}
					aria-label="Register display name"
				/>
			</label>
			<label class="mt-2 block w-full space-y-1">
				<span class="text-base font-semibold uppercase tracking-normal text-muted-foreground"
					>ID</span
				>
				<span class="group/error relative block">
					<input
						class={`w-full rounded-md border bg-background px-2 py-1 pr-8 font-mono text-base text-foreground outline-none hover:border-primary/60 ${errorClass(
							registerIdErrors,
						)}`}
						data-register-name-input={editor.selectedRegister.id}
						placeholder="new_register"
						value={editor.selectedRegister.name}
						disabled={!editor.canEditSelectedRegister('name')}
						title={registerIdErrors.join(' ')}
						onfocus={() => editor.beginGroupedDocumentEdit()}
						oninput={(event) => editor.updateSelectedRegister({ name: textInput(event) })}
						onblur={() => editor.endGroupedDocumentEdit()}
						aria-label="Register identifier"
					/>
					{#if registerIdErrors.length}
						<span
							class="pointer-events-none absolute right-1 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full bg-destructive/10 text-base font-semibold text-destructive"
						>
							!
						</span>
						<span
							class="pointer-events-none absolute bottom-full left-0 z-20 mb-2 hidden w-max max-w-sm rounded-md border border-destructive/30 bg-popover px-2 py-1 text-base leading-5 text-destructive shadow-lg group-hover/error:block group-focus-within/error:block"
						>
							{registerIdErrors.join(' ')}
						</span>
					{/if}
				</span>
			</label>
			<label class="mt-3 block w-full space-y-1">
				<span class="text-base font-semibold uppercase tracking-normal text-muted-foreground"
					>Desc</span
				>
				<textarea
					class="min-h-16 w-full resize-none rounded-md border border-input bg-background px-2 py-1 text-base leading-6 text-foreground outline-none hover:border-primary/60 focus:border-primary"
					placeholder="Describe the register."
					value={editor.selectedRegister.desc}
					disabled={!editor.canEditSelectedRegister('desc')}
					onfocus={() => editor.beginGroupedDocumentEdit()}
					oninput={(event) => editor.updateSelectedRegister({ desc: textInput(event) })}
					onblur={() => editor.endGroupedDocumentEdit()}
					aria-label="Register description"></textarea>
			</label>
		</div>
	</div>
</div>
