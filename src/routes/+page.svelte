<script lang="ts">
	import { onMount } from 'svelte';
	import AppHotkeys from '$lib/components/app/AppHotkeys.svelte';
	import AppMenubar from '$lib/components/app/AppMenubar.svelte';
	import DiagnosticLogsDialog from '$lib/components/app/DiagnosticLogsDialog.svelte';
	import EditorShell from '$lib/components/app/EditorShell.svelte';
	import UnsavedChangesDialog from '$lib/components/app/UnsavedChangesDialog.svelte';
	import WelcomeScreen from '$lib/components/app/WelcomeScreen.svelte';
	import '$lib/desktop-api';
	import { diagnostics } from '$lib/state/diagnostics.svelte';
	import { editor } from '$lib/state/editor.svelte';

	function handleBeforeUnload(event: BeforeUnloadEvent) {
		if (!editor.dirty) return;
		event.preventDefault();
		event.returnValue = '';
	}

	onMount(() => {
		editor.restorePersistedSession();
		void editor.syncWindowState();

		const removeMenuListener = editor.subscribeMenuCommands();
		const removeDiagnosticsListeners = diagnostics.installGlobalHandlers();
		return () => {
			removeMenuListener?.();
			removeDiagnosticsListeners();
		};
	});
</script>

<svelte:window onbeforeunload={handleBeforeUnload} />

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

<UnsavedChangesDialog />
<DiagnosticLogsDialog />
