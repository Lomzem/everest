import { diagnostic, type Token } from './lexer';
import type { ComponentKind, Diagnostic, SourceRange } from './types';
export const componentKinds = new Set<ComponentKind>([
	'addrmap',
	'regfile',
	'reg',
	'field',
	'mem',
	'signal'
]);
export interface Assignment {
	implicit?: boolean;
	name: string;
	target?: string;
	value: Token[];
	range: SourceRange;
	nameToken: Token;
	isDefault: boolean;
}
export interface Parameter {
	name: string;
	type: string;
	value: Token[];
}
export interface Definition {
	kind: ComponentKind;
	name?: string;
	nameToken?: Token;
	range: SourceRange;
	bodyRange: SourceRange;
	scope: Scope;
	parameters: Parameter[];
	generated: boolean;
}
export interface Instance {
	name: string;
	nameToken: Token;
	definition?: Definition;
	typeName?: string;
	scope: Scope;
	range: SourceRange;
	dimensions: Token[][];
	bits?: Token[][];
	bitRange?: SourceRange;
	reset: Token[];
	address: Token[];
	addressRange?: SourceRange;
	stride: Token[];
	align: Token[];
	parameters: Map<string, Token[]>;
	generated: boolean;
	alias?: string;
}
export interface ParsedEnum {
	name: Token;
	members: { name: Token; value: Token[]; description?: Token[]; range: SourceRange }[];
	range: SourceRange;
	bodyRange: SourceRange;
}
export interface ParsedProperty {
	name: Token;
	attrs: Map<string, Token[]>;
	range: SourceRange;
}
export interface ParsedStruct {
	name: Token;
	parent?: string;
	members: { name: string; type: string }[];
	range: SourceRange;
}
export interface Scope {
	parent?: Scope;
	definitions: Map<string, Definition>;
	instances: Instance[];
	assignments: Assignment[];
	enums: Map<string, ParsedEnum>;
	structs: Map<string, ParsedStruct>;
}
export interface ParsedDocument {
	scope: Scope;
	properties: ParsedProperty[];
}
export function parse(source: string, tokens: Token[], diagnostics: Diagnostic[]): ParsedDocument {
	let pos = 0;
	const properties: ParsedProperty[] = [];
	const eof: Token = { text: '', start: source.length, end: source.length };
	const current = () => tokens[pos] ?? eof;
	const peek = (n = 0) => tokens[pos + n]?.text;
	const take = () => tokens[pos++] ?? eof;
	function error(message: string, token = current(), code = 'SYNTAX') {
		diagnostics.push(diagnostic(source, token, code, message));
	}
	function expect(text: string): Token {
		if (peek() === text) return take();
		error(`Expected “${text}”, found “${peek() ?? 'end of file'}”.`);
		return current();
	}
	function id(): Token {
		const t = take();
		if (!/^(?:[A-Za-z_]\w*|\\\S+)$/.test(t.text)) error('Expected an identifier.', t);
		return t;
	}
	function collect(stops: string[]): Token[] {
		const result: Token[] = [];
		let round = 0,
			square = 0,
			brace = 0;
		while (pos < tokens.length) {
			const t = current();
			if (round === 0 && square === 0 && brace === 0 && stops.includes(t.text)) break;
			take();
			result.push(t);
			if (t.text === '(') round++;
			if (t.text === ')') round--;
			if (t.text === '[') square++;
			if (t.text === ']') square--;
			if (t.text === '{') brace++;
			if (t.text === '}') brace--;
			if (round < 0 || square < 0 || brace < 0) {
				pos--;
				result.pop();
				break;
			}
		}
		return result;
	}
	function parameters(): Parameter[] {
		const result: Parameter[] = [];
		if (peek() !== '#') return result;
		take();
		expect('(');
		while (pos < tokens.length && peek() !== ')') {
			const ts = collect([',', ')']);
			const equals = ts.findIndex((t) => t.text === '=');
			const lhs = equals < 0 ? ts : ts.slice(0, equals);
			const name = lhs.filter((t) => /^[A-Za-z_]\w*$/.test(t.text)).at(-1);
			if (!name) error('Expected a parameter declaration.');
			else
				result.push({
					name: name.text,
					type: lhs
						.slice(0, lhs.indexOf(name))
						.map((t) => t.text)
						.join(' '),
					value: equals < 0 ? [] : ts.slice(equals + 1)
				});
			if (peek() !== ',') break;
			take();
		}
		expect(')');
		return result;
	}
	function overrides(): Map<string, Token[]> {
		const result = new Map<string, Token[]>();
		if (peek() !== '#') return result;
		take();
		expect('(');
		while (pos < tokens.length && peek() !== ')') {
			expect('.');
			const name = id();
			expect('(');
			result.set(name.text, collect([')']));
			expect(')');
			if (peek() !== ',') break;
			take();
		}
		expect(')');
		return result;
	}
	function instances(
		scope: Scope,
		start: number,
		definition?: Definition,
		typeName?: string,
		alias?: string
	): void {
		const params = overrides();
		do {
			const name = id();
			const instance: Instance = {
				name: name.text,
				nameToken: name,
				definition,
				typeName,
				scope,
				range: { start, end: name.end },
				dimensions: [],
				reset: [],
				address: [],
				stride: [],
				align: [],
				parameters: params,
				generated: !!name.generated,
				alias
			};
			while (peek() === '[') {
				const open = take();
				const first = collect([':', ']']);
				if (peek() === ':') {
					take();
					instance.bits = [first, collect([']'])];
				} else instance.dimensions.push(first);
				const close = expect(']');
				instance.bitRange = { start: open.start, end: close.end };
			}
			if (peek() === '=') {
				take();
				instance.reset = collect(['@', '+=', '%=', ';', ',']);
			}
			if (peek() === '@') {
				take();
				instance.address = collect(['+=', '%=', ';', ',']);
				if (instance.address.length)
					instance.addressRange = {
						start: instance.address[0].start,
						end: instance.address.at(-1)!.end
					};
			}
			if (peek() === '+=') {
				take();
				instance.stride = collect(['%=', ';', ',']);
			}
			if (peek() === '%=') {
				take();
				instance.align = collect([';', ',']);
			}
			instance.range.end = (tokens[pos - 1] ?? name).end;
			scope.instances.push(instance);
			if (peek() !== ',') break;
			take();
		} while (pos < tokens.length);
		const end = expect(';');
		for (const inst of scope.instances.filter((i) => i.range.start === start))
			inst.range.end = end.end;
	}
	function enumDef(scope: Scope, start: number) {
		const name = id();
		const open = expect('{');
		const members: ParsedEnum['members'] = [];
		while (pos < tokens.length && peek() !== '}') {
			const at = pos,
				member = id();
			let value: Token[] = [];
			let description: Token[] | undefined;
			if (peek() === '=') {
				take();
				value = collect([';', '{']);
			}
			if (peek() === '{') {
				take();
				while (pos < tokens.length && peek() !== '}') {
					const key = take();
					expect('=');
					const v = collect([';']);
					expect(';');
					if (key.text === 'desc') description = v;
					else if (key.text !== 'name') error(`Unsupported enum attribute ${key.text}.`, key);
				}
				expect('}');
			}
			const end = expect(';');
			members.push({
				name: member,
				value,
				description,
				range: { start: member.start, end: end.end }
			});
			if (pos === at) take();
		}
		const close = expect('}');
		const end = expect(';');
		if (scope.enums.has(name.text)) error(`Duplicate enum ${name.text}.`, name);
		scope.enums.set(name.text, {
			name,
			members,
			range: { start, end: end.end },
			bodyRange: { start: open.end, end: close.start }
		});
	}
	function propertyDef(start: number) {
		const name = id();
		expect('{');
		const attrs = new Map<string, Token[]>();
		while (pos < tokens.length && peek() !== '}') {
			const at = pos,
				key = take();
			expect('=');
			const value = collect([';']);
			expect(';');
			if (attrs.has(key.text)) error(`Duplicate property attribute ${key.text}.`, key);
			attrs.set(key.text, value);
			if (pos === at) take();
		}
		expect('}');
		const end = expect(';');
		properties.push({ name, attrs, range: { start, end: end.end } });
	}
	function structDef(scope: Scope, start: number) {
		const name = id();
		let parent: string | undefined;
		if (peek() === ':') {
			take();
			parent = id().text;
		}
		expect('{');
		const members: ParsedStruct['members'] = [];
		while (pos < tokens.length && peek() !== '}') {
			const ts = collect([';']);
			expect(';');
			const names = ts.filter((t) => /^[A-Za-z_]\w*$/.test(t.text));
			const member = names.at(-1);
			if (member)
				members.push({
					name: member.text,
					type:
						ts
							.slice(0, ts.indexOf(member))
							.map((t) => t.text)
							.join(' ') + (ts.some((t) => t.text === '[') ? '[]' : '')
				});
			else error('Expected a struct member.');
		}
		expect('}');
		const end = expect(';');
		scope.structs.set(name.text, { name, parent, members, range: { start, end: end.end } });
	}
	function assignment(scope: Scope, start: number) {
		const ts = collect([';']);
		const end = expect(';');
		let index = 0,
			isDefault = false;
		if (ts[0]?.text === 'default') {
			isDefault = true;
			index++;
		}
		if (['posedge', 'negedge', 'bothedge', 'level', 'nonsticky'].includes(ts[index]?.text)) {
			const modifier = ts[index++];
			const name = ts[index];
			if (name)
				scope.assignments.push({
					name: name.text,
					nameToken: name,
					value: [{ ...modifier, text: 'true' }],
					isDefault,
					range: { start, end: end.end }
				});
			return;
		}
		const eq = ts.findIndex((t) => t.text === '=');
		const lhs = ts.slice(index, eq < 0 ? undefined : eq);
		const arrow = lhs.findIndex((t) => t.text === '->');
		const name = lhs.at(-1);
		if (!name) {
			error('Expected a property assignment.');
			return;
		}
		if (arrow < 0 && lhs.length !== 1) error('Expected a property name.', lhs[0]);
		scope.assignments.push({
			name: name.text,
			nameToken: name,
			target:
				arrow < 0
					? undefined
					: lhs
							.slice(0, arrow)
							.map((t) => t.text)
							.join(''),
			value: eq < 0 ? [{ ...name, text: 'true' }] : ts.slice(eq + 1),
			implicit: eq < 0,
			range: { start, end: end.end },
			isDefault
		});
	}
	function body(parent?: Scope): Scope {
		const scope: Scope = {
			parent,
			definitions: new Map(),
			instances: [],
			assignments: [],
			enums: new Map(),
			structs: new Map()
		};
		while (pos < tokens.length && peek() !== '}') {
			const at = pos,
				start = current().start;
			let keyword = peek();
			let external = false;
			if (keyword === 'external' || keyword === 'internal') {
				take();
				external = true;
				keyword = peek();
			}
			if (componentKinds.has(keyword as ComponentKind)) {
				const kind = take().text as ComponentKind;
				let name: Token | undefined;
				if (peek() !== '{') name = id();
				const params = parameters();
				const open = expect('{');
				const nested = body(scope);
				const close = expect('}');
				const def: Definition = {
					kind,
					name: name?.text,
					nameToken: name,
					scope: nested,
					parameters: params,
					range: { start, end: close.end },
					bodyRange: { start: open.end, end: close.start },
					generated: tokens.slice(at, pos).some((t) => t.generated)
				};
				if (name) {
					if (scope.definitions.has(name.text))
						error(`Duplicate component type ${name.text}.`, name);
					scope.definitions.set(name.text, def);
				}
				if (peek() === 'external' || peek() === 'internal') take();
				if (peek() === ';') {
					const end = take();
					def.range.end = end.end;
					if (!name) error('An anonymous component needs an instance name.', close);
				} else {
					instances(scope, start, def);
					def.range.end = (tokens[pos - 1] ?? close).end;
				}
			} else if (keyword === 'enum') {
				take();
				enumDef(scope, start);
			} else if (keyword === 'property') {
				if (parent) error('User-defined properties must be declared in the root scope.');
				take();
				propertyDef(start);
			} else if (keyword === 'struct' || keyword === 'abstract') {
				if (keyword === 'abstract') take();
				expect('struct');
				structDef(scope, start);
			} else if (keyword === 'constraint') {
				take();
				collect(['{']);
				expect('{');
				let depth = 1;
				while (pos < tokens.length && depth) {
					const t = take();
					if (t.text === '{') depth++;
					if (t.text === '}') depth--;
				}
				collect([';']);
				expect(';');
				error(
					'Verification constraints are preserved but are not evaluated.',
					tokens[at],
					'CONSTRAINT_NOT_EVALUATED'
				);
				diagnostics[diagnostics.length - 1].severity = 'warning';
			} else if (keyword === ';') {
				take();
			} else if (
				external ||
				keyword === 'alias' ||
				(/^[A-Za-z_]\w*$/.test(keyword ?? '') &&
					(peek(1) === '#' || /^[A-Za-z_]\w*$/.test(peek(1) ?? '')) &&
					!['default', 'posedge', 'negedge', 'bothedge', 'level', 'nonsticky'].includes(
						keyword ?? ''
					))
			) {
				let alias: string | undefined;
				if (peek() === 'alias') {
					take();
					alias = id().text;
				}
				const type = id();
				instances(scope, start, undefined, type.text, alias);
			} else assignment(scope, start);
			if (pos === at) {
				error('Parser could not read this statement.');
				take();
			}
		}
		return scope;
	}
	const scope = body();
	if (pos < tokens.length) error('Unexpected closing brace.');
	return { scope, properties };
}
