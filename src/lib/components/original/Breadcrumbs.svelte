<script lang="ts">
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import type { EditorSession } from '$lib/editor/session.svelte';
	import type { Workspace } from '$lib/ui/workspace.svelte';
	import type { RdlNode } from '$lib/rdl/types';
	import { title } from '$lib/ui/original';
	let {
		session,
		workspace,
		node
	}: { session: EditorSession; workspace: Workspace; node?: RdlNode } = $props();
	let path = $derived(node?.groupPath ?? workspace.selectedGroup ?? '');
</script>

<Breadcrumb.Root
	><Breadcrumb.List
		><Breadcrumb.Item
			><button class="hover:text-foreground" onclick={() => (workspace.selectedGroup = '')}
				>{session.compilation.roots[0] ? title(session.compilation.roots[0]) : 'addrmap'}</button
			></Breadcrumb.Item
		>{#each path.split('/').filter(Boolean) as part, index (index)}<Breadcrumb.Separator
			/><Breadcrumb.Item
				><button
					onclick={() =>
						(workspace.selectedGroup = path
							.split('/')
							.slice(0, index + 1)
							.join('/'))}>{part}</button
				></Breadcrumb.Item
			>{/each}{#if node}<Breadcrumb.Separator /><Breadcrumb.Item
				><Breadcrumb.Page>{node.name}</Breadcrumb.Page></Breadcrumb.Item
			>{/if}</Breadcrumb.List
	></Breadcrumb.Root
>
