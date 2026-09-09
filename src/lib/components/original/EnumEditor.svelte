<script lang="ts">
	import { useDrafts } from '$lib/ui/drafts';
	const drafts = useDrafts();
	import { tick } from 'svelte';
	import { flushNode } from '$lib/ui/original';
	import { scopedDefinition } from '$lib/ui/values';
	import { Braces, Plus, Trash2 } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import Control from './Control.svelte';
	import type { EditorSession } from '$lib/editor/session.svelte';
	import type { RdlNode, EnumDefinition, EnumInput } from '$lib/rdl/types';
	import type { Workspace } from '$lib/ui/workspace.svelte';
	let {
		session,
		field,
		workspace,
		definition
	}: { session: EditorSession; field: RdlNode; workspace: Workspace; definition?: EnumDefinition } =
		$props();
	function members() {
		return (
			definition?.members.map((m) => ({
				name: m.name,
				value: String(m.value),
				description: m.description
			})) ?? []
		);
	}
	const apply = (next: EnumInput, resetMember?: string) =>
		session.edit({
			type: 'bind-enum',
			nodeId: field.id,
			previousName: definition?.name,
			previousStart: definition?.range.start,
			definition: next,
			resetMember
		});
	async function add() {
		const current = await flushNode(drafts, session, field);
		if (!current) return false;
		const currentDefinition = scopedDefinition(
			session.compilation.enums,
			String(current.properties.encode?.value ?? ''),
			current.bodyRange.start
		);

		const first = !currentDefinition?.members.length;
		const next =
			currentDefinition?.members.map((m) => ({
				name: m.name,
				value: String(m.value),
				description: m.description
			})) ?? [];
		let value = 0n;
		while (next.some((m) => BigInt(m.value) === value)) value++;
		let name = `VALUE_${value}`,
			suffix = 2;
		while (next.some((m) => m.name === name)) name = `VALUE_${value}_${suffix++}`;
		next.push({ name, value: String(value), description: undefined });
		const ok = await session.edit({
			type: 'bind-enum',
			nodeId: current.id,
			previousName: currentDefinition?.name,
			previousStart: currentDefinition?.range.start,
			definition: { name: currentDefinition?.name ?? `${current.name}_e`, members: next },
			resetMember: first ? name : undefined
		});
		if (ok) {
			await tick();
			const selector = first
				? '[aria-label="Enum name"]'
				: `[data-enum-value-row="${CSS.escape(name)}"] input`;
			document
				.querySelector<HTMLInputElement>(
					`[data-enum-editor="${CSS.escape(current.id)}"] ${selector}`
				)
				?.select();
		}
		return ok;
	}
	async function remove(index: number) {
		const current = await flushNode(drafts, session, field);
		if (!current) return;
		const next = scopedDefinition(
			session.compilation.enums,
			String(current.properties.encode?.value ?? ''),
			current.bodyRange.start
		);
		if (!next) return;
		return session.edit({
			type: 'bind-enum',
			nodeId: current.id,
			previousName: next.name,
			previousStart: next.range.start,
			definition: {
				name: next.name,
				members: next.members
					.filter((_, i) => i !== index)
					.map((m) => ({ name: m.name, value: String(m.value), description: m.description }))
			}
		});
	}

	function update(index: number, key: 'name' | 'value' | 'description', value: string) {
		const next = members();
		next[index] = { ...next[index], [key]: value };
		return apply({ name: definition!.name, members: next });
	}
</script>

{#if definition}<div
		class="mt-3 rounded-lg bg-muted/50 p-3 ring-1 ring-border/70"
		data-enum-editor={field.id}
	>
		<div class="mb-3 grid grid-cols-[auto_1fr] items-center gap-2 text-sm">
			<Braces size={15} />
			<div class="flex items-center gap-2">
				<span class="font-semibold">Enum</span>
				<div class="min-w-0 flex-1">
					<Control
						disabled={!field.editable || !definition?.editable}
						ariaLabel="Enum name"
						value={definition.name}
						mono
						commit={(name) => apply({ name, members: members() })}
					/>
				</div>
			</div>
		</div>
		<div class="space-y-2">
			{#each definition.members as member, index (member.name)}<div
					class="grid grid-cols-[160px_160px_1fr_auto] gap-2 max-[1000px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem]"
					data-enum-value-row={member.name}
				>
					<Control
						disabled={!field.editable || !definition?.editable}
						ariaLabel={`Encoding ${index + 1} name`}
						value={member.name}
						commit={(value) => update(index, 'name', value)}
					/><Control
						disabled={!field.editable || !definition?.editable}
						ariaLabel={`Encoding ${index + 1} value`}
						value={workspace.format(member.value, false)}
						prefix={workspace.base === 16 ? '0x' : workspace.base === 2 ? '0b' : ''}
						mono
						commit={(value) =>
							update(
								index,
								'value',
								(workspace.base === 16
									? '0x'
									: workspace.base === 2
										? `${field.width ?? 1}'b`
										: '') + value
							)}
					/>
					<div class="max-[1000px]:col-span-2">
						<Control
							disabled={!field.editable || !definition?.editable}
							ariaLabel={`Encoding ${index + 1} description`}
							placeholder="Describe this encoding."
							value={member.description ?? ''}
							commit={(value) => update(index, 'description', value)}
						/>
					</div>
					<Button
						variant="ghost"
						size="icon-lg"
						aria-label={`Remove encoding ${member.name}`}
						disabled={!field.editable || !definition.editable}
						onclick={() => remove(index)}><Trash2 size={14} /></Button
					>
				</div>{/each}
		</div>
		<div class="mt-3 flex justify-center">
			<Button onclick={add} disabled={!field.editable || !definition.editable}
				><Plus size={14} />Add Encoding</Button
			>
		</div>
	</div>{:else}<Button variant="outline" onclick={add} disabled={!field.editable}
		><Braces size={15} />Add Enum</Button
	>{/if}
