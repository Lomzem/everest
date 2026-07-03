import type { HierarchyGroup, Register } from './model';

export type AppView = 'welcome' | 'editor';
export type BreadcrumbGroup = { label: string; path: string };
export type SelectionKind = 'folder' | 'register';
export type FolderChild =
	| { kind: 'folder'; id: string; path: string; label: string; address: number | null }
	| { kind: 'register'; register: Register; address: number };

export const rootBlockId = 'document-root';

export const emptyRegister: Register = {
	id: '',
	name: '',
	title: '',
	desc: '',
	address: 0,
	width: 8,
	group: '',
	sw: 'RW',
	hw: 'RW',
	fields: [],
};

export function basename(path: string) {
	return path.split(/[/\\]/).pop() ?? path;
}

export function addrmapLabel(document: { addrmapName: string; deviceName: string }) {
	return document.addrmapName || document.deviceName;
}

export function parentGroupPath(groupPath: string) {
	return groupPath.includes('/') ? groupPath.split('/').slice(0, -1).join('/') : '';
}

export function groupLabelForPath(groupPath: string, groups: HierarchyGroup[]) {
	return groups.find((group) => group.path === groupPath)?.label ?? basename(groupPath);
}

export function groupForPath(
	groupPath: string,
	groups: HierarchyGroup[],
	rootLabel: string,
): HierarchyGroup | undefined {
	if (!groupPath) {
		return {
			id: rootBlockId,
			label: rootLabel,
			path: '',
		};
	}
	const group = groups.find((item) => item.path === groupPath);
	if (group) return group;
	return {
		id: `implicit-${groupPath}`,
		label: groupLabelForPath(groupPath, groups),
		path: groupPath,
	};
}

export function normalizeHierarchyGroups(groups: HierarchyGroup[], registers: Register[]) {
	const byPath = new Map<string, HierarchyGroup>();

	for (const group of groups) {
		if (group.path) byPath.set(group.path, group);
	}

	for (const register of registers) {
		const segments = register.group.split('/').filter(Boolean);
		for (let index = 0; index < segments.length; index += 1) {
			const path = segments.slice(0, index + 1).join('/');
			if (!path || byPath.has(path)) continue;
			byPath.set(path, {
				id: stableGroupId(path),
				label: segments[index],
				path,
			});
		}
	}

	return [...byPath.values()];
}

export function stableGroupId(path: string) {
	return `group-${
		path
			.replace(/[^A-Za-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			.toLowerCase() || 'root'
	}`;
}

export function directChildGroupPath(parentPath: string, groupPath: string) {
	if (!parentPath) {
		const childSegment = groupPath.split('/')[0];
		return childSegment || '';
	}
	if (!groupPath.startsWith(`${parentPath}/`)) return '';
	const childSegment = groupPath.slice(parentPath.length + 1).split('/')[0];
	return childSegment ? `${parentPath}/${childSegment}` : '';
}

export function firstRegisterAddressUnder(groupPath: string, registers: Register[]) {
	const addresses = registers
		.filter(
			(register) => register.group === groupPath || register.group.startsWith(`${groupPath}/`),
		)
		.map((register) => register.address);

	return addresses.length ? Math.min(...addresses) : null;
}

export function buildFolderChildren(
	groupPath: string,
	groups: HierarchyGroup[],
	registers: Register[],
): FolderChild[] {
	const childGroups = new Map<string, { id: string; path: string; label: string }>();

	for (const group of groups) {
		if (parentGroupPath(group.path) === groupPath) {
			childGroups.set(group.path, { id: group.id, path: group.path, label: group.label });
		}
	}

	for (const register of registers) {
		const childPath = directChildGroupPath(groupPath, register.group);
		if (childPath && !childGroups.has(childPath)) {
			childGroups.set(childPath, {
				id: stableGroupId(childPath),
				path: childPath,
				label: groupLabelForPath(childPath, groups),
			});
		}
	}

	const folderChildren = [...childGroups.values()].map((group) => ({
		kind: 'folder' as const,
		id: group.id,
		path: group.path,
		label: group.label,
		address: firstRegisterAddressUnder(group.path, registers),
	}));
	const registerChildren = registers
		.filter((register) => register.group === groupPath)
		.map((register) => ({
			kind: 'register' as const,
			register,
			address: register.address,
		}));

	return [...folderChildren, ...registerChildren];
}

export function groupsForRegisters(groups: HierarchyGroup[], registers: Register[]) {
	const visiblePaths = new Set<string>();

	for (const register of registers) {
		const segments = register.group.split('/').filter(Boolean);
		for (let index = 0; index < segments.length; index += 1) {
			visiblePaths.add(segments.slice(0, index + 1).join('/'));
		}
	}

	return groups.filter((group) => visiblePaths.has(group.path));
}

export function buildGroupCrumbs(groupPath: string, groups: HierarchyGroup[]): BreadcrumbGroup[] {
	const parts = groupPath.split('/').filter(Boolean);
	return parts.map((part, index) => {
		const path = parts.slice(0, index + 1).join('/');
		return {
			label: groups.find((group) => group.path === path)?.label ?? part,
			path,
		};
	});
}

export function groupIdsForPath(groupPath: string, groups: HierarchyGroup[]) {
	return groups
		.filter((group) => groupPath === group.path || groupPath.startsWith(`${group.path}/`))
		.map((group) => group.id);
}
