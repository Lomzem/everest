<script lang="ts">
	import { useDrafts } from '$lib/ui/drafts';
	const drafts = useDrafts();
	import { MoveRight, Plus } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import Control from './Control.svelte';
	import FieldCard from './FieldCard.svelte';
	import Breadcrumbs from './Breadcrumbs.svelte';
	import type { EditorSession } from '$lib/editor/session.svelte';
	import type { RdlNode } from '$lib/rdl/types';
	import type { Workspace } from '$lib/ui/workspace.svelte';
	import { title, description, updateTitle, flushNode } from '$lib/ui/original';
	import { tick } from 'svelte';
	let {
		session,
		node,
		workspace
	}: { session: EditorSession; node: RdlNode; workspace: Workspace } = $props();
	let fields = $derived(node.children.filter((n) => n.kind === 'field'));
	let width = $derived(node.width ?? 32);
	const access = ['RW', 'WR', 'R', 'W', 'RW1', 'W1', 'NA'];
	let runs = $derived.by(() => {
		const result: { start: number; end: number; field?: RdlNode }[] = [];
		for (let bit = width - 1; bit >= 0; bit--) {
			const field = fields.find((f) => (f.lsb ?? 0) <= bit && (f.msb ?? 0) >= bit);
			const last = result.at(-1);
			if (last && last.field === field) last.end = bit;
			else result.push({ start: bit, end: bit, field });
		}
		return result;
	});
	let axisBits = $derived.by(() => {
		const step = width > 16 ? 8 : width > 8 ? 4 : 1;
		const bits: number[] = [];
		for (let bit = width - 1; bit >= 0; bit--)
			if (bit % step === 0 || bit === width - 1) bits.push(bit);
		return bits;
	});
	async function navigate(field: RdlNode) {
		if (!workspace.expandedFields.includes(field.id))
			workspace.expandedFields = [...workspace.expandedFields, field.id];
		await tick();
		document
			.querySelector(`[data-field-card="${CSS.escape(field.id)}"]`)
			?.scrollIntoView({ block: 'center', behavior: 'smooth' });
	}
	async function add() {
		const current = await flushNode(drafts, session, node);
		if (!current) return;
		let n = fields.length,
			name = `new_field_${n}`;
		while (fields.some((f) => f.name === name)) name = `new_field_${++n}`;
		if (await session.edit({ type: 'add-component', parentId: current.id, kind: 'field', name })) {
			const field = session.compilation.nodes.find((n) => n.id === `${current.id}.${name}`);
			if (field) {
				workspace.createdNodeIds = [...workspace.createdNodeIds, field.id];
				await navigate(field);
				document
					.querySelector<HTMLInputElement>(
						`[data-field-card="${CSS.escape(field.id)}"] [aria-label="Field display name"]`
					)
					?.select();
			}
		}
	}
</script>

<div class="border-b px-6 py-5 max-[900px]:px-3" data-register-editor={node.id}>
	<div class="mb-4 flex items-center justify-between gap-4">
		<Breadcrumbs {session} {workspace} {node} />
		<span
			class="shrink-0 rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground tabular-nums"
			>{width} bits</span
		>
	</div>
	<div class="flex flex-wrap items-end gap-x-6 gap-y-3">
		<div class="flex items-end gap-2">
			<div class="w-24">
				<Control
					disabled={!node.editable}
					label="Address"
					value={(node.address ?? 0n).toString(16).toUpperCase().padStart(2, '0')}
					prefix="0x"
					mono
					commit={(value) =>
						session.edit({ type: 'set-address', nodeId: node.id, value: '0x' + value })}
				/>
			</div>
			<Button
				variant="outline"
				disabled={!node.editable}
				aria-label="Move register"
				title="Move to another folder"
				onclick={async () => {
					const current = await flushNode(drafts, session, node);
					if (current) workspace.moveNode = current.id;
				}}><MoveRight size={14} />Move</Button
			>
		</div>
		<div class="ml-auto flex items-end gap-3">
			<div class="w-24">
				<Control
					disabled={!node.editable}
					label="Default SW"
					value={(node.defaultAccess?.sw ?? 'rw').toUpperCase()}
					options={access}
					commit={(value) =>
						session.edit({ type: 'set-register-access', nodeId: node.id, sw: value.toLowerCase() })}
				/>
			</div>
			<div class="w-24">
				<Control
					disabled={!node.editable}
					label="Default HW"
					value={(node.defaultAccess?.hw ?? 'rw').toUpperCase()}
					options={access}
					commit={(value) =>
						session.edit({ type: 'set-register-access', nodeId: node.id, hw: value.toLowerCase() })}
				/>
			</div>
		</div>
	</div>
	<div class="mt-4 grid gap-x-4 gap-y-3 sm:grid-cols-2">
		<Control
			disabled={!node.editable}
			label="Name"
			ariaLabel="Register display name"
			value={title(node)}
			commit={(value) => updateTitle(session, workspace, node, value)}
		/>
		<Control
			disabled={!node.editable}
			label="ID"
			ariaLabel="Register identifier"
			value={node.name}
			mono
			commit={async (name) => {
				const oldId = node.id,
					parentId = node.parentId;
				const ok = await session.edit({ type: 'rename', nodeId: oldId, name });
				if (ok) workspace.retarget(oldId, parentId ? `${parentId}.${name}` : name);
				return ok;
			}}
		/>
	</div>
	<div class="mt-3">
		<Control
			disabled={!node.editable}
			label="Desc"
			ariaLabel="Register description"
			value={description(node)}
			multiline
			placeholder="Describe the register."
			commit={(value) =>
				session.edit({
					type: 'set-property',
					nodeId: node.id,
					property: 'desc',
					value: JSON.stringify(value)
				})}
		/>
	</div>
</div>
<section class="px-6 py-5 max-[900px]:px-3">
	<div class="mb-3 flex items-baseline justify-between gap-3">
		<h2 class="text-sm font-semibold">Bit Layout</h2>
		<span class="font-mono text-[11px] text-muted-foreground tabular-nums">
			bits {width - 1}:0
		</span>
	</div>
	<div class="relative h-5 font-mono text-[11px] text-muted-foreground" data-bit-axis>
		{#each axisBits as bit (bit)}<span
				class="absolute top-0 -translate-x-1/2 tabular-nums"
				style:left={`${((width - 1 - bit + 0.5) / width) * 100}%`}>{bit}</span
			>{/each}
	</div>
	<div
		class="grid h-11 overflow-hidden rounded-md border bg-muted/20"
		style:grid-template-columns={`repeat(${width},minmax(0,1fr))`}
	>
		{#each runs as run (run.start)}
			{@const span = run.start - run.end + 1}
			{#if run.field}<button
					class="flex min-w-0 items-center justify-center gap-1 overflow-hidden border-r border-border/50 px-1 text-xs transition-[filter] last:border-r-0 hover:brightness-125 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
					style:grid-column={`span ${span}`}
					style:background={`color-mix(in oklch,var(--chart-${(fields.indexOf(run.field) % 5) + 1}) 18%, transparent)`}
					data-bit-field={run.field.id}
					title={`${title(run.field)} [${run.start}:${run.end}]`}
					onclick={() => navigate(run.field!)}
					>{#if span >= 2}<span class="truncate font-medium">{title(run.field)}</span
						>{/if}{#if span >= 5}<span class="shrink-0 font-mono text-[10px] opacity-70"
							>[{run.start === run.end ? run.start : `${run.start}:${run.end}`}]</span
						>{/if}</button
				>{:else}<div
					class="flex min-w-0 items-center justify-center overflow-hidden border-r border-border/40 text-[11px] text-muted-foreground last:border-r-0"
					style:grid-column={`span ${span}`}
				>
					{#if workspace.showReservedGaps && span >= 3}<span class="truncate px-1"
							>Reserved [{run.start === run.end ? run.start : `${run.start}:${run.end}`}]</span
						>{:else if workspace.showReservedGaps && span === 2}<span class="text-[10px]">··</span
						>{/if}
				</div>{/if}
		{/each}
	</div>
</section>
<section class="px-6 pb-8 max-[900px]:px-3">
	<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
		<h2 class="flex items-baseline gap-2 text-sm font-semibold">
			Fields<span class="font-mono text-[11px] font-normal text-muted-foreground tabular-nums"
				>{fields.length}</span
			>
		</h2>
		<div class="flex flex-wrap items-center justify-end gap-2">
			<ToggleGroup.Root
				type="single"
				value={String(workspace.base)}
				variant="outline"
				onValueChange={(value) => {
					if (value) workspace.base = Number(value) as 16 | 10 | 2;
				}}
				>{#each [{ base: 16, label: 'HEX' }, { base: 10, label: 'DEC' }, { base: 2, label: 'BIN' }] as mode (mode.base)}<ToggleGroup.Item
						class="data-[state=on]:border-primary data-[state=on]:ring-1 data-[state=on]:ring-primary"
						value={String(mode.base)}>{mode.label}</ToggleGroup.Item
					>{/each}</ToggleGroup.Root
			><Button
				variant="outline"
				disabled={!fields.length || fields.every((f) => workspace.expandedFields.includes(f.id))}
				onclick={() => (workspace.expandedFields = fields.map((f) => f.id))}>Expand All</Button
			><Button
				variant="outline"
				disabled={!workspace.expandedFields.length}
				onclick={() => (workspace.expandedFields = [])}>Collapse All</Button
			><Button onclick={add} disabled={!node.editable}><Plus size={14} />Add Field</Button>
		</div>
	</div>
	<div class="space-y-3">
		{#each fields as field, index (field.id)}<FieldCard
				{session}
				{field}
				{workspace}
				{index}
			/>{:else}<div class="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
				No fields
			</div>{/each}
	</div>
</section>
