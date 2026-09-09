<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import PropertyValueEditor from './PropertyValueEditor.svelte';
	import { valueDefault } from '$lib/ui/values';
	import { Plus, Trash2, SlidersHorizontal, ListOrdered } from '@lucide/svelte';
	import type { EditorSession } from '$lib/editor/session.svelte';
	import type { PropertyDefinition, EnumDefinition } from '$lib/rdl/types';
	let { session }: { session: EditorSession } = $props();
	let open = $state(false),
		tab = $state<'properties' | 'enums'>('properties');
	let name = $state(''),
		type = $state('string'),
		defaultText = $state(''),
		constraint = $state('');
	let components = $state<string[]>(['field']);
	let previousName = $state<string | undefined>();
	let previousStart = $state<number | undefined>();
	let members = $state([{ name: '', value: '0', description: '' }]);
	let confirmingDelete = $state(false);
	let editing = $state(false);
	let hasDefault = $state(false);
	let arrayType = $state(false);
	const availableTypes = $derived([
		...new Set([
			'string',
			'boolean',
			'number',
			'longint unsigned',
			'bit',
			'ref',
			'addrmap',
			'regfile',
			'reg',
			'field',
			'mem',
			...session.compilation.enums
				.filter((e) => !e.scopeRange || e.scopeRange.start === 0)
				.map((e) => e.name),
			...(session.compilation.structs ?? [])
				.filter((s) => !s.scopeRange || s.scopeRange.start === 0)
				.map((s) => s.name)
		])
	]);
	const selectedType = $derived(type + (arrayType ? '[]' : ''));
	function resetDefault() {
		defaultText = valueDefault(selectedType, session.compilation);
		constraint = '';
	}
	function property(item?: PropertyDefinition) {
		tab = 'properties';
		name = item?.name ?? '';
		type = (item?.type ?? 'string').replace(/\[\]$/, '');
		arrayType = item?.type.endsWith('[]') ?? false;
		hasDefault = item?.defaultText !== undefined;
		defaultText = item?.defaultText ?? '';
		constraint = item?.constraint ?? '';
		components = [...(item?.components ?? ['field'])];
		previousName = item?.name;
		confirmingDelete = false;
		editing = true;
	}
	function enumeration(item?: EnumDefinition) {
		previousStart = item?.range.start;
		tab = 'enums';
		name = item?.name ?? '';
		previousName = item?.name;
		members = item?.members.map((m) => ({
			name: m.name,
			value: String(m.value),
			description: m.description ?? ''
		})) ?? [{ name: '', value: '0', description: '' }];
		confirmingDelete = false;
		editing = true;
	}
	async function removeDefinition() {
		if (!previousName) return;
		if (
			await session.edit(
				tab === 'properties'
					? { type: 'delete-property-definition', name: previousName }
					: { type: 'delete-enum', name: previousName, start: previousStart }
			)
		)
			editing = false;
	}
	async function save() {
		const ok =
			tab === 'properties'
				? await session.edit({
						type: 'upsert-property-definition',
						previousName,
						definition: {
							name,
							type: selectedType,
							components,
							defaultText: hasDefault ? defaultText : undefined,
							constraint: constraint || undefined
						}
					})
				: await session.edit({
						type: 'upsert-enum',
						previousName,
						previousStart,
						definition: { name, members }
					});
		if (ok) editing = false;
	}
</script>

<Button
	variant="outline"
	size="sm"
	onclick={() => {
		open = true;
		editing = false;
	}}
	disabled={!session.compilation.valid}><SlidersHorizontal />Definitions</Button
>
<Dialog.Root bind:open
	><Dialog.Content class="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
		><Dialog.Header
			><Dialog.Title>Document definitions</Dialog.Title><Dialog.Description class="sr-only"
				>Properties and enums.</Dialog.Description
			></Dialog.Header
		>
		<div class="flex gap-2 border-b pb-4">
			<Button
				variant={tab === 'properties' ? 'secondary' : 'ghost'}
				size="sm"
				onclick={() => {
					tab = 'properties';
					editing = false;
				}}
				><SlidersHorizontal />Properties
				<span class="text-xs">{session.compilation.properties.length}</span></Button
			><Button
				variant={tab === 'enums' ? 'secondary' : 'ghost'}
				size="sm"
				onclick={() => {
					tab = 'enums';
					editing = false;
				}}
				><ListOrdered />Enums
				<span class="text-xs">{session.compilation.enums.length}</span></Button
			>
		</div>
		{#if editing}<form
				class="space-y-5"
				onsubmit={(event) => {
					event.preventDefault();
					void save();
				}}
			>
				<label class="grid gap-2 text-sm font-medium"
					>Name<Input
						bind:value={name}
						required
						pattern="[a-zA-Z_][a-zA-Z0-9_]*"
						placeholder={tab === 'properties' ? 'display_group' : 'operation_mode'}
					/></label
				>
				{#if tab === 'properties'}<div class="grid gap-4 sm:grid-cols-2">
						<label class="grid gap-2 text-sm font-medium"
							>Type<select
								bind:value={type}
								onchange={(event) => {
									type = event.currentTarget.value;
									resetDefault();
								}}
								class="h-9 rounded-md border border-input bg-background px-3 focus-visible:ring-2 focus-visible:ring-ring"
								>{#each availableTypes as option (option)}<option>{option}</option>{/each}</select
							></label
						>
						<label class="flex items-center gap-2 text-sm"
							><input
								type="checkbox"
								class="accent-primary"
								bind:checked={arrayType}
								onchange={(event) => {
									arrayType = event.currentTarget.checked;
									resetDefault();
								}}
							/>Array of values</label
						>
					</div>
					<label class="flex items-center gap-2 text-sm"
						><input
							type="checkbox"
							class="accent-primary"
							bind:checked={hasDefault}
							onchange={(event) => {
								hasDefault = event.currentTarget.checked;
								if (hasDefault && !defaultText) resetDefault();
							}}
						/>Set a default value</label
					>
					{#if hasDefault}<PropertyValueEditor
							label="Default value"
							type={selectedType}
							bind:text={defaultText}
							compilation={session.compilation}
						/>{/if}
					<fieldset>
						<legend class="mb-3 text-sm font-medium">Allowed components</legend>
						<div class="flex flex-wrap gap-x-5 gap-y-3">
							{#each ['addrmap', 'regfile', 'reg', 'field', 'mem', 'signal', 'constraint', 'all'] as kind (kind)}<label
									class="flex items-center gap-2 text-sm"
									><input
										type="checkbox"
										class="accent-primary"
										value={kind}
										bind:group={components}
									/>{kind}</label
								>{/each}
						</div>
					</fieldset>
					<label class="grid gap-2 text-sm font-medium"
						>Constraint<select
							bind:value={constraint}
							disabled={type !== 'bit' || arrayType}
							class="h-9 rounded-md border bg-background px-3"
							><option value="">None</option><option value="componentwidth">Component width</option
							></select
						></label
					>
				{:else}<div class="space-y-3">
						<div
							class="grid grid-cols-[1fr_1fr_2rem] gap-3 text-xs font-semibold text-muted-foreground"
						>
							<span>MEMBER</span><span>VALUE</span>
						</div>
						{#each members as member, index (index)}<div
								class="grid grid-cols-[1fr_1fr_2rem] gap-3"
							>
								<Input
									aria-label={`Member ${index + 1} name`}
									bind:value={member.name}
									required
									placeholder="idle"
								/><Input
									aria-label={`Member ${index + 1} value`}
									bind:value={member.value}
									required
								/><Button
									type="button"
									variant="ghost"
									size="icon-sm"
									disabled={members.length === 1}
									onclick={() => (members = members.filter((_, i) => i !== index))}
									aria-label={`Remove member ${index + 1}`}><Trash2 /></Button
								>
								<label class="col-span-3 grid gap-2 text-xs text-muted-foreground"
									>Member description<Input
										aria-label={`Member ${index + 1} description`}
										bind:value={member.description}
									/></label
								>
							</div>{/each}<Button
							type="button"
							variant="outline"
							size="sm"
							onclick={() =>
								(members = [
									...members,
									{ name: '', value: String(members.length), description: '' }
								])}><Plus />Add member</Button
						>
					</div>{/if}
				{#if session.error}<p role="alert" class="text-sm text-destructive">
						{session.error}
					</p>{/if}<Dialog.Footer
					>{#if previousName}{#if confirmingDelete}<Button
								type="button"
								variant="destructive"
								disabled={session.busy}
								onclick={removeDefinition}>Confirm delete</Button
							><Button type="button" variant="ghost" onclick={() => (confirmingDelete = false)}
								>Keep definition</Button
							>{:else}<Button
								type="button"
								variant="outline"
								class="sm:mr-auto"
								onclick={() => (confirmingDelete = true)}><Trash2 />Delete definition</Button
							>{/if}{/if}<Button type="button" variant="ghost" onclick={() => (editing = false)}
						>Cancel</Button
					><Button type="submit" disabled={session.busy}>Apply definition</Button></Dialog.Footer
				>
			</form>
		{:else}<div class="space-y-3">
				{#if tab === 'properties'}{#each session.compilation.properties as item (item.name)}<div
							class="flex items-center justify-between rounded-lg border p-4"
						>
							<div>
								<p class="font-mono text-sm font-medium">{item.name}</p>
								<p class="mt-1 text-xs text-muted-foreground">
									{item.type} · {item.components.join(', ')}
								</p>
							</div>
							<Button
								variant="outline"
								size="sm"
								disabled={!item.editable}
								onclick={() => property(item)}>Edit</Button
							>
						</div>{:else}<p class="py-8 text-center text-sm text-muted-foreground">
							No properties.
						</p>{/each}<Button variant="outline" onclick={() => property()}
						><Plus />Add property declaration</Button
					>
				{:else}{#each session.compilation.enums as item (item.range.start)}<div
							class="flex items-center justify-between rounded-lg border p-4"
						>
							<div>
								<p class="font-mono text-sm font-medium">{item.name}</p>
								<p class="mt-1 text-xs text-muted-foreground">{item.members.length} members</p>
							</div>
							<Button
								variant="outline"
								size="sm"
								disabled={!item.editable}
								onclick={() => enumeration(item)}>Edit</Button
							>
						</div>{:else}<p class="py-8 text-center text-sm text-muted-foreground">
							No enums.
						</p>{/each}<Button variant="outline" onclick={() => enumeration()}
						><Plus />Add enum</Button
					>{/if}
			</div>{/if}
	</Dialog.Content></Dialog.Root
>
