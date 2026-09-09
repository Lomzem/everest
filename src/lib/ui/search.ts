import type { Compilation } from '$lib/rdl/types';
import { scopedDefinition } from './values';
export interface SearchResult {
	id: string;
	kind: 'register' | 'field' | 'enum' | 'enum-member';
	label: string;
	context: string;
	registerId: string;
	fieldId?: string;
	member?: string;
	content: string;
}
export function searchDocument(compilation: Compilation, query: string): SearchResult[] {
	const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	if (!terms.length) return [];
	const records: SearchResult[] = [];
	for (const reg of compilation.nodes.filter((n) => n.kind === 'reg')) {
		const label = String(reg.properties.name?.value ?? reg.name);
		const location = `${reg.groupPath || 'Document'} · 0x${(reg.address ?? 0n).toString(16).toUpperCase().padStart(2, '0')}`;
		records.push({
			id: reg.id,
			kind: 'register',
			label,
			context: location,
			registerId: reg.id,
			content: `${reg.name} ${label} ${location} ${reg.address} ${reg.properties.desc?.value ?? ''}`
		});
		for (const field of reg.children.filter((n) => n.kind === 'field')) {
			const fieldLabel = String(field.properties.name?.value ?? field.name),
				context = `${label} · ${field.name}`;
			const common = { registerId: reg.id, fieldId: field.id };
			records.push({
				...common,
				id: field.id,
				kind: 'field',
				label: fieldLabel,
				context,
				content: `${field.name} ${fieldLabel} ${context} ${reg.groupPath} ${field.properties.desc?.value ?? ''}`
			});
			const enumName = String(field.properties.encode?.value ?? '');
			const definition = scopedDefinition(compilation.enums, enumName, field.bodyRange.start);
			if (!definition) continue;
			records.push({
				...common,
				id: `${field.id}:enum`,
				kind: 'enum',
				label: enumName,
				context,
				content: `${enumName} ${context} ${reg.groupPath}`
			});
			for (const member of definition.members)
				records.push({
					...common,
					id: `${field.id}:${member.name}`,
					kind: 'enum-member',
					label: member.name,
					context: `${enumName} · ${fieldLabel}`,
					member: member.name,
					content: `${member.name} ${enumName} ${fieldLabel} ${member.value} ${member.description ?? ''} ${reg.groupPath}`
				});
		}
	}
	return records
		.filter((r) => terms.every((t) => r.content.toLowerCase().includes(t)))
		.slice(0, 100);
}
