import type { HierarchyGroup, Register } from './model';

export type AppView = 'welcome' | 'editor';
export type BreadcrumbGroup = { label: string; path: string };
export type SelectionKind = 'folder' | 'register';
export type HierarchyDndItem =
	| {
			id: string;
			kind: 'folder';
			groupId: string;
			path: string;
			label: string;
			isDndShadowItem?: boolean;
	  }
	| {
			id: string;
			kind: 'register';
			registerId: string;
			path: string;
			label: string;
			isDndShadowItem?: boolean;
	  };
export type FolderChild =
	| { kind: 'folder'; id: string; path: string; label: string; address: number | null }
	| { kind: 'register'; id: string; register: Register; address: number }
	| { kind: 'reserved'; id: string; address: number; endAddress: number };

type AddressRange = { address: number; endAddress: number };

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

export function folderDndId(groupId: string) {
	return `folder:${groupId}`;
}

export function registerDndId(registerId: string) {
	return `register:${registerId}`;
}

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
	const hierarchyChildren = buildHierarchyChildren(groupPath, groups, registers);
	return [
		...hierarchyChildren,
		...buildReservedAddressRanges(childRanges(hierarchyChildren, registers)),
	].sort(compareFolderChildren);
}

export function buildHierarchyChildren(
	groupPath: string,
	groups: HierarchyGroup[],
	registers: Register[],
): Exclude<FolderChild, { kind: 'reserved' }>[] {
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
			id: register.id,
			register,
			address: register.address,
		}));
	return [...folderChildren, ...registerChildren].sort(compareFolderChildren);
}

export function buildHierarchyDndItems(
	groupPath: string,
	groups: HierarchyGroup[],
	registers: Register[],
): HierarchyDndItem[] {
	return buildHierarchyChildren(groupPath, groups, registers).map((child) => {
		if (child.kind === 'folder') {
			return {
				id: folderDndId(child.id),
				kind: 'folder',
				groupId: child.id,
				path: child.path,
				label: child.label,
			};
		}

		return {
			id: registerDndId(child.register.id),
			kind: 'register',
			registerId: child.register.id,
			path: child.register.group,
			label: child.register.title || child.register.name,
		};
	});
}

export function buildReservedAddressChildren(
	registers: Array<{ address: number | null; width?: number }>,
): Array<{ kind: 'reserved'; id: string; address: number; endAddress: number }> {
	return buildReservedAddressRanges(registers.flatMap(registerRange));
}

export function registerByteWidth(width = 8) {
	return Math.max(1, Math.ceil(width / 8));
}

function childRanges(
	children: Exclude<FolderChild, { kind: 'reserved' }>[],
	registers: Register[],
): AddressRange[] {
	return children.flatMap((child) => {
		if (child.kind === 'register') return registerRange(child.register);
		return folderRange(child.path, registers);
	});
}

function folderRange(groupPath: string, registers: Register[]): AddressRange[] {
	const ranges = registers
		.filter(
			(register) => register.group === groupPath || register.group.startsWith(`${groupPath}/`),
		)
		.flatMap(registerRange);
	if (!ranges.length) return [];

	return [
		{
			address: Math.min(...ranges.map((range) => range.address)),
			endAddress: Math.max(...ranges.map((range) => range.endAddress)),
		},
	];
}

function registerRange(register: { address: number | null; width?: number }): AddressRange[] {
	if (!Number.isFinite(register.address) || Number(register.address) < 0) return [];
	const address = Number(register.address);
	return [{ address, endAddress: address + registerByteWidth(register.width) - 1 }];
}

function buildReservedAddressRanges(ranges: AddressRange[]) {
	const occupied = mergeAddressRanges(ranges);

	return occupied.flatMap((range, index) => {
		const nextRange = occupied[index + 1];
		if (!nextRange || nextRange.address <= range.endAddress + 1) return [];

		const address = range.endAddress + 1;
		const endAddress = nextRange.address - 1;
		return [
			{
				kind: 'reserved' as const,
				id: `reserved-${address.toString(16)}-${endAddress.toString(16)}`,
				address,
				endAddress,
			},
		];
	});
}

function mergeAddressRanges(ranges: AddressRange[]) {
	return [...ranges]
		.sort((left, right) => left.address - right.address || left.endAddress - right.endAddress)
		.reduce<AddressRange[]>((merged, range) => {
			const previous = merged.at(-1);
			if (!previous || range.address > previous.endAddress + 1) {
				merged.push({ ...range });
				return merged;
			}

			previous.endAddress = Math.max(previous.endAddress, range.endAddress);
			return merged;
		}, []);
}

function compareFolderChildren(left: FolderChild, right: FolderChild) {
	const leftAddress = left.address ?? Number.POSITIVE_INFINITY;
	const rightAddress = right.address ?? Number.POSITIVE_INFINITY;
	if (leftAddress !== rightAddress) return leftAddress - rightAddress;
	return childKindRank(left.kind) - childKindRank(right.kind);
}

function childKindRank(kind: FolderChild['kind']) {
	if (kind === 'folder') return 0;
	if (kind === 'register') return 1;
	return 2;
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
