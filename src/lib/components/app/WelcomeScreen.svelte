<script lang="ts">
	import { FilePlus, FolderOpen } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { editor } from '$lib/state/editor.svelte';
</script>

<main class="flex min-h-0 flex-1 items-center justify-center bg-background text-foreground">
	<section class="flex flex-col items-center gap-6">
		<h1 class="text-3xl font-semibold tracking-normal">Everest</h1>
		<div class="flex items-center gap-3">
			<Button variant="outline" size="lg" onclick={() => editor.requestOpenDocument()}>
				<FolderOpen size={14} />
				Open RDL
			</Button>
			<Button size="lg" onclick={() => editor.requestNewDocument()}>
				<FilePlus size={14} />
				New RDL
			</Button>
		</div>
	</section>
</main>
