<script lang="ts">
	import { onMount } from 'svelte';
	import AppHotkeys from '$lib/components/app/AppHotkeys.svelte';
	import AppMenubar from '$lib/components/app/AppMenubar.svelte';
	import EditorShell from '$lib/components/app/EditorShell.svelte';
	import WelcomeScreen from '$lib/components/app/WelcomeScreen.svelte';
	import '$lib/desktop-api';
	import { editor } from '$lib/state/editor.svelte';

	onMount(() => {
		editor.restorePersistedSession();
		void editor.syncWindowState();
		const removeMenuListener = editor.subscribeMenuCommands();
		const beforeUnload = (event: BeforeUnloadEvent) => {
			if (!editor.dirty) return;
			event.preventDefault();
			event.returnValue = '';
		};

		globalThis.window.addEventListener('beforeunload', beforeUnload);
		return () => {
			removeMenuListener?.();
			globalThis.window.removeEventListener('beforeunload', beforeUnload);
		};
	});
</script>

<svelte:head>
	<title
		>{editor.appView === 'welcome'
			? 'Everest'
			: `${editor.dirty ? '* ' : ''}${editor.documentLabel}`}</title
	>
</svelte:head>

<AppHotkeys />

<div class="flex h-screen min-h-[720px] flex-col bg-background text-foreground">
	<AppMenubar />
	{#if editor.appView === 'welcome'}
		<WelcomeScreen />
	{:else}
		<EditorShell />
	{/if}
</div>
