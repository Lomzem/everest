<script lang="ts">
	import { tick } from 'svelte';
	import type { Diagnostic } from '$lib/rdl/types';
	import { TriangleAlert, ChevronDown, ChevronUp, Download } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import type { EditorSession } from '$lib/editor/session.svelte';
	import type { Workspace } from '$lib/ui/workspace.svelte';
	let { session, workspace }: { session: EditorSession; workspace: Workspace } = $props();
	let count = $derived(session.compilation.diagnostics.length + (session.error ? 1 : 0));
	function target(diagnostic: Diagnostic) {
		return session.compilation.nodes
			.filter(
				(n) => diagnostic.range.start >= n.range.start && diagnostic.range.start < n.range.end
			)
			.sort((a, b) => a.range.end - a.range.start - (b.range.end - b.range.start))[0];
	}
	async function navigate(diagnostic: Diagnostic) {
		const node = target(diagnostic);
		if (!node || !session.compilation.valid) return;
		workspace.selectedGroup = undefined;
		session.select(node.kind === 'field' ? node.parentId! : node.id);
		if (node.kind === 'field') {
			workspace.expandedFields = [...new Set([...workspace.expandedFields, node.id])];
			await tick();
			document
				.querySelector(`[data-field-card="${CSS.escape(node.id)}"]`)
				?.scrollIntoView({ block: 'center' });
		}
	}
</script>

<section class="shrink-0 border-t bg-background" aria-label="Document problems">
	<div class="flex h-9 items-center justify-between px-3 text-xs">
		<Button
			variant="ghost"
			class="text-xs"
			onclick={() => (workspace.problemsOpen = !workspace.problemsOpen)}
			aria-expanded={workspace.problemsOpen}
			><TriangleAlert size={16} />{count}
			{count === 1 ? 'Problem' : 'Problems'}{#if workspace.problemsOpen}<ChevronDown
					size={16}
				/>{:else}<ChevronUp size={16} />{/if}</Button
		>{#if !session.compilation.valid}<span class="text-destructive"
				>Save blocked. Fix {count} problems.</span
			>{/if}
	</div>
	{#if workspace.problemsOpen || session.error}<div class="max-h-[38vh] overflow-auto border-t">
			{#if !count}<p class="p-5 text-sm text-muted-foreground">
					No document problems.
				</p>{/if}{#each session.compilation.diagnostics as diagnostic, index (index)}<button
					type="button"
					disabled={!session.compilation.valid || !target(diagnostic)}
					onclick={() => navigate(diagnostic)}
					class="block w-full border-b p-4 text-left enabled:hover:bg-muted"
				>
					<p class="font-mono text-xs text-muted-foreground">
						Line {diagnostic.line}, column {diagnostic.column}
					</p>
					<p class="text-sm">{diagnostic.message}</p>
				</button>{/each}{#if session.error}<div
					class="flex items-center justify-between gap-3 p-4"
					role="alert"
				>
					<p class="text-sm">{session.error}</p>
					{#if session.saveFailed}<Button variant="outline" onclick={() => session.download()}
							><Download />Download RDL</Button
						>{/if}
				</div>{/if}
		</div>{/if}
</section>
