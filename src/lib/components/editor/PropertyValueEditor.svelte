<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Button } from '$lib/components/ui/button';
	import { Plus, X } from '@lucide/svelte';
	import type { Compilation } from '$lib/rdl/types';
	import { aggregateMembers, decodeText, valueDefault, scopedDefinition } from '$lib/ui/values';
	import PropertyValueEditor from './PropertyValueEditor.svelte';
	let {
		label,
		type,
		text = $bindable(''),
		compilation,
		disabled = false,
		options = [],
		oncommit,
		depth = 0,
		scopeOffset = 0
	}: {
		label: string;
		type: string;
		text?: string;
		compilation: Compilation;
		disabled?: boolean;
		options?: string[];
		oncommit?: () => void;
		depth?: number;
		scopeOffset?: number;
	} = $props();
	const selectClass =
		'h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';
	let isArray = $derived(type.endsWith('[]'));
	let elementType = $derived(type.replace(/\[\]$/, ''));
	let members = $derived(aggregateMembers(text));
	let enumDefinition = $derived(scopedDefinition(compilation.enums, type, scopeOffset));
	let referenceType = $derived(
		['ref', 'addrmap', 'regfile', 'reg', 'field', 'mem', 'signal'].includes(type)
	);
	let choices = $derived(
		options.length
			? options
			: type === 'boolean'
				? ['false', 'true']
				: enumDefinition
					? enumDefinition.members.map((member) => `${enumDefinition.name}::${member.name}`)
					: referenceType
						? compilation.nodes
								.filter((node) => type === 'ref' || node.kind === type)
								.map((node) => node.id)
						: []
	);
	let struct = $derived(scopedDefinition(compilation.structs ?? [], type, scopeOffset));
	function arrayChange(index: number, value: string) {
		const values = [...members];
		values[index] = value;
		text = `'{${values.join(', ')}}`;
	}
	function structValue(name: string, memberType: string) {
		const entry = members.find((value) => value.slice(0, value.indexOf(':')).trim() === name);
		return entry
			? entry.slice(entry.indexOf(':') + 1).trim()
			: valueDefault(memberType, compilation, scopeOffset);
	}
	function structChange(name: string, value: string) {
		const values =
			struct?.members.map(
				(member) =>
					`${member.name}: ${member.name === name ? value : structValue(member.name, member.type)}`
			) ?? [];
		text = `${type}'{${values.join(', ')}}`;
	}
</script>

{#if depth > 8}
	<p class="text-xs text-muted-foreground">Read-only</p>
{:else if isArray}
	<fieldset class="space-y-3 rounded-md border p-3" {disabled}>
		<legend class="px-1 text-sm font-medium">{label}</legend>
		{#each members as member, index (index)}
			<div class="flex items-start gap-2">
				<div class="min-w-0 flex-1">
					<PropertyValueEditor
						label={`Item ${index + 1}`}
						type={elementType}
						bind:text={() => member, (value) => arrayChange(index, value)}
						{compilation}
						{disabled}
						{oncommit}
						{scopeOffset}
						depth={depth + 1}
					/>
				</div>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					class="mt-6"
					aria-label={`Remove ${label} item ${index + 1}`}
					{disabled}
					onclick={() => {
						text = `'{${members.filter((_, i) => i !== index).join(', ')}}`;
						oncommit?.();
					}}><X /></Button
				>
			</div>
		{/each}
		<Button
			type="button"
			size="sm"
			variant="outline"
			{disabled}
			onclick={() => {
				text = `'{${[...members, valueDefault(elementType, compilation, scopeOffset)].join(', ')}}`;
			}}><Plus />Add item</Button
		>
	</fieldset>
{:else if struct}
	<fieldset class="space-y-3 rounded-md border p-3" {disabled}>
		<legend class="px-1 text-sm font-medium">{label}</legend>
		{#each struct.members as member (member.name)}<PropertyValueEditor
				label={member.name}
				type={member.type}
				bind:text={
					() => structValue(member.name, member.type), (value) => structChange(member.name, value)
				}
				{compilation}
				{disabled}
				{oncommit}
				{scopeOffset}
				depth={depth + 1}
			/>{/each}
	</fieldset>
{:else}
	<label class="flex min-w-0 flex-col gap-2 text-sm"
		><span class="font-medium">{label}</span>
		{#if type === 'string'}
			<Textarea
				aria-label={label}
				value={decodeText(text)}
				oninput={(event) => (text = JSON.stringify(event.currentTarget.value))}
				onblur={() => oncommit?.()}
				{disabled}
				rows={label === 'desc' ? 3 : 1}
			/>
		{:else if choices.length || referenceType || enumDefinition || type === 'boolean'}
			<select
				aria-label={label}
				class={selectClass}
				bind:value={text}
				onchange={(event) => {
					text = event.currentTarget.value;
					oncommit?.();
				}}
				{disabled}
				><option value="" disabled>Select a value</option
				>{#if text && !choices.includes(text)}<option value={text}>{text}</option
					>{/if}{#each choices as choice (choice)}<option value={choice}>{choice}</option
					>{/each}</select
			>
		{:else}
			<Input
				aria-label={label}
				bind:value={text}
				{disabled}
				onblur={() => oncommit?.()}
				onkeydown={(event) => {
					if (event.key === 'Enter') {
						event.preventDefault();
						oncommit?.();
					}
				}}
			/>
		{/if}
	</label>
{/if}
