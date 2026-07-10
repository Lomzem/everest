<script lang="ts">
	import { createHotkeys } from '@tanstack/svelte-hotkeys';
	import { editor } from '$lib/state/editor.svelte';
	import { ui } from '$lib/state/ui.svelte';

	createHotkeys(() => [
		{
			hotkey: 'Mod+N',
			callback: () => editor.requestNewDocument(),
			options: {
				preventDefault: true,
			},
		},
		{
			hotkey: 'Mod+O',
			callback: () => editor.requestOpenDocument(),
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
			callback: () => editor.requestQuitApplication(),
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
		{
			hotkey: 'Mod+=',
			callback: () => ui.zoomIn(),
			options: {
				preventDefault: true,
			},
		},
		{
			hotkey: 'Mod+-',
			callback: () => ui.zoomOut(),
			options: {
				preventDefault: true,
			},
		},
		{
			hotkey: 'Mod+0',
			callback: () => ui.resetZoom(),
			options: {
				preventDefault: true,
			},
		},
	]);
</script>
