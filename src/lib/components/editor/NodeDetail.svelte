<script lang="ts">
	import {
		Plus,
		Trash2,
		ChevronDown,
		ChevronRight,
		CircuitBoard,
		ArrowUpRight
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import * as Dialog from '$lib/components/ui/dialog';
	import type { EditorSession } from '$lib/editor/session.svelte';
	import type { Workspace } from '$lib/ui/workspace.svelte';
	import type { RdlNode, ComponentKind } from '$lib/rdl/types';
	import EditValue from './EditValue.svelte';
	import Properties from './Properties.svelte';
	import Definitions from './Definitions.svelte';
	let {
		session,
		node,
		workspace
	}: { session: EditorSession; node: RdlNode; workspace: Workspace } = $props();
	let expanded = $state<string | undefined>(),
		addOpen = $state(false),
		deleteTarget = $state<RdlNode | undefined>();
	let newName = $state(''),
		newKind = $state<ComponentKind>('reg');
	let fields = $derived(node.children.filter((n) => n.kind === 'field'));
	let width = $derived(node.width ?? 32);
	let bits = $derived(
		Array.from({ length: Math.min(width, 256) }, (_, i) => Math.min(width, 256) - 1 - i)
	);
	let parent = $derived(session.compilation.nodes.find((n) => n.id === node.parentId));
	function openAdd() {
		newName = '';
		newKind = node.kind === 'reg' ? 'field' : 'reg';
		addOpen = true;
	}
	async function add() {
		if (
			await session.edit({ type: 'add-component', parentId: node.id, kind: newKind, name: newName })
		)
			addOpen = false;
	}
</script>

<div class="mx-auto w-full max-w-6xl px-5 py-7 sm:px-9 sm:py-9">
	<div class="mb-6 flex flex-wrap items-center justify-between gap-3">
		<div class="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
			<span>{session.filename}</span>{#if parent}<ChevronRight class="size-3" /><button
					class="hover:text-foreground"
					onclick={() => session.select(parent.id)}>{parent.name}</button
				>{/if}<ChevronRight class="size-3" /><span class="truncate text-foreground"
				>{node.name}</span
			>
		</div>
		<Definitions {session} />
	</div>
	<div class="mb-7 flex flex-wrap items-start justify-between gap-4">
		<div>
			<div class="mb-2 flex items-center gap-3">
				<h1 class="text-3xl font-semibold tracking-tight break-all">{node.name}</h1>
				<Badge variant="secondary"
					>{node.kind === 'reg'
						? 'Register'
						: node.kind === 'addrmap'
							? 'Address map'
							: node.kind === 'regfile'
								? 'Register file'
								: node.kind}</Badge
				>
			</div>
		</div>
		<div class="flex gap-2">
			{#if node.kind !== 'field' && node.kind !== 'signal' && node.kind !== 'reg'}<Button
					variant="outline"
					size="sm"
					disabled={!node.editable}
					onclick={openAdd}><Plus />Add component</Button
				>{/if}{#if node.parentId}<Button
					variant="ghost"
					size="icon-sm"
					aria-label={`Delete ${node.name}`}
					disabled={!node.editable}
					onclick={() => (deleteTarget = node)}><Trash2 /></Button
				>{/if}
		</div>
	</div>
	<section class="mb-6 rounded-xl border bg-card p-5 sm:p-6" aria-label="Component details">
		<div class="grid gap-5 sm:grid-cols-3">
			<EditValue
				label="Instance name"
				value={node.name}
				disabled={!node.editable}
				commit={(name) => session.edit({ type: 'rename', nodeId: node.id, name })}
			/>{#if node.kind !== 'field' && node.kind !== 'signal'}<EditValue
					label="Address offset"
					value={workspace.format(node.offset ?? 0n)}
					disabled={!node.editable}
					commit={(value) => session.edit({ type: 'set-address', nodeId: node.id, value })}
				/>{:else if node.kind === 'field'}<EditValue
					label="High bit"
					value={String(node.msb ?? 0)}
					disabled={!node.editable}
					commit={(value) =>
						session.edit({
							type: 'set-bits',
							nodeId: node.id,
							msb: Number(value),
							lsb: node.lsb ?? 0
						})}
				/><EditValue
					label="Low bit"
					value={String(node.lsb ?? 0)}
					disabled={!node.editable}
					commit={(value) =>
						session.edit({
							type: 'set-bits',
							nodeId: node.id,
							msb: node.msb ?? 0,
							lsb: Number(value)
						})}
				/>{/if}{#if node.kind === 'reg'}<EditValue
					label="Register width"
					value={String(width)}
					disabled={!node.editable}
					commit={(value) =>
						session.edit({ type: 'set-property', nodeId: node.id, property: 'regwidth', value })}
				/>{/if}
		</div>
	</section>
	{#if node.kind === 'reg'}<section
			class="@container mb-6 rounded-xl border bg-card"
			aria-label="Register bit layout"
		>
			<div class="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
				<h2 class="flex items-center gap-2 text-sm font-semibold">
					<CircuitBoard class="size-4" />Bit layout
					<span class="font-normal text-muted-foreground">{width} bits</span>
				</h2>
				<div class="flex rounded-md border p-0.5" aria-label="Number format">
					{#each [{ base: 16 as const, label: 'HEX' }, { base: 10 as const, label: 'DEC' }, { base: 2 as const, label: 'BIN' }] as format (format.base)}<button
							class="rounded px-2.5 py-1 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-accent"
							class:bg-secondary={workspace.base === format.base}
							class:text-foreground={workspace.base === format.base}
							aria-pressed={workspace.base === format.base}
							onclick={() => (workspace.base = format.base)}>{format.label}</button
						>{/each}
				</div>
			</div>
			<div class="p-5 sm:p-6">
				<div
					class="grid grid-cols-[repeat(var(--small-columns),minmax(0,1fr))] gap-1 @min-[800px]:grid-cols-[repeat(var(--columns),minmax(0,1fr))]"
					style={`--small-columns:${Math.min(width, 16)};--columns:${Math.min(width, 32)}`}
				>
					{#each bits as bit (bit)}{@const field = fields.find(
							(f) => bit >= (f.lsb ?? 0) && bit <= (f.msb ?? 0)
						)}<button
							disabled={!field}
							onclick={() => (expanded = expanded === field?.id ? undefined : field?.id)}
							aria-label={field ? `${field.name}, bit ${bit}` : `Reserved bit ${bit}`}
							class="flex h-13 min-w-0 flex-col items-center justify-center gap-1 rounded border text-[10px] transition-colors enabled:hover:bg-accent disabled:border-dashed disabled:text-muted-foreground"
							class:bg-secondary={!!field}
							class:border-primary={!!field && field.id === expanded}
							class:bg-muted={!field}
							><span class="font-mono">{bit}</span><span
								class="h-1 w-2 rounded-full"
								class:bg-primary={!!field}
								class:bg-border={!field}
							></span></button
						>{/each}
				</div>
				{#if width > 256}<p class="mt-3 text-xs text-muted-foreground">
						First 256 bits shown. All fields are listed below.
					</p>{/if}
				<div class="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
					{#each fields as field (field.id)}<button
							class="flex items-center gap-2 hover:text-foreground"
							onclick={() => (expanded = expanded === field.id ? undefined : field.id)}
							><span class="size-2 rounded-sm bg-primary"></span>{field.name}<span
								class="font-mono opacity-70">[{field.msb}:{field.lsb}]</span
							></button
						>{/each}<span class="flex items-center gap-2"
						><span class="size-2 rounded-sm border border-dashed"></span>Reserved</span
					>
				</div>
			</div>
		</section>
		<section class="mb-6 overflow-hidden rounded-xl border bg-card" aria-label="Fields">
			<div class="flex items-center justify-between border-b px-5 py-4">
				<h2 class="text-sm font-semibold">
					Fields <span class="ml-2 text-muted-foreground">{fields.length}</span>
				</h2>
				<Button variant="ghost" size="sm" onclick={openAdd} disabled={!node.editable}
					><Plus />Add field</Button
				>
			</div>
			<div class="overflow-x-auto">
				<div class="min-w-[480px]">
					<div
						class="grid grid-cols-[2fr_1fr_1fr_1fr_2rem] gap-3 bg-muted/40 px-5 py-3 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
					>
						<span>Name</span><span>Bits</span><span>Access</span><span>Reset</span><span></span>
					</div>
					{#each fields as field (field.id)}<div class="border-t first:border-t-0">
							<button
								class="grid w-full grid-cols-[2fr_1fr_1fr_1fr_2rem] items-center gap-3 px-5 py-4 text-left text-sm transition-colors hover:bg-muted/50"
								class:bg-muted={expanded === field.id}
								onclick={() => (expanded = expanded === field.id ? undefined : field.id)}
								aria-expanded={expanded === field.id}
								><span class="truncate font-mono font-medium">{field.name}</span><span
									class="font-mono text-xs text-muted-foreground">[{field.msb}:{field.lsb}]</span
								><span class="text-xs">{field.properties.sw?.text ?? 'rw'}</span><span
									class="font-mono text-xs"
									>{typeof field.properties.reset?.value === 'bigint'
										? workspace.format(field.properties.reset.value)
										: (field.properties.reset?.text ?? '—')}</span
								><ChevronDown
									class={['size-4 transition-transform', expanded === field.id && 'rotate-180']}
								/></button
							>{#if expanded === field.id}<div class="space-y-5 border-t bg-muted/20 p-5">
									<div class="grid gap-4 sm:grid-cols-3">
										<EditValue
											label="Field name"
											value={field.name}
											disabled={!field.editable}
											commit={(name) => session.edit({ type: 'rename', nodeId: field.id, name })}
										/><EditValue
											label="High bit"
											value={String(field.msb)}
											disabled={!field.editable}
											commit={(value) =>
												session.edit({
													type: 'set-bits',
													nodeId: field.id,
													msb: Number(value),
													lsb: field.lsb ?? 0
												})}
										/><EditValue
											label="Low bit"
											value={String(field.lsb)}
											disabled={!field.editable}
											commit={(value) =>
												session.edit({
													type: 'set-bits',
													nodeId: field.id,
													msb: field.msb ?? 0,
													lsb: Number(value)
												})}
										/>
									</div>
									<Properties node={field} {session} />
									<div class="flex justify-end">
										<Button
											size="sm"
											variant="outline"
											disabled={!field.editable}
											onclick={() => (deleteTarget = field)}><Trash2 />Delete field</Button
										>
									</div>
								</div>{/if}
						</div>{:else}<p class="p-8 text-center text-sm text-muted-foreground">
							No fields
						</p>{/each}
				</div>
			</div>
		</section>
	{:else if node.children.length}<section class="mb-6 overflow-hidden rounded-xl border bg-card">
			<h2 class="border-b px-5 py-4 text-sm font-semibold">
				Components <span class="ml-2 text-muted-foreground">{node.children.length}</span>
			</h2>
			{#each node.children as child (child.id)}<button
					class="flex w-full items-center justify-between gap-4 border-b px-5 py-4 text-left last:border-0 hover:bg-muted/50"
					onclick={() => session.select(child.id)}
					><div class="flex items-center gap-3">
						<CircuitBoard class="size-4 text-primary" /><span class="font-mono text-sm"
							>{child.name}</span
						><Badge variant="outline">{child.kind}</Badge>
					</div>
					<div class="flex items-center gap-5">
						<span class="font-mono text-xs text-muted-foreground"
							>{workspace.format(child.offset)}</span
						><ArrowUpRight class="size-4" />
					</div></button
				>{/each}
		</section>{/if}
	<section class="rounded-xl border bg-card p-5 sm:p-6"><Properties {node} {session} /></section>
</div>
<Dialog.Root bind:open={addOpen}
	><Dialog.Content
		><Dialog.Header
			><Dialog.Title>Add {node.kind === 'reg' ? 'field' : 'component'}</Dialog.Title
			><Dialog.Description class="sr-only">Add a component to {node.name}.</Dialog.Description
			></Dialog.Header
		>
		<form
			class="space-y-5"
			onsubmit={(e) => {
				e.preventDefault();
				void add();
			}}
		>
			{#if node.kind !== 'reg'}<label class="grid gap-2 text-sm font-medium"
					>Component type<select
						class="h-9 rounded-md border bg-background px-3"
						bind:value={newKind}
						>{#each ['reg', 'regfile', 'addrmap', 'mem', 'signal'] as kind (kind)}<option
								value={kind}>{kind}</option
							>{/each}</select
					></label
				>{/if}<label class="grid gap-2 text-sm font-medium"
				>Instance name<Input
					bind:value={newName}
					required
					pattern="[a-zA-Z_][a-zA-Z0-9_]*"
					placeholder={node.kind === 'reg' ? 'enable' : 'control'}
				/></label
			>{#if session.error}<p role="alert" class="text-sm text-destructive">
					{session.error}
				</p>{/if}<Dialog.Footer
				><Button type="button" variant="ghost" onclick={() => (addOpen = false)}>Cancel</Button
				><Button type="submit">Add {newKind === 'field' ? 'field' : 'component'}</Button
				></Dialog.Footer
			>
		</form></Dialog.Content
	></Dialog.Root
>
<Dialog.Root
	open={!!deleteTarget}
	onOpenChange={(open) => {
		if (!open) deleteTarget = undefined;
	}}
	><Dialog.Content
		><Dialog.Header
			><Dialog.Title>Delete {deleteTarget?.name}?</Dialog.Title><Dialog.Description
				>This removes the component from the document. You can undo this change.</Dialog.Description
			></Dialog.Header
		><Dialog.Footer
			><Button variant="outline" onclick={() => (deleteTarget = undefined)}>Cancel</Button><Button
				variant="destructive"
				onclick={async () => {
					if (
						deleteTarget &&
						(await session.edit({ type: 'delete-component', nodeId: deleteTarget.id }))
					)
						deleteTarget = undefined;
				}}>Delete component</Button
			></Dialog.Footer
		></Dialog.Content
	></Dialog.Root
>
