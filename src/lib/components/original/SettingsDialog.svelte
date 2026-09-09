<script lang="ts">
	import { Settings } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import { Switch } from '$lib/components/ui/switch';
	import { Separator } from '$lib/components/ui/separator';
	import type { Workspace } from '$lib/ui/workspace.svelte';
	let { workspace }: { workspace: Workspace } = $props();
</script>

<Button
	variant="ghost"
	class={['w-full text-xs', !workspace.leftCollapsed && 'justify-start']}
	aria-label="Settings"
	onclick={() => (workspace.settingsOpen = true)}
	><Settings size={16} />{#if !workspace.leftCollapsed}Settings{/if}</Button
>
<Dialog.Root bind:open={workspace.settingsOpen}
	><Dialog.Content class="sm:max-w-md"
		><Dialog.Header
			><Dialog.Title>Settings</Dialog.Title><Dialog.Description
				>Customize the register editor view.</Dialog.Description
			></Dialog.Header
		>
		<div class="grid grid-cols-[1fr_8rem] items-center gap-4">
			<div>
				<label for="settings-theme" class="font-medium">Theme</label>
				<p class="text-muted-foreground">Choose the interface color mode.</p>
			</div>
			<Select.Root
				type="single"
				value={workspace.theme}
				onValueChange={(value) => workspace.setTheme(value as 'dark' | 'light' | 'system')}
				><Select.Trigger id="settings-theme" aria-label="Theme"
					>{workspace.theme[0].toUpperCase() + workspace.theme.slice(1)}</Select.Trigger
				><Select.Content
					>{#each ['light', 'dark', 'system'] as theme (theme)}<Select.Item value={theme}
							>{theme[0].toUpperCase() + theme.slice(1)}</Select.Item
						>{/each}</Select.Content
				></Select.Root
			>
		</div>
		<Separator />
		<div class="grid grid-cols-[1fr_auto] items-center gap-4">
			<div>
				<label for="reserved-gaps" class="font-medium">Show reserved gaps</label>
				<p class="text-muted-foreground">Include reserved fields and register ranges.</p>
			</div>
			<Switch
				id="reserved-gaps"
				aria-label="Show reserved gaps"
				bind:checked={workspace.showReservedGaps}
			/>
		</div></Dialog.Content
	></Dialog.Root
>
