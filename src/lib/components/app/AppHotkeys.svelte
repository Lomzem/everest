<script lang="ts">
	import { createHotkeys } from '@tanstack/svelte-hotkeys';
	import { editor } from '$lib/state/editor.svelte';

	createHotkeys(() => [
		{
			hotkey: 'Control+Z',
			callback: () => editor.undo(),
			options: {
				enabled: editor.appView === 'editor' && editor.canUndo,
				preventDefault: true,
			},
		},
		{
			hotkey: 'Control+Y',
			callback: () => editor.redo(),
			options: {
				enabled: editor.appView === 'editor' && editor.canRedo,
				preventDefault: true,
			},
		},
	]);
</script>
