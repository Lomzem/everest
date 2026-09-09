import { Data, Effect } from 'effect';
import { compile } from './compiler';
import { builtinProperties } from './properties';
import { lex } from './lexer';
import { evaluate } from './expression';
import type { Compilation, EditCommand, RdlNode, SourceRange } from './types';
export class EditError extends Data.TaggedError('EditError')<{ message: string }> {}
interface Patch extends SourceRange {
	text: string;
}
const keywords = new Set(
	'addrmap regfile reg field mem signal enum property struct constraint default external internal alias abstract true false longint bit string boolean ref number component type'.split(
		' '
	)
);
function identifier(name: string) {
	if (!/^[A-Za-z_]\w*$/.test(name) || keywords.has(name))
		throw new EditError({
			message: 'Use a valid SystemRDL identifier. Start with a letter or underscore.'
		});
}
function patches(source: string, edits: Patch[]): string {
	let result = source;
	let last = source.length + 1;
	for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
		if (edit.end > last || edit.start > edit.end)
			throw new EditError({ message: 'The source changes overlap.' });
		result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
		last = edit.start;
	}
	return result;
}
function lineIndent(source: string, offset: number) {
	const start = source.lastIndexOf('\n', offset - 1) + 1;
	return source.slice(start, offset).match(/^\s*/)?.[0] ?? '';
}
function newline(source: string) {
	return source.includes('\r\n') ? '\r\n' : '\n';
}
function bodyInsertion(
	source: string,
	node: Pick<RdlNode, 'range' | 'bodyRange'>,
	text: string
): Patch {
	const end = node.bodyRange.end,
		indent = lineIndent(source, node.range.start),
		nl = newline(source);
	const body = source.slice(node.bodyRange.start, end);
	const existing = body.match(/\n([\t ]+)\S/);
	const unit = source.includes('\n\t') ? '\t' : '    ';
	const childIndent = existing?.[1] ?? indent + unit;
	const start = source.lastIndexOf('\n', end - 1) + 1;
	const closingSpace = source.slice(start, end);
	if (start >= node.bodyRange.start && /^\s*$/.test(closingSpace))
		return {
			start,
			end: start,
			text:
				text
					.split('\n')
					.map((l) => childIndent + l)
					.join(nl) + nl
		};
	return {
		start: end,
		end,
		text:
			nl +
			text
				.split('\n')
				.map((l) => childIndent + l)
				.join(nl) +
			nl +
			indent
	};
}
function removeStatement(source: string, range: SourceRange): Patch {
	let { start, end } = range;
	const lineStart = source.lastIndexOf('\n', start - 1) + 1;
	let lineEnd = source.indexOf('\n', end);
	if (lineEnd < 0) lineEnd = source.length;
	const before = source.slice(lineStart, start),
		after = source.slice(end, lineEnd);
	if (/^[\t ]*$/.test(before) && /^[\t \r]*$/.test(after)) {
		start = lineStart;
		end = lineEnd < source.length ? lineEnd + 1 : lineEnd;
	}
	return { start, end, text: '' };
}
interface AttributeSpan {
	range: SourceRange;
	value: SourceRange;
}
function declarationBody(source: string, range: SourceRange): SourceRange {
	const tokens = lex(source.slice(range.start, range.end));
	const first = tokens.find((t) => t.text === '{');
	const last = tokens.findLast((t) => t.text === '}');
	if (!first || !last) throw new EditError({ message: 'The declaration has no editable body.' });
	return { start: range.start + first.end, end: range.start + last.start };
}
function attributeSpans(source: string, body: SourceRange): Map<string, AttributeSpan> {
	const tokens = lex(source.slice(body.start, body.end));
	const result = new Map<string, AttributeSpan>();
	let first = 0,
		depth = 0;
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (['{', '[', '('].includes(token.text)) depth++;
		if (['}', ']', ')'].includes(token.text)) depth--;
		if (token.text !== ';' || depth !== 0) continue;
		if (tokens[first + 1]?.text === '=' && i > first + 2)
			result.set(tokens[first].text, {
				range: { start: body.start + tokens[first].start, end: body.start + token.end },
				value: { start: body.start + tokens[first + 2].start, end: body.start + tokens[i - 1].end }
			});
		first = i + 1;
	}
	return result;
}
function sameTokens(left: string, right: string) {
	return (
		lex(left)
			.map((t) => t.text)
			.join(' ') ===
		lex(right)
			.map((t) => t.text)
			.join(' ')
	);
}
function updateAttributes(
	source: string,
	owner: Pick<RdlNode, 'range' | 'bodyRange'>,
	values: Record<string, string | undefined>
): Patch[] {
	const spans = attributeSpans(source, owner.bodyRange),
		result: Patch[] = [],
		added: string[] = [];
	for (const [name, text] of Object.entries(values)) {
		const old = spans.get(name);
		if (!text?.trim()) {
			if (old) result.push(removeStatement(source, old.range));
		} else if (old) {
			if (!sameTokens(source.slice(old.value.start, old.value.end), text))
				result.push({ ...old.value, text });
		} else added.push(`${name} = ${text};`);
	}
	if (added.length) result.push(bodyInsertion(source, owner, added.join('\n')));
	return result;
}
/** Apply only source-span patches, then compile the proposed document before returning it. */
export function applyEdit(compilation: Compilation, command: EditCommand): string {
	if (!compilation.valid)
		throw new EditError({ message: 'Resolve the input errors before editing.' });
	const source = compilation.source;
	const edits: Patch[] = [];
	const nodeId =
		'nodeId' in command ? command.nodeId : 'parentId' in command ? command.parentId : undefined;
	const node = nodeId ? compilation.nodes.find((n) => n.id === nodeId) : undefined;
	if (nodeId && !node) throw new EditError({ message: 'The selected component no longer exists.' });
	if (node && !node.editable)
		throw new EditError({ message: 'This component is generated by a macro and is read-only.' });
	switch (command.type) {
		case 'rename': {
			identifier(command.name);
			if (command.name === node!.name) return source;
			edits.push({ ...node!.nameRange, text: command.name });
			break;
		}
		case 'set-property': {
			const n = node!,
				name = command.property;
			identifier(name);
			const bindOnly = !command.value.trim();
			if (bindOnly && !compilation.properties.some((p) => p.name === name))
				throw new EditError({ message: 'Enter a property value.' });
			const property = n.properties[name];
			const def = compilation.properties.find((p) => p.name === name) ?? builtinProperties[name];
			if (!def) throw new EditError({ message: `Unknown property ${name}.` });
			if (property && !property.inherited && !property.editable)
				throw new EditError({ message: 'This value is generated by a macro and is read-only.' });
			if (bindOnly) {
				if (property?.statementRange && !property.inherited)
					edits.push({ ...property.statementRange, text: `${name};` });
				else edits.push(bodyInsertion(source, n, `${name};`));
			} else if (
				property?.range &&
				(property.range.start !== property.statementRange?.start ||
					source.slice(property.range.start, property.range.end) !== name)
			) {
				edits.push({ ...property.range, text: command.value });
			} else if (property?.statementRange && !property.inherited) {
				edits.push({ ...property.statementRange, text: `${name} = ${command.value};` });
			} else edits.push(bodyInsertion(source, n, `${name} = ${command.value};`));
			break;
		}
		case 'remove-property': {
			const property = node!.properties[command.property];
			if (!property || property.inherited) return source;
			if (!property.editable || !property.statementRange)
				throw new EditError({ message: 'This property cannot be removed here.' });
			if (command.property === 'reset' && property.range?.start === property.statementRange.start) {
				const before = lex(source.slice(node!.nameRange.end, property.range.start));
				const equal = before.findLast((token) => token.text === '=');
				if (!equal) throw new EditError({ message: 'The reset assignment could not be located.' });
				edits.push({ start: node!.nameRange.end + equal.start, end: property.range.end, text: '' });
			} else edits.push(removeStatement(source, property.statementRange));
			break;
		}
		case 'set-address': {
			if (node!.kind === 'field' || node!.kind === 'signal')
				throw new EditError({ message: 'This component has no byte address.' });
			if (node!.addressRange) edits.push({ ...node!.addressRange, text: command.value });
			else {
				if (source.slice(node!.nameRange.end, node!.bodyRange.start).includes('{'))
					throw new EditError({
						message: 'The root definition does not have an instance address.'
					});
				const tokens = lex(source.slice(node!.nameRange.end, node!.range.end));
				const marker = tokens.find((t) => ['+=', '%=', ';', ','].includes(t.text));
				const offset = node!.nameRange.end + (marker?.start ?? 0);
				edits.push({ start: offset, end: offset, text: ` @ ${command.value} ` });
			}
			break;
		}
		case 'set-bits': {
			const { msb, lsb } = command;
			if (node!.kind !== 'field')
				throw new EditError({ message: 'Select a field to edit its bit range.' });
			if (
				!Number.isSafeInteger(msb) ||
				!Number.isSafeInteger(lsb) ||
				lsb < 0 ||
				msb < lsb ||
				msb > 65535
			)
				throw new EditError({ message: 'Enter a valid bit range with MSB at least LSB.' });
			edits.push({
				...(node!.bitRange ?? { start: node!.nameRange.end, end: node!.nameRange.end }),
				text: `[${msb}:${lsb}]`
			});
			break;
		}
		case 'add-component': {
			identifier(command.name);
			const allowed: Record<string, string[]> = {
				addrmap: ['addrmap', 'regfile', 'reg', 'mem', 'signal'],
				regfile: ['regfile', 'reg', 'mem', 'signal'],
				reg: ['field', 'signal'],
				field: [],
				mem: [],
				signal: []
			};
			if (!allowed[node!.kind].includes(command.kind))
				throw new EditError({ message: `Cannot add ${command.kind} inside ${node!.kind}.` });
			if (node!.children.some((c) => c.name === command.name))
				throw new EditError({ message: 'A component with this name already exists.' });
			let body = '';
			if (command.kind === 'reg') body = '\n    field { sw = rw; hw = r; } value[0:0];\n';
			if (command.kind === 'mem') body = ' memwidth = 32; mementries = 16; ';
			if (command.kind === 'field') {
				const bits = new Set<number>();
				for (const f of node!.children)
					for (let bit = f.lsb ?? 0; bit <= (f.msb ?? -1); bit++) bits.add(bit);
				let free = 0;
				while (bits.has(free)) free++;
				if (free >= (node!.width ?? 32))
					throw new EditError({ message: 'The register has no unused bits.' });
				body = ' sw = rw; hw = r; ';
				edits.push(
					bodyInsertion(source, node!, `field {${body}} ${command.name}[${free}:${free}];`)
				);
			} else edits.push(bodyInsertion(source, node!, `${command.kind} {${body}} ${command.name};`));
			break;
		}
		case 'delete-component': {
			if (!node!.parentId)
				throw new EditError({ message: 'The root address map cannot be removed.' });
			if (
				compilation.nodes.some(
					(n) =>
						n.id !== node!.id &&
						n.parentId === node!.parentId &&
						n.range.start === node!.range.start
				)
			)
				throw new EditError({
					message: 'This declaration contains multiple instances and cannot be removed separately.'
				});
			edits.push(removeStatement(source, node!.range));
			break;
		}
		case 'upsert-property-definition': {
			const d = command.definition;
			identifier(d.name);
			const old = compilation.properties.find((p) => p.name === (command.previousName ?? d.name));
			if (old && !old.editable)
				throw new EditError({ message: 'This declaration is generated and is read-only.' });
			if (!d.components.length)
				throw new EditError({ message: 'Select at least one allowed component.' });
			if (old && old.name !== d.name && compilation.nodes.some((n) => n.properties[old.name]))
				throw new EditError({ message: 'Remove existing uses before renaming this property.' });
			const nl = newline(source);
			const value = `property ${d.name} {${nl}    type = ${d.type};${nl}    component = ${d.components.join(' | ')};${d.defaultText?.trim() ? `${nl}    default = ${d.defaultText};` : ''}${d.constraint ? `${nl}    constraint = ${d.constraint};` : ''}${nl}};`;
			if (old) {
				if (old.name !== d.name) edits.push({ ...old.nameRange, text: d.name });
				edits.push(
					...updateAttributes(
						source,
						{ range: old.range, bodyRange: declarationBody(source, old.range) },
						{
							type: d.type,
							component: d.components.join(' | '),
							default: d.defaultText,
							constraint: d.constraint
						}
					)
				);
			} else edits.push({ start: 0, end: 0, text: value + nl + nl });
			break;
		}
		case 'delete-property-definition': {
			const old = compilation.properties.find((p) => p.name === command.name);
			if (!old) return source;
			if (!old.editable)
				throw new EditError({ message: 'This declaration is generated and is read-only.' });
			if (compilation.nodes.some((n) => n.properties[old.name]))
				throw new EditError({
					message: 'Remove all uses of this property before deleting its declaration.'
				});
			edits.push(removeStatement(source, old.range));
			break;
		}
		case 'upsert-enum': {
			const d = command.definition;
			identifier(d.name);
			if (!d.members.length) throw new EditError({ message: 'An enum needs at least one member.' });
			d.members.forEach((m) => identifier(m.name));
			const old = compilation.enums.find((e) =>
				command.previousStart !== undefined
					? e.range.start === command.previousStart
					: e.name === (command.previousName ?? d.name)
			);
			if (old && !old.editable)
				throw new EditError({ message: 'This enum is generated and is read-only.' });
			if (old) {
				if (old.name !== d.name) edits.push({ ...old.nameRange, text: d.name });
				const used = new Set<string>();
				const additions: string[] = [];
				for (let i = 0; i < d.members.length; i++) {
					const input = d.members[i];
					const member =
						old.members.find((m) => m.name === input.name) ??
						(old.members.length === d.members.length &&
						!d.members.some((m) => m.name === old.members[i].name)
							? old.members[i]
							: undefined);
					if (!member) {
						additions.push(
							`${input.name} = ${input.value}${input.description ? ` { desc = ${JSON.stringify(input.description)}; }` : ''};`
						);
						continue;
					}
					used.add(member.name);
					if (member.name !== input.name) edits.push({ ...member.nameRange, text: input.name });
					let unchanged = false;
					try {
						unchanged = evaluate(input.value) === member.value;
					} catch {
						/* Compilation validates expressions with references. */
					}
					if (!unchanged) {
						if (member.valueRange) edits.push({ ...member.valueRange, text: input.value });
						else
							edits.push({
								start: member.nameRange.end,
								end: member.nameRange.end,
								text: ` = ${input.value}`
							});
					}
					// Omitted descriptions are retained for callers that do not edit descriptions.
					if (input.description !== undefined && input.description !== member.description) {
						const tokens = lex(source.slice(member.range.start, member.range.end));
						if (tokens.some((t) => t.text === '{'))
							edits.push(
								...updateAttributes(
									source,
									{ range: member.range, bodyRange: declarationBody(source, member.range) },
									{ desc: input.description ? JSON.stringify(input.description) : undefined }
								)
							);
						else if (input.description) {
							const semicolon = tokens.findLast((t) => t.text === ';');
							const at =
								member.range.start +
								(semicolon?.start ?? source.slice(member.range.start, member.range.end).length);
							edits.push({
								start: at,
								end: at,
								text: ` { desc = ${JSON.stringify(input.description)}; }`
							});
						}
					}
				}
				for (const member of old.members)
					if (!used.has(member.name)) edits.push(removeStatement(source, member.range));
				if (additions.length) edits.push(bodyInsertion(source, old, additions.join('\n')));
			} else {
				const nl = newline(source);
				const text = `enum ${d.name} {${nl}${d.members.map((m) => `    ${m.name} = ${m.value}${m.description ? ` { desc = ${JSON.stringify(m.description)}; }` : ''};`).join(nl)}${nl}};`;
				edits.push({ start: 0, end: 0, text: text + nl + nl });
			}
			break;
		}
		case 'delete-enum': {
			const old = compilation.enums.find((e) =>
				command.start !== undefined ? e.range.start === command.start : e.name === command.name
			);
			if (!old) return source;
			if (!old.editable)
				throw new EditError({ message: 'This enum is generated and is read-only.' });
			edits.push(removeStatement(source, old.range));
			break;
		}
	}
	const next = patches(source, edits);
	const result = compile(next);
	const error = result.diagnostics.find((d) => d.severity === 'error');
	if (error) throw new EditError({ message: `${error.message} (line ${error.line})` });
	return next;
}
export const editEffect = Effect.fn('rdl.edit')((compilation: Compilation, command: EditCommand) =>
	Effect.try({
		try: () => applyEdit(compilation, command),
		catch: (cause) =>
			cause instanceof EditError
				? cause
				: new EditError({
						message: cause instanceof Error ? cause.message : 'The edit could not be applied.'
					})
	})
);
