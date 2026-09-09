import { deriveIdentifier } from '$lib/rdl/identifiers';
import type { Compilation, RdlNode } from '$lib/rdl/types';
export const title = (node: RdlNode) => String(node.properties.name?.value ?? node.name);
export const description = (node: RdlNode) => String(node.properties.desc?.value ?? '');
export const address = (value: bigint | undefined) =>
	'0x' + (value ?? 0n).toString(16).toUpperCase().padStart(2, '0');
export const groups = (compilation: Compilation, empty: string[]) =>
	[...new Set([...(compilation.groups ?? []).map((g) => g.path), ...empty])].sort();
export function newGroup(paths: string[], parent: string) {
	let name = 'New Folder',
		index = 2;
	while (paths.includes(parent ? `${parent}/${name}` : name)) name = `New Folder ${index++}`;
	return parent ? `${parent}/${name}` : name;
}
export const groupParent = (path: string) =>
	path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';

export async function updateTitle(
	session: import('$lib/editor/session.svelte').EditorSession,
	workspace: import('$lib/ui/workspace.svelte').Workspace,
	node: RdlNode,
	value: string
) {
	const oldId = node.id;
	const derive = workspace.createdNodeIds.includes(oldId);
	const name =
		derive && node.name === deriveIdentifier(title(node)) ? deriveIdentifier(value) : node.name;
	const nextId = node.parentId ? `${node.parentId}.${name}` : name;
	const ok = await session.edit({
		type: 'update-title',
		nodeId: oldId,
		title: value,
		deriveIdentifier: derive
	});
	if (ok) workspace.retarget(oldId, nextId);
	return ok;
}

export async function renameGroup(
	session: import('$lib/editor/session.svelte').EditorSession,
	workspace: import('$lib/ui/workspace.svelte').Workspace,
	path: string,
	name: string
) {
	if (!path)
		return session.edit({
			type: 'set-property',
			nodeId: session.compilation.roots[0].id,
			property: 'name',
			value: JSON.stringify(name)
		});
	if (!name.trim() || name !== name.trim() || name.includes('/')) return false;
	const parent = groupParent(path),
		next = parent ? `${parent}/${name}` : name;
	if (next !== path && groups(session.compilation, workspace.emptyGroups).includes(next))
		return false;
	if (
		session.compilation.groups?.some((group) => group.path === path) &&
		!(await session.edit({ type: 'rename-group', path, name }))
	)
		return false;
	workspace.emptyGroups = workspace.emptyGroups.map((item) =>
		item === path || item.startsWith(path + '/') ? next + item.slice(path.length) : item
	);
	workspace.expandedNodes = workspace.expandedNodes.map((item) =>
		item === path || item.startsWith(path + '/') ? next + item.slice(path.length) : item
	);
	workspace.selectedGroup = next;
	return true;
}

/** Input commits can rename a keyed component. Its position stays fixed during this flush. */
export async function flushNode(
	drafts: import('$lib/ui/drafts').EditorDrafts,
	session: import('$lib/editor/session.svelte').EditorSession,
	node: RdlNode
) {
	const position: number[] = [];
	let cursor: RdlNode | undefined = node;
	while (cursor) {
		const parent: RdlNode | undefined = session.compilation.nodes.find(
			(item) => item.id === cursor!.parentId
		);
		position.unshift(
			(parent?.children ?? session.compilation.roots).findIndex((item) => item.id === cursor!.id)
		);
		cursor = parent;
	}
	if (!(await drafts.flush())) return undefined;
	let nodes = session.compilation.roots;
	let current: RdlNode | undefined;
	for (const index of position) {
		current = nodes[index];
		if (!current) return undefined;
		nodes = current.children;
	}
	return current;
}
