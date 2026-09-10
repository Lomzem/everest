<script lang="ts">
	import { Contrast, Minus, Monitor, Moon, Plus, RotateCcw, Settings, Sun } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Switch } from '$lib/components/ui/switch';
	import type { Workspace } from '$lib/ui/workspace.svelte';
	let { workspace }: { workspace: Workspace } = $props();
	const themes = [
		{ value: 'light', label: 'Light', icon: Sun },
		{ value: 'dark', label: 'Dark', icon: Moon },
		{ value: 'system', label: 'System', icon: Monitor }
	] as const;
	function step(amount: number) {
		workspace.zoom = Math.max(70, Math.min(200, workspace.zoom + amount));
	}
</script>

<Button
	variant="ghost"
	class={['w-full text-xs', !workspace.leftCollapsed && 'justify-start']}
	aria-label="Settings"
	onclick={() => (workspace.settingsOpen = true)}
	><Settings size={16} />{#if !workspace.leftCollapsed}Settings{/if}</Button
>
<Dialog.Root bind:open={workspace.settingsOpen}
	><Dialog.Content class="sm:max-w-lg"
		><Dialog.Header
			><Dialog.Title>Settings</Dialog.Title><Dialog.Description
				>Adjust how Everest looks and what the editor shows.</Dialog.Description
			></Dialog.Header
		>
		<div class="space-y-6">
			<section class="space-y-3">
				<div>
					<h3 class="text-sm font-medium">Appearance</h3>
					<p class="text-sm text-muted-foreground">Choose the interface color mode.</p>
				</div>
				<div
					class="grid grid-cols-3 gap-1 rounded-lg border bg-muted/40 p-1"
					role="radiogroup"
					aria-label="Theme"
				>
					{#each themes as theme (theme.value)}
						<button
							type="button"
							role="radio"
							aria-checked={workspace.theme === theme.value}
							class={[
								'flex h-9 items-center justify-center gap-2 rounded-md px-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none',
								workspace.theme === theme.value
									? 'bg-card font-medium text-foreground shadow-xs ring-1 ring-border'
									: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
							]}
							onclick={() => workspace.setTheme(theme.value)}
						>
							<theme.icon size={15} />{theme.label}
						</button>
					{/each}
				</div>
			</section>
			<section class="space-y-3 border-t pt-5">
				<div class="flex items-center justify-between gap-4">
					<div>
						<label for="reserved-gaps" class="text-sm font-medium">Show reserved gaps</label>
						<p class="text-sm text-muted-foreground">
							Include reserved fields and register ranges.
						</p>
					</div>
					<Switch
						id="reserved-gaps"
						aria-label="Show reserved gaps"
						bind:checked={workspace.showReservedGaps}
					/>
				</div>
			</section>
			<section class="space-y-3 border-t pt-5">
				<div class="flex items-center justify-between gap-4">
					<div>
						<h3 class="text-sm font-medium">Zoom</h3>
						<p class="text-sm text-muted-foreground">Scale the whole workspace.</p>
					</div>
					<div class="flex items-center gap-1">
						<Button
							variant="outline"
							size="icon-sm"
							aria-label="Zoom out"
							disabled={workspace.zoom <= 70}
							onclick={() => step(-10)}><Minus /></Button
						>
						<span
							class="grid h-7 w-14 place-items-center rounded-md border bg-muted/40 font-mono text-xs tabular-nums"
							aria-live="polite">{workspace.zoom}%</span
						>
						<Button
							variant="outline"
							size="icon-sm"
							aria-label="Zoom in"
							disabled={workspace.zoom >= 200}
							onclick={() => step(10)}><Plus /></Button
						>
						<Button
							variant="ghost"
							size="icon-sm"
							class="text-muted-foreground"
							aria-label="Reset zoom"
							disabled={workspace.zoom === 100}
							onclick={() => (workspace.zoom = 100)}><RotateCcw /></Button
						>
					</div>
				</div>
			</section>
			<section class="space-y-2 border-t pt-5">
				<h3 class="flex items-center gap-2 text-sm font-medium">
					<Contrast size={15} class="text-muted-foreground" />Data and privacy
				</h3>
				<p class="text-sm text-muted-foreground">
					Your documents stay in this browser. Everest sends no file contents to a server.
				</p>
			</section>
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (workspace.settingsOpen = false)}>Close</Button>
		</Dialog.Footer>
	</Dialog.Content></Dialog.Root
>
