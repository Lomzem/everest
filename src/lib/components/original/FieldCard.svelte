<script lang="ts">
	import { useDrafts } from '$lib/ui/drafts';
	const drafts = useDrafts();
	import { ChevronDown, ChevronRight, Trash2, Check } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Popover from '$lib/components/ui/popover';
	import * as Command from '$lib/components/ui/command';
	import Control from './Control.svelte';
	import EnumEditor from './EnumEditor.svelte';
	import type { EditorSession } from '$lib/editor/session.svelte';
	import type { RdlNode } from '$lib/rdl/types';
	import type { Workspace } from '$lib/ui/workspace.svelte';
	import { title, description, updateTitle, flushNode } from '$lib/ui/original';
	import { scopedDefinition } from '$lib/ui/values';
	let {
		session,
		field,
		workspace,
		index
	}: { session: EditorSession; field: RdlNode; workspace: Workspace; index: number } = $props();
	let numericHeader = $state(false),
		resetOpen = $state(false);
	let definition = $derived(
		scopedDefinition(
			session.compilation.enums,
			String(field.properties.encode?.value ?? ''),
			field.bodyRange.start
		)
	);
	let reset = $derived(
		typeof field.properties.reset?.value === 'bigint' ? field.properties.reset.value : 0n
	);
	let chosen = $derived(definition?.members.find((m) => m.value === reset));
	let expanded = $derived(workspace.expandedFields.includes(field.id));
	const access = ['RW', 'WR', 'R', 'W', 'RW1', 'W1', 'NA'];
	const property = (name: string, value: string) =>
		session.edit({ type: 'set-property', nodeId: field.id, property: name, value });
</script>

<article
	data-field-card={field.id}
	class="@container overflow-hidden rounded-lg bg-card text-card-foreground ring-1 ring-border/60"
>
	<div class="flex items-center gap-2 border-b border-border/60 pr-3">
		<div
			class="w-1 shrink-0 self-stretch"
			style:background={`var(--chart-${(index % 5) + 1})`}
		></div>
		<div
			class="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-2 text-sm @max-[700px]:grid-cols-1 @max-[700px]:gap-2"
		>
			<button
				class="grid min-w-0 grid-cols-[20px_80px_minmax(0,1fr)] items-center gap-4 text-left"
				aria-expanded={expanded}
				onclick={() => workspace.toggleField(field.id)}
				>{#if expanded}<ChevronDown size={14} />{:else}<ChevronRight size={14} />{/if}<span
					class="truncate font-mono text-primary">[{field.msb}:{field.lsb}]</span
				><span class="min-w-0"
					><span class="block truncate font-semibold">{title(field)}</span><span
						class="block truncate font-mono text-xs text-muted-foreground">{field.name}</span
					></span
				></button
			><span class="grid grid-cols-[176px_86px_86px] gap-2 text-xs"
				><button
					class="h-8 truncate rounded-md border border-input bg-input/20 px-2 text-center text-muted-foreground"
					disabled={!definition}
					onclick={() => (numericHeader = !numericHeader)}
					>Reset: <span class="font-mono"
						>{!numericHeader && chosen ? chosen.name : workspace.format(reset)}</span
					></button
				><span
					class="flex h-8 items-center justify-center rounded-md border border-input bg-input/20 px-2"
					>SW: {String(field.properties.sw?.value ?? 'rw').toUpperCase()}</span
				><span
					class="flex h-8 items-center justify-center rounded-md border border-input bg-input/20 px-2"
					>HW: {String(field.properties.hw?.value ?? 'rw').toUpperCase()}</span
				></span
			>
		</div>
		<Button
			variant="ghost"
			size="icon-lg"
			aria-label={`Delete field ${field.name}`}
			disabled={!field.editable}
			onclick={async () => {
				const current = await flushNode(drafts, session, field);
				if (current) await session.edit({ type: 'delete-component', nodeId: current.id });
			}}><Trash2 size={14} /></Button
		>
	</div>
	{#if expanded}<div class="bg-muted/35 px-6 py-4 text-foreground max-[900px]:px-3">
			<div class="space-y-3">
				<div
					class="grid grid-cols-[minmax(120px,1fr)_minmax(120px,1fr)_80px_80px_minmax(200px,2fr)_96px_96px] items-end gap-3 @max-[960px]:grid-cols-2"
				>
					<Control
						label="Name"
						ariaLabel="Field display name"
						value={title(field)}
						commit={(value) => updateTitle(session, workspace, field, value)}
						disabled={!field.editable}
					/><Control
						label="ID"
						ariaLabel="Field identifier"
						value={field.name}
						mono
						commit={async (name) => {
							const oldId = field.id,
								parentId = field.parentId;
							const ok = await session.edit({ type: 'rename', nodeId: oldId, name });
							if (ok) workspace.retarget(oldId, `${parentId}.${name}`);
							return ok;
						}}
						disabled={!field.editable}
					/><Control
						label="MSB"
						value={String(field.msb ?? 0)}
						type="number"
						mono
						commit={(value) =>
							session.edit({
								type: 'set-bits',
								nodeId: field.id,
								msb: Number(value),
								lsb: field.lsb ?? 0
							})}
						disabled={!field.editable}
					/><Control
						label="LSB"
						value={String(field.lsb ?? 0)}
						type="number"
						mono
						commit={(value) =>
							session.edit({
								type: 'set-bits',
								nodeId: field.id,
								msb: field.msb ?? 0,
								lsb: Number(value)
							})}
						disabled={!field.editable}
					/>
					<div class="min-w-0 space-y-1 @max-[960px]:col-span-2">
						{#if definition}<span class="text-xs font-medium">Reset</span><Popover.Root
								bind:open={resetOpen}
								><Popover.Trigger
									>{#snippet child({ props })}<Button
											{...props}
											variant="outline"
											class="h-10 w-full justify-between bg-input/20"
											aria-label="Reset"
											disabled={!field.editable}
											><span>{chosen?.name ?? 'Numeric reset'}</span><span
												class="font-mono text-xs text-muted-foreground"
												>{workspace.format(reset)}</span
											><ChevronDown size={14} /></Button
										>{/snippet}</Popover.Trigger
								><Popover.Content class="w-[380px] p-2" align="start"
									><Command.Root
										><Command.Input placeholder="Search encodings..." /><Command.List
											><Command.Empty>No encoding found.</Command.Empty><Command.Group
												heading="Encodings"
												>{#each definition.members as member (member.name)}<Command.Item
														value={member.name}
														onclick={async () => {
															const current = await flushNode(drafts, session, field);
															if (!current) return;
															if (
																await session.edit({
																	type: 'set-property',
																	nodeId: current.id,
																	property: 'reset',
																	value: `${definition.name}::${member.name}`
																})
															)
																resetOpen = false;
														}}
														><Check
															class={['size-4', member.value !== reset && 'opacity-0']}
														/><span class="flex-1">{member.name}</span><span
															class="font-mono text-xs">{workspace.format(member.value)}</span
														></Command.Item
													>{/each}</Command.Group
											></Command.List
										></Command.Root
									></Popover.Content
								></Popover.Root
							>{:else}<Control
								label="Reset"
								value={workspace.format(reset, false)}
								prefix={workspace.base === 16 ? '0x' : workspace.base === 2 ? '0b' : ''}
								mono
								commit={(value) =>
									property(
										'reset',
										(workspace.base === 16
											? '0x'
											: workspace.base === 2
												? `${field.width ?? 1}'b`
												: '') + value
									)}
								disabled={!field.editable}
							/>{/if}
					</div>
					<Control
						label="SW"
						value={String(field.properties.sw?.value ?? 'rw').toUpperCase()}
						options={access}
						commit={(value) => property('sw', value.toLowerCase())}
						disabled={!field.editable}
					/><Control
						label="HW"
						value={String(field.properties.hw?.value ?? 'rw').toUpperCase()}
						options={access}
						commit={(value) => property('hw', value.toLowerCase())}
						disabled={!field.editable}
					/>
				</div>
				<Control
					label="Desc"
					ariaLabel="Field description"
					multiline
					value={description(field)}
					placeholder="Describe the field behavior."
					commit={(value) => property('desc', JSON.stringify(value))}
					disabled={!field.editable}
				/><EnumEditor {session} {field} {workspace} {definition} />
			</div>
		</div>{/if}
</article>
