<script lang="ts">
	import { onMount } from 'svelte';
	import EditorShell from '$lib/components/app/EditorShell.svelte';
	import WelcomeScreen from '$lib/components/app/WelcomeScreen.svelte';
	import '$lib/electron';
	import { editor } from '$lib/state/editor.svelte';

	onMount(() => {
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
			? 'Basecamp'
			: `${editor.dirty ? '* ' : ''}${editor.documentLabel}`}</title
	>
</svelte:head>

{#if editor.appView === 'welcome'}
	<WelcomeScreen />
{:else}
	<EditorShell />
{/if}
