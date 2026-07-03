<script lang="ts">
	import { FilePlus, FolderOpen } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { editor } from '$lib/state/editor.svelte';
</script>

<main class="flex h-screen min-h-[720px] items-center justify-center bg-background text-foreground">
	<section class="flex flex-col items-center gap-6">
		<h1 class="text-3xl font-semibold tracking-normal">Basecamp</h1>
		<div class="flex items-center gap-3">
			<Button variant="outline" size="lg" onclick={() => editor.openDocument()}>
				<FolderOpen size={14} />
				Open RDL
			</Button>
			<Button size="lg" onclick={() => editor.newDocument()}>
				<FilePlus size={14} />
				New RDL
			</Button>
		</div>
	</section>
</main>
