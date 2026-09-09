<script lang="ts">
	import { untrack, tick } from 'svelte';
	import { useDrafts } from '$lib/ui/drafts';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import type { EditorSession } from '$lib/editor/session.svelte';
	import type { Workspace } from '$lib/ui/workspace.svelte';
	import { groups, address, title } from '$lib/ui/original';
	const drafts = useDrafts();
	let { session, workspace }: { session: EditorSession; workspace: Workspace } = $props();
	let name = $state(''),
		identifier = $state(''),
		addressText = $state('0x00'),
		widthText = $state('8'),
		group = $state(''),
		edited = $state(false),
		addressEdited = $state(false),
		attempted = $state(false);
	let nameInput = $state<HTMLInputElement | null>(null),
		opener: HTMLElement | undefined;
	const root = $derived(session.compilation.roots[0]);
	const registers = $derived(session.compilation.nodes.filter((n) => n.kind === 'reg'));
	const width = $derived(Number(widthText));
	const bytes = $derived(
		Number.isInteger(width) && width > 0 && width <= 65536 ? BigInt(Math.ceil(width / 8)) : 0n
	);
	const location = $derived.by(() => {
		try {
			return /^(?:0x)?[0-9a-f]+$/i.test(addressText.trim())
				? BigInt('0x' + addressText.trim().replace(/^0x/i, ''))
				: undefined;
		} catch {
			return undefined;
		}
	});
	const range = $derived(workspace.createRange);
	const capacity = $derived(range ? range.end - range.start + 1n : undefined);
	const identifierError = $derived(
		!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)
			? 'Enter a valid register ID.'
			: registers.some((n) => n.parentId === root?.id && n.name === identifier)
				? 'This register ID is already in use.'
				: ''
	);
	const placementError = $derived.by(() => {
		if (!bytes) return 'Enter a width from 1 to 65536 bits.';
		if (location === undefined) return 'Enter a hexadecimal address.';
		if (capacity !== undefined && bytes > capacity)
			return `${bytes} bytes are needed, but only ${capacity} bytes are available.`;
		if (range && (location < range.start || location + bytes - 1n > range.end))
			return `Valid addresses: ${address(range.start)}–${address(range.end - bytes + 1n)}.`;
		if (
			registers.some(
				(n) => location < (n.address ?? 0n) + (n.size ?? 1n) && location + bytes > (n.address ?? 0n)
			)
		)
			return 'This address overlaps another register.';
		return '';
	});
	const misaligned = $derived(location !== undefined && bytes > 0n && location % bytes !== 0n);
	function aligned(start: bigint, size: bigint) {
		return size ? ((start + size - 1n) / size) * size : start;
	}
	function close() {
		workspace.createParent = undefined;
		workspace.createRange = undefined;
		workspace.createAddress = undefined;
	}
	$effect(() => {
		const parent = workspace.createParent;
		if (parent !== undefined)
			untrack(() => {
				opener = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
				session.clearError();
				group = parent;
				name = '';
				identifier = '';
				edited = false;
				attempted = false;
				addressEdited = false;
				const end = registers.reduce((max, n) => {
					const end = (n.address ?? 0n) + (n.size ?? 1n);
					return end > max ? end : max;
				}, 0n);
				const start = workspace.createAddress ?? end;
				const preceding = registers
					.filter((n) => (n.address ?? 0n) < start)
					.sort((a, b) => ((a.address ?? 0n) > (b.address ?? 0n) ? -1 : 1))[0];
				const following = registers.find((n) => (n.address ?? 0n) >= start);
				let nextWidth = preceding?.width ?? following?.width ?? 8;
				if (
					workspace.createRange &&
					BigInt(Math.ceil(nextWidth / 8)) >
						workspace.createRange.end - workspace.createRange.start + 1n
				)
					nextWidth = 8;
				widthText = String(nextWidth);
				const alignedStart = aligned(start, BigInt(Math.ceil(nextWidth / 8)));
				addressText = address(
					!workspace.createRange ||
						alignedStart + BigInt(Math.ceil(nextWidth / 8)) - 1n <= workspace.createRange.end
						? alignedStart
						: start
				);
			});
	});
	function updateWidth(value: string) {
		widthText = value;
		if (!addressEdited && range && bytes) {
			const next = aligned(range.start, bytes);
			if (next + bytes - 1n <= range.end) addressText = address(next);
		}
	}
	async function create() {
		if (!(await drafts.flush())) return;
		attempted = true;
		if (
			identifierError ||
			placementError ||
			location === undefined ||
			session.busy ||
			!root?.editable
		)
			return;
		const createdId = `${root.id}.${identifier}`;
		if (
			await session.edit({
				type: 'add-register',
				parentId: root.id,
				name: identifier,
				title: name,
				address: '0x' + location.toString(16),
				width,
				groupPath: group
			})
		) {
			close();
			workspace.selectedGroup = undefined;
			session.select(createdId);
			workspace.createdNodeIds = [...workspace.createdNodeIds, createdId];
			workspace.expandedNodes = [
				...new Set([
					...workspace.expandedNodes,
					'',
					...group.split('/').map((_, i, parts) => parts.slice(0, i + 1).join('/'))
				])
			];
		}
	}
</script>

<Dialog.Root
	open={workspace.createParent !== undefined}
	onOpenChange={(open) => {
		if (!open) close();
	}}
	><Dialog.Content
		class="max-h-[calc(100dvh-2rem)] overflow-auto sm:max-w-lg"
		onOpenAutoFocus={(event) => {
			event.preventDefault();
			void tick().then(() => nameInput?.focus());
		}}
		onCloseAutoFocus={(event) => {
			event.preventDefault();
			opener?.focus();
		}}
	>
		<form
			class="grid min-w-0 gap-4"
			data-create-register-scroll
			onsubmit={(event) => {
				event.preventDefault();
				void create();
			}}
		>
			<Dialog.Header
				><Dialog.Title>Create Register</Dialog.Title><Dialog.Description
					class="text-sm text-foreground"
					>{#if range}<span class="font-mono"
							>{address(range.start)}–{address(range.end)} · {capacity}
							{capacity === 1n ? 'byte' : 'bytes'} available</span
						>{:else if !registers.length}Empty map · starting at <span class="font-mono">0x00</span
						>{:else}Next free address selected.{/if}</Dialog.Description
				></Dialog.Header
			>
			<label class="grid gap-1.5"
				><span class="font-medium">Name</span><Input
					bind:ref={nameInput}
					aria-label="Register display name"
					bind:value={name}
					oninput={(event) => {
						name = event.currentTarget.value;
						if (!edited)
							identifier = name
								.trim()
								.toLowerCase()
								.replace(/[^a-z0-9_]+/g, '_')
								.replace(/^([^a-z_])/, '_$1');
					}}
				/></label
			>
			<label class="grid gap-1.5"
				><span class="font-medium">ID</span><Input
					aria-label="ID, register identifier"
					bind:value={identifier}
					oninput={() => (edited = true)}
					aria-invalid={attempted && !!identifierError}
				/>{#if attempted && identifierError}<span role="alert" class="text-sm"
						>{identifierError}</span
					>{/if}</label
			>
			<div class="grid grid-cols-2 gap-4 max-[900px]:grid-cols-1">
				<label class="grid gap-1.5"
					><span class="font-medium">Address</span><Input
						aria-label="Register address"
						bind:value={addressText}
						oninput={() => (addressEdited = true)}
						aria-invalid={!!placementError}
					/></label
				><label class="grid gap-1.5"
					><span class="font-medium">Width</span><Input
						aria-label="Register width in bits"
						type="number"
						min="1"
						max="65536"
						step="1"
						value={widthText}
						oninput={(event) => updateWidth(event.currentTarget.value)}
						aria-invalid={!bytes || (capacity !== undefined && bytes > capacity)}
					/></label
				>
			</div>
			<div id="register-placement-guidance" class="min-w-0 space-y-1 text-sm">
				{#if placementError}<p role="alert">{placementError}</p>{:else if misaligned}<p>
						Warning: this address is not naturally aligned to {bytes} bytes.
					</p>{/if}
			</div>
			<div class="grid gap-1.5">
				<span class="font-medium">Group</span><Select.Root type="single" bind:value={group}
					><Select.Trigger class="w-full" aria-label="Group, destination group"
						>{group || `${root ? title(root) : 'addrmap'} (root)`}</Select.Trigger
					><Select.Content
						><Select.Item value="">{root ? title(root) : 'addrmap'} (root)</Select.Item
						>{#each groups(session.compilation, workspace.emptyGroups) as path (path)}<Select.Item
								value={path}>{path}</Select.Item
							>{/each}</Select.Content
					></Select.Root
				>
			</div>
			{#if session.error}<p role="alert" class="text-sm">{session.error}</p>{/if}
			<Dialog.Footer
				><Button type="button" variant="outline" size="lg" class="min-h-11 min-w-11" onclick={close}
					>Cancel</Button
				><Button
					type="submit"
					size="lg"
					class="min-h-11 min-w-11"
					disabled={session.busy || !root?.editable}
					>{session.busy ? 'Creating...' : 'Create Register'}</Button
				></Dialog.Footer
			>
		</form></Dialog.Content
	></Dialog.Root
>
