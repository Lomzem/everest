import { lex } from '$lib/rdl/lexer';
import type { Compilation, SourceRange } from '$lib/rdl/types';

/** Split literal members without treating quoted commas or nested values as separators. */
export function splitMembers(text: string): string[] {
	const result: string[] = [];
	let depth = 0;
	let first = 0;
	const tokens = lex(text);
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (['{', '[', '('].includes(token.text)) depth++;
		else if (['}', ']', ')'].includes(token.text)) depth--;
		else if (token.text === ',' && depth === 0) {
			if (i > first) result.push(text.slice(tokens[first].start, tokens[i - 1].end));
			first = i + 1;
		}
	}
	if (first < tokens.length) result.push(text.slice(tokens[first].start, tokens.at(-1)!.end));
	return result;
}
export function decodeText(text: string): string {
	try {
		const value: unknown = JSON.parse(text);
		if (typeof value === 'string') return value;
	} catch {
		/* SystemRDL permits literal newlines. */
	}
	return text.startsWith('"') && text.endsWith('"')
		? text.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
		: text;
}
export function literalDefault(type: string): string {
	if (type.endsWith('[]')) return "'{}";
	if (type === 'string') return '""';
	if (type === 'boolean') return 'false';
	if (['number', 'bit', 'longint', 'longint unsigned'].includes(type)) return '0';
	return '';
}
export function aggregateMembers(text: string): string[] {
	const first = text.indexOf('{'),
		last = text.lastIndexOf('}');
	return first < 0 || last < first ? [] : splitMembers(text.slice(first + 1, last));
}

/** Resolve the nearest declaration that contains the component definition. */
export function scopedDefinition<T extends { name: string; scopeRange?: SourceRange }>(
	definitions: T[],
	name: string,
	offset = 0
): T | undefined {
	return definitions
		.filter(
			(definition) =>
				definition.name === name &&
				(!definition.scopeRange ||
					(definition.scopeRange.start <= offset && offset <= definition.scopeRange.end))
		)
		.sort(
			(left, right) =>
				(right.scopeRange?.start ?? -1) - (left.scopeRange?.start ?? -1) ||
				(left.scopeRange?.end ?? Infinity) - (right.scopeRange?.end ?? Infinity)
		)[0];
}

export function valueDefault(
	type: string,
	compilation: Compilation,
	scopeOffset = 0,
	depth = 0
): string {
	if (depth > 8) return '';
	const basic = literalDefault(type);
	if (basic) return basic;
	const enumeration = scopedDefinition(compilation.enums, type, scopeOffset);
	if (enumeration?.members[0]) return `${enumeration.name}::${enumeration.members[0].name}`;
	const structure = scopedDefinition(compilation.structs ?? [], type, scopeOffset);
	if (structure)
		return `${type}'{${structure.members.map((member) => `${member.name}: ${valueDefault(member.type, compilation, scopeOffset, depth + 1)}`).join(', ')}}`;
	if (['ref', 'addrmap', 'regfile', 'reg', 'field', 'mem', 'signal'].includes(type))
		return compilation.nodes.find((node) => type === 'ref' || node.kind === type)?.id ?? '';
	return '';
}
