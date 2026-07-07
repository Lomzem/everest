<script lang="ts">
	import { createHotkeys } from '@tanstack/svelte-hotkeys';
	import { editor } from '$lib/state/editor.svelte';

	createHotkeys(() => [
		{
			hotkey: 'Mod+N',
			callback: () => editor.newDocument(),
			options: {
				preventDefault: true,
			},
		},
		{
			hotkey: 'Mod+O',
			callback: () => editor.openDocument(),
			options: {
				preventDefault: true,
			},
		},
		{
			hotkey: 'Mod+S',
			callback: () => editor.saveDocument(false),
			options: {
				enabled: editor.appView === 'editor',
				preventDefault: true,
			},
		},
		{
			hotkey: 'Mod+Shift+S',
			callback: () => editor.saveDocument(true),
			options: {
				enabled: editor.appView === 'editor',
				preventDefault: true,
			},
		},
		{
			hotkey: 'Mod+Q',
			callback: () => editor.quitApplication(),
			options: {
				preventDefault: true,
			},
		},
		{
			hotkey: 'Mod+Z',
			callback: () => editor.undo(),
			options: {
				enabled: editor.appView === 'editor' && editor.canUndo,
				preventDefault: true,
			},
		},
		{
			hotkey: 'Mod+Y',
			callback: () => editor.redo(),
			options: {
				enabled: editor.appView === 'editor' && editor.canRedo,
				preventDefault: true,
			},
		},
	]);
</script>
