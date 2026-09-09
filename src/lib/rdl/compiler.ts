import { Effect } from 'effect';
import { diagnostic, preprocess, type Token } from './lexer';
import { evaluate, integer } from './expression';
import {
	parse,
	type Assignment,
	type Definition,
	type Instance,
	type ParsedDocument,
	type Scope
} from './parser';
import { builtinProperties } from './properties';
import type {
	Compilation,
	Diagnostic,
	EnumDefinition,
	PropertyDefinition,
	RdlNode,
	RdlValue,
	SourceRange
} from './types';
const textOf = (source: string, ts: Token[]) =>
	ts.length ? source.slice(ts[0].start, ts.at(-1)!.end) : '';
function lookup<T>(
	scope: Scope,
	key: 'definitions' | 'enums' | 'structs',
	name: string
): T | undefined {
	let at: Scope | undefined = scope;
	while (at) {
		const result = at[key].get(name);
		if (result) return result as T;
		at = at.parent;
	}
	return undefined;
}
export const compileEffect = Effect.fn('rdl.compile')(function* (source: string) {
	const diagnostics: Diagnostic[] = [];
	if (source.length > 8_000_000)
		return {
			source,
			roots: [],
			nodes: [],
			diagnostics: [
				diagnostic(
					source,
					{ start: 0, end: 0 },
					'SOURCE_SIZE',
					'The file exceeds the 8 MB editor limit.'
				)
			],
			properties: [],
			enums: [],
			valid: false
		} satisfies Compilation;
	const tokens = yield* Effect.sync(() => preprocess(source, diagnostics));
	const parsed = yield* Effect.sync(() => parse(source, tokens, diagnostics));
	return yield* Effect.sync(() => elaborate(source, parsed, diagnostics));
});
export function compile(source: string): Compilation {
	try {
		return Effect.runSync(compileEffect(source));
	} catch (cause) {
		return {
			source,
			roots: [],
			nodes: [],
			diagnostics: [
				diagnostic(
					source,
					{ start: 0, end: 0 },
					'COMPILER_ERROR',
					cause instanceof Error ? cause.message : 'The document could not be compiled.'
				)
			],
			properties: [],
			enums: [],
			valid: false
		};
	}
}
function elaborate(source: string, parsed: ParsedDocument, diagnostics: Diagnostic[]): Compilation {
	const nodes: RdlNode[] = [],
		roots: RdlNode[] = [],
		enums: EnumDefinition[] = [],
		properties: PropertyDefinition[] = [];
	const enumValues = new Map<Scope, Map<string, RdlValue>>();
	const scopeRanges = new Map<Scope, SourceRange>();
	const report = (range: SourceRange, code: string, message: string) =>
		diagnostics.push(diagnostic(source, range, code, message));
	function resolveEnum(scope: Scope, name: string): RdlValue | undefined {
		let at: Scope | undefined = scope;
		while (at) {
			const value = enumValues.get(at)?.get(name);
			if (value !== undefined) return value;
			at = at.parent;
		}
		return undefined;
	}
	function evalTokens(
		ts: Token[],
		scope: Scope,
		params: Map<string, RdlValue>,
		fallback: RdlValue = 0n
	): RdlValue {
		try {
			return evaluate(ts, (n) => params.get(n) ?? resolveEnum(scope, n));
		} catch (cause) {
			report(
				ts[0] ?? { start: 0, end: 0 },
				'EXPRESSION',
				cause instanceof Error ? cause.message : 'Invalid expression.'
			);
			return fallback;
		}
	}
	const referenceTypes = new Set(['ref', 'addrmap', 'regfile', 'reg', 'field', 'mem', 'signal']);
	function typedTokens(
		tokens: Token[],
		type: string,
		scope: Scope,
		params: Map<string, RdlValue>
	): RdlValue {
		if (referenceTypes.has(type.replace(/\[\]$/, ''))) {
			try {
				return evaluate(tokens, (name) => params.get(name) ?? resolveEnum(scope, name) ?? name);
			} catch (cause) {
				report(
					tokens[0] ?? { start: 0, end: 0 },
					'EXPRESSION',
					cause instanceof Error ? cause.message : 'Invalid expression.'
				);
				return 0n;
			}
		}
		return evalTokens(tokens, scope, params);
	}

	function readEnums(scope: Scope, scopeRange: SourceRange = { start: 0, end: source.length }) {
		scopeRanges.set(scope, scopeRange);
		const values = new Map<string, RdlValue>();
		enumValues.set(scope, values);
		for (const def of scope.enums.values()) {
			let next = 0n;
			const output: EnumDefinition = {
				name: def.name.text,
				scopeRange,
				nameRange: def.name,
				range: def.range,
				bodyRange: def.bodyRange,
				members: [],
				editable: !def.name.generated
			};
			const names = new Set<string>();
			for (const member of def.members) {
				if (names.has(member.name.text))
					report(member.name, 'DUPLICATE_ENUM', `Duplicate enum member ${member.name.text}.`);
				names.add(member.name.text);
				let value = next;
				try {
					if (member.value.length)
						value = integer(
							evaluate(
								member.value,
								(n) =>
									values.get(`${def.name.text}::${n}`) ?? values.get(n) ?? resolveEnum(scope, n)
							)
						);
				} catch (cause) {
					report(
						member.name,
						'ENUM_VALUE',
						cause instanceof Error ? cause.message : 'Invalid enum value.'
					);
				}
				if (value < 0n) report(member.name, 'ENUM_VALUE', 'Enum values must be non-negative.');
				if (output.members.some((m) => m.value === value))
					report(member.name, 'ENUM_VALUE', 'Enum values must be unique.');
				output.members.push({
					name: member.name.text,
					nameRange: member.name,
					range: member.range,
					value,
					valueRange: member.value.length
						? { start: member.value[0].start, end: member.value.at(-1)!.end }
						: undefined,
					description: member.description
						? String(evalTokens(member.description, scope, new Map(), ''))
						: undefined
				});
				values.set(`${def.name.text}::${member.name.text}`, value);
				next = value + 1n;
			}
			if (!output.members.length)
				report(def.name, 'ENUM_EMPTY', 'An enum must contain at least one member.');
			enums.push(output);
		}
		for (const def of scope.definitions.values()) readEnums(def.scope, def.range);
		for (const inst of scope.instances)
			if (inst.definition && !inst.definition.name)
				readEnums(inst.definition.scope, inst.definition.range);
	}
	readEnums(parsed.scope);
	for (const prop of parsed.properties) {
		const typeTokens = prop.attrs.get('type') ?? [];
		const type = typeTokens
			.map((t) => t.text)
			.join(' ')
			.replace(/\s*\[\s*\]/g, '[]')
			.trim();
		const components = (prop.attrs.get('component') ?? [])
			.filter((t) => t.text !== '|')
			.map((t) => t.text);
		if (!type) report(prop.name, 'UDP_TYPE', 'A property declaration requires a type.');
		if (!components.length)
			report(prop.name, 'UDP_COMPONENT', 'A property declaration requires allowed components.');
		for (const c of components)
			if (!['all', 'addrmap', 'regfile', 'reg', 'field', 'mem', 'signal', 'constraint'].includes(c))
				report(prop.name, 'UDP_COMPONENT', `Unknown component type ${c}.`);
		if (properties.some((p) => p.name === prop.name.text) || builtinProperties[prop.name.text])
			report(prop.name, 'DUPLICATE_PROPERTY', `Property ${prop.name.text} is already defined.`);
		for (const key of prop.attrs.keys())
			if (!['type', 'component', 'default', 'constraint'].includes(key))
				report(prop.name, 'UDP_ATTRIBUTE', `Unknown property attribute ${key}.`);
		const constraint = prop.attrs
			.get('constraint')
			?.map((t) => t.text)
			.join('');
		if (constraint && constraint !== 'componentwidth')
			report(prop.name, 'UDP_CONSTRAINT', `Unknown property constraint ${constraint}.`);
		const defaults = prop.attrs.get('default');
		properties.push({
			name: prop.name.text,
			type,
			components,
			defaultText: defaults ? textOf(source, defaults) : undefined,
			defaultValue: defaults ? typedTokens(defaults, type, parsed.scope, new Map()) : undefined,
			constraint,
			range: prop.range,
			nameRange: prop.name,
			editable: !prop.name.generated
		});
	}
	const builtinTypes = new Set([
		'number',
		'bit',
		'bit unsigned',
		'longint',
		'longint unsigned',
		'boolean',
		'string',
		'ref',
		'addrmap',
		'regfile',
		'reg',
		'field',
		'mem',
		'signal'
	]);
	for (const property of properties) {
		const base = property.type.replace(/\[\]$/, '');
		if (
			!builtinTypes.has(base) &&
			!lookup(parsed.scope, 'enums', base) &&
			!lookup(parsed.scope, 'structs', base)
		)
			report(property.range, 'UDP_TYPE', `Unknown user-defined property type ${base}.`);
		if (property.constraint && !['bit', 'bit unsigned', 'number'].includes(base))
			report(
				property.range,
				'UDP_CONSTRAINT',
				'The componentwidth constraint requires a bit or number property.'
			);
	}

	function structMembers(
		scope: Scope,
		name: string,
		seen: string[] = []
	): { name: string; type: string }[] {
		const def = lookup<import('./parser').ParsedStruct>(scope, 'structs', name);
		if (!def) {
			if (seen.length)
				report({ start: 0, end: 0 }, 'STRUCT_PARENT', `Unknown parent struct ${name}.`);
			return [];
		}
		if (seen.includes(name)) {
			report(def.name, 'STRUCT_CYCLE', 'Struct inheritance is recursive.');
			return [];
		}
		return [
			...(def.parent ? structMembers(scope, def.parent, [...seen, name]) : []),
			...def.members
		];
	}

	function validateValue(value: RdlValue, type: string, range: SourceRange, scope: Scope): void {
		if (type.endsWith('[]')) {
			if (!Array.isArray(value))
				report(range, 'PROPERTY_TYPE', `Expected an array of ${type.slice(0, -2)}.`);
			else value.forEach((v) => validateValue(v, type.slice(0, -2), range, scope));
			return;
		}
		if (['number', 'longint', 'longint unsigned', 'bit', 'bit unsigned'].includes(type)) {
			if (typeof value !== 'bigint') report(range, 'PROPERTY_TYPE', `Expected a ${type} value.`);
			else if (value < 0n) report(range, 'PROPERTY_RANGE', 'Property values must be non-negative.');
			return;
		}
		if (type === 'boolean') {
			if (typeof value !== 'boolean') report(range, 'PROPERTY_TYPE', 'Expected true or false.');
			return;
		}
		if (type === 'string') {
			if (typeof value !== 'string') report(range, 'PROPERTY_TYPE', 'Expected a quoted string.');
			return;
		}
		const choices: Record<string, string[]> = {
			accesstype: ['na', 'rw', 'wr', 'r', 'w', 'rw1', 'w1'],
			addressingtype: ['compact', 'regalign', 'fullalign'],
			onreadtype: ['rclr', 'rset', 'ruser'],
			onwritetype: ['woset', 'woclr', 'wot', 'wzs', 'wzc', 'wzt', 'wclr', 'wset', 'wuser'],
			precedencetype: ['hw', 'sw']
		};
		if (Object.hasOwn(choices, type)) {
			if (!choices[type].includes(String(value)))
				report(range, 'PROPERTY_TYPE', `Expected one of: ${choices[type].join(', ')}.`);
			return;
		}
		if (['ref', 'addrmap', 'regfile', 'reg', 'field', 'mem', 'signal', 'enum'].includes(type)) {
			if (typeof value !== 'string')
				report(range, 'PROPERTY_TYPE', `Expected a ${type} reference.`);
			return;
		}
		const struct = lookup<import('./parser').ParsedStruct>(scope, 'structs', type);
		if (struct) {
			if (typeof value !== 'object' || Array.isArray(value)) {
				report(range, 'PROPERTY_TYPE', `Expected a ${type} struct value.`);
				return;
			}
			const members = structMembers(scope, type);
			for (const m of members) {
				if (!(m.name in value)) report(range, 'STRUCT_MEMBER', `Missing struct member ${m.name}.`);
				else validateValue(value[m.name], m.type, range, scope);
			}
			for (const key of Object.keys(value))
				if (!members.some((m) => m.name === key))
					report(range, 'STRUCT_MEMBER', `Unknown struct member ${key}.`);
			return;
		}
		if (lookup(scope, 'enums', type)) {
			if (
				typeof value !== 'bigint' ||
				!lookup<import('./parser').ParsedEnum>(scope, 'enums', type)?.members.some(
					(m) => resolveEnum(scope, `${type}::${m.name.text}`) === value
				)
			)
				report(range, 'PROPERTY_TYPE', `Expected a member of enum ${type}.`);
			return;
		}
		report(range, 'PROPERTY_TYPE', `Unknown property type ${type}.`);
	}
	for (const prop of properties)
		if (prop.defaultValue !== undefined)
			validateValue(prop.defaultValue, prop.type, prop.range, parsed.scope);
	type Pending = {
		path: string;
		scope: Scope;
		assignment: Assignment;
		params: Map<string, RdlValue>;
		applied: boolean;
	};
	const pendingAssignments: Pending[] = [];
	function assign(
		node: RdlNode,
		assignment: Assignment,
		scope: Scope,
		params: Map<string, RdlValue>,
		inherited = false
	) {
		const def =
			properties.find((p) => p.name === assignment.name) ?? builtinProperties[assignment.name];
		if (!def) {
			report(assignment.nameToken, 'UNKNOWN_PROPERTY', `Unknown property ${assignment.name}.`);
			return;
		}
		if (!def.components.includes('all' as never) && !def.components.includes(node.kind as never)) {
			if (!inherited)
				report(
					assignment.nameToken,
					'PROPERTY_COMPONENT',
					`Property ${assignment.name} is not valid on ${node.kind}.`
				);
			return;
		}
		const ts = assignment.value;
		const udp = properties.find((p) => p.name === assignment.name);
		const unassigned = !!assignment.implicit && !!udp && udp.defaultValue === undefined;
		let value: RdlValue;
		const raw = ts.map((t) => t.text).join('');
		if (assignment.implicit && udp) value = udp.defaultValue ?? 0n;
		else if (
			['ref', 'addrmap', 'regfile', 'reg', 'field', 'mem', 'signal', 'enum'].includes(def.type) &&
			/^[A-Za-z_]\w*(?:(?:\.|->|::)[A-Za-z_]\w*|\[\d+\])*$/.test(raw)
		)
			value = raw;
		else value = typedTokens(ts, def.type, scope, params);
		if (!unassigned) validateValue(value, def.type, ts[0] ?? assignment.range, scope);
		if (
			!assignment.implicit &&
			lookup(scope, 'enums', def.type) &&
			!raw.startsWith(`${def.type}::`)
		)
			report(ts[0] ?? assignment.range, 'ENUM_TYPE', `Use a named enumerator of ${def.type}.`);
		node.properties[assignment.name] = {
			name: assignment.name,
			value,
			text: unassigned
				? ''
				: assignment.implicit && udp
					? (udp.defaultText ?? '')
					: textOf(source, ts) || 'true',
			unassigned,
			range:
				ts.length && !inherited && !assignment.implicit
					? { start: ts[0].start, end: ts.at(-1)!.end }
					: undefined,
			statementRange: !inherited ? assignment.range : undefined,
			inherited,
			editable: !ts.some((t) => t.generated),
			type: def.type
		};
	}
	function instantiate(
		inst: Instance,
		parent?: RdlNode,
		parentAddress = 0n,
		stack: Definition[] = [],
		outerParams = new Map<string, RdlValue>(),
		inheritedAssignments: Pending[] = []
	): RdlNode | undefined {
		const def =
			inst.definition ?? lookup<Definition>(inst.scope, 'definitions', inst.typeName ?? '');
		if (!def) {
			report(inst.nameToken, 'UNKNOWN_COMPONENT', `Unknown component type ${inst.typeName}.`);
			return;
		}
		if (inst.alias)
			report(
				inst.nameToken,
				'UNSUPPORTED_ALIAS',
				'Alias registers are not supported by this compiler version.'
			);
		if (stack.includes(def) || stack.length > 128) {
			report(inst.nameToken, 'RECURSIVE_COMPONENT', 'Recursive component instantiation.');
			return;
		}
		if (nodes.length >= 100_000) {
			report(inst.nameToken, 'NODE_LIMIT', 'The document exceeds the 100,000 component limit.');
			return;
		}
		const params = new Map(outerParams);
		for (const p of def.parameters) {
			const value = inst.parameters.get(p.name) ?? p.value;
			if (!value.length)
				report(inst.nameToken, 'PARAMETER', `Parameter ${p.name} requires a value.`);
			else {
				const evaluated = typedTokens(value, p.type, inst.scope, params);
				validateValue(evaluated, p.type, inst.nameToken, inst.scope);
				params.set(p.name, evaluated);
			}
		}
		for (const name of inst.parameters.keys())
			if (!def.parameters.some((p) => p.name === name))
				report(inst.nameToken, 'PARAMETER', `Unknown parameter ${name}.`);
		const node: RdlNode = {
			id: parent ? `${parent.id}.${inst.name}` : inst.name,
			name: inst.name,
			kind: def.kind,
			typeName: def.name,
			parentId: parent?.id,
			dimensions: [],
			properties: Object.create(null),
			children: [],
			range: inst.range,
			nameRange: inst.nameToken,
			bodyRange: def.bodyRange,
			addressRange: inst.addressRange,
			bitRange: inst.bitRange,
			editable: !inst.generated && !def.generated
		};
		if (nodes.some((n) => n.id === node.id))
			report(inst.nameToken, 'DUPLICATE_INSTANCE', `Duplicate instance ${inst.name}.`);
		nodes.push(node);
		const lineage: Scope[] = [];
		let scope: Scope | undefined = def.scope;
		while (scope) {
			lineage.unshift(scope);
			scope = scope.parent;
		}
		for (const s of lineage)
			for (const a of s.assignments) if (a.isDefault && !a.target) assign(node, a, s, params, true);
		const activeAssignments = [...inheritedAssignments];
		for (const a of def.scope.assignments) {
			if (a.target) {
				const pending = {
					path: `${node.id}.${a.target}`,
					scope: def.scope,
					assignment: a,
					params,
					applied: false
				};
				activeAssignments.push(pending);
				pendingAssignments.push(pending);
			} else if (!a.isDefault) assign(node, a, def.scope, params);
		}
		if (inst.reset.length)
			assign(
				node,
				{
					name: 'reset',
					nameToken: inst.reset[0],
					value: inst.reset,
					range: { start: inst.reset[0].start, end: inst.reset.at(-1)!.end },
					isDefault: false
				},
				def.scope,
				params
			);
		for (const pending of activeAssignments)
			if (pending.path === node.id) {
				assign(node, pending.assignment, pending.scope, pending.params);
				pending.applied = true;
			}
		for (const [name, spec] of Object.entries(builtinProperties))
			if (spec.defaultText && spec.components.includes(node.kind) && !node.properties[name])
				node.properties[name] = {
					name,
					type: spec.type,
					value: evaluate(spec.defaultText),
					text: spec.defaultText,
					inherited: true,
					editable: true
				};
		function number(ts: Token[], fallback: bigint) {
			try {
				return ts.length ? integer(evalTokens(ts, def!.scope, params)) : fallback;
			} catch (cause) {
				report(
					ts[0] ?? inst.nameToken,
					'NUMBER',
					cause instanceof Error ? cause.message : 'Expected a number.'
				);
				return fallback;
			}
		}
		function numericProp(name: string, fallback: bigint) {
			const value = node.properties[name]?.value;
			try {
				return value === undefined ? fallback : integer(value);
			} catch {
				return fallback;
			}
		}
		for (const dim of inst.dimensions) {
			const value = number(dim, 1n);
			if (value < 1n || value > 1_000_000n)
				report(
					dim[0] ?? inst.nameToken,
					'ARRAY_SIZE',
					'Array size must be between 1 and 1,000,000.'
				);
			else node.dimensions.push(Number(value));
		}
		if (['reg', 'field', 'signal', 'mem'].includes(node.kind)) {
			const key =
				node.kind === 'reg'
					? 'regwidth'
					: node.kind === 'field'
						? 'fieldwidth'
						: node.kind === 'signal'
							? 'signalwidth'
							: 'memwidth';
			const width = numericProp(key, node.kind === 'reg' ? 32n : 1n);
			if (width < 1n || width > 65536n)
				report(inst.nameToken, 'WIDTH', 'Width must be between 1 and 65,536 bits.');
			node.width = Number(width > 0n && width <= 65536n ? width : 1n);
		}
		if (node.kind === 'field' || node.kind === 'signal') {
			if (inst.bits) {
				const a = number(inst.bits[0], 0n),
					b = number(inst.bits[1], 0n);
				node.lsb = Number(a < b ? a : b);
				node.msb = Number(a > b ? a : b);
				node.width = node.msb - node.lsb + 1;
				if (a > 65535n || b > 65535n)
					report(inst.nameToken, 'FIELD_BOUNDS', 'Field bit indices must be below 65,536.');
			} else if (node.dimensions.length) {
				if (node.dimensions.length > 1)
					report(
						inst.nameToken,
						'FIELD_ARRAY',
						'Fields and signals cannot have multiple dimensions.'
					);
				node.width = node.dimensions[0];
				node.dimensions = [];
			}
		}
		const offset = number(inst.address, 0n);
		if (offset < 0n) report(inst.nameToken, 'ADDRESS', 'Address must be non-negative.');
		node.offset = offset;
		node.address = parentAddress + offset;
		function inherited(name: string): RdlValue | undefined {
			let at: RdlNode | undefined = node;
			while (at) {
				const p = at.properties[name];
				if (p && !p.inherited) return p.value;
				at = nodes.find((n) => n.id === at?.parentId);
			}
			return undefined;
		}
		const addressing = String(inherited('addressing') ?? 'regalign');
		const inheritedAlignment = inherited('alignment');
		if (
			inheritedAlignment !== undefined &&
			(integer(inheritedAlignment) < 1n ||
				(integer(inheritedAlignment) & (integer(inheritedAlignment) - 1n)) !== 0n)
		)
			report(node.nameRange, 'ALIGNMENT', 'Alignment must be a positive power of two.');
		let msb0 = inherited('msb0') === true;
		const directions = def.scope.instances
			.filter((i) => i.bits)
			.map((i) => {
				const a = number(i.bits![0], 0n),
					b = number(i.bits![1], 0n);
				return a === b ? undefined : a < b;
			})
			.filter((d) => d !== undefined);
		if (directions.some((d) => d !== directions[0]))
			report(
				node.nameRange,
				'BIT_ORDER',
				'A register cannot mix ascending and descending field ranges.'
			);
		if (inherited('msb0') === undefined && inherited('lsb0') === undefined && directions.length)
			msb0 = directions[0]!;
		else if (directions.some((d) => d !== msb0))
			report(
				node.nameRange,
				'BIT_ORDER',
				'Field range direction conflicts with the address map bit order.'
			);
		let cursor = 0n,
			bitCursor = msb0 ? (node.width ?? 32) - 1 : 0;
		for (const childInst of def.scope.instances) {
			const child = instantiate(
				childInst,
				node,
				node.address,
				[...stack, def],
				params,
				activeAssignments
			);
			if (!child) continue;
			node.children.push(child);
			if (node.kind === 'reg' && child.kind === 'field') {
				if (child.lsb === undefined) {
					child.lsb = msb0 ? bitCursor - (child.width ?? 1) + 1 : bitCursor;
					child.msb = msb0 ? bitCursor : bitCursor + (child.width ?? 1) - 1;
				}
				bitCursor = msb0 ? (child.lsb ?? 0) - 1 : (child.msb ?? 0) + 1;
				if ((child.msb ?? 0) >= (node.width ?? 32) || (child.lsb ?? 0) < 0)
					report(child.nameRange, 'FIELD_BOUNDS', 'Field extends beyond the register width.');
				for (const prior of node.children.slice(0, -1))
					if (
						prior.kind === 'field' &&
						child.lsb <= (prior.msb ?? 0) &&
						(child.msb ?? 0) >= (prior.lsb ?? 0)
					)
						report(child.nameRange, 'FIELD_OVERLAP', `Field overlaps ${prior.name}.`);
			} else if (child.kind !== 'signal' && child.kind !== 'field') {
				let childOffset = child.offset ?? 0n;
				const count = child.dimensions.reduce((a, b) => a * BigInt(b), 1n);
				let alignment = number(childInst.align, 0n);
				if (childInst.align.length && (alignment < 1n || (alignment & (alignment - 1n)) !== 0n))
					report(
						child.nameRange,
						'ALIGNMENT',
						'Instance alignment must be a positive power of two.'
					);
				if (!alignment && inheritedAlignment !== undefined) alignment = integer(inheritedAlignment);
				if (!alignment) {
					if (child.kind === 'reg' && addressing === 'compact')
						alignment = BigInt(
							Math.ceil(
								Number(child.properties.accesswidth?.value ?? BigInt(child.width ?? 32)) / 8
							)
						);
					else alignment = child.size ?? 1n;
					if (addressing === 'fullalign' && count > 1n) {
						const total = (child.size ?? 1n) * count;
						alignment = 1n;
						while (alignment < total) alignment <<= 1n;
					}
				}

				if (!childInst.address.length) {
					if (alignment > 0n) childOffset = ((cursor + alignment - 1n) / alignment) * alignment;
					else childOffset = cursor;
				}
				const delta = childOffset - (child.offset ?? 0n);
				const shift = (n: RdlNode) => {
					n.address = (n.address ?? 0n) + delta;
					n.children.forEach(shift);
				};
				shift(child);
				child.offset = childOffset;
				const stride = number(childInst.stride, child.size ?? 1n);
				if (stride < (child.size ?? 0n))
					report(
						child.nameRange,
						'ARRAY_STRIDE',
						'Array stride is smaller than the component size.'
					);
				child.size = count > 1n ? stride * (count - 1n) + (child.size ?? 1n) : child.size;
				for (const prior of node.children.slice(0, -1)) {
					if (prior.kind === 'signal' || prior.kind === 'field') continue;
					const a = prior.offset ?? 0n;
					if (
						childOffset < a + (prior.size ?? 0n) &&
						childOffset + (child.size ?? 0n) > a &&
						!childInst.alias
					)
						report(child.nameRange, 'ADDRESS_OVERLAP', `Address range overlaps ${prior.name}.`);
				}
				cursor =
					cursor > childOffset + (child.size ?? 0n) ? cursor : childOffset + (child.size ?? 0n);
			}
		}
		node.size =
			node.kind === 'reg'
				? BigInt(Math.ceil((node.width ?? 32) / 8))
				: node.kind === 'mem'
					? BigInt(Math.ceil((node.width ?? 1) / 8)) * numericProp('mementries', 1n)
					: cursor;
		const reset = node.properties.reset?.value;
		if (typeof reset === 'bigint' && node.width && reset >= 1n << BigInt(node.width))
			report(
				node.properties.reset.range ?? node.nameRange,
				'RESET_WIDTH',
				'Reset value does not fit the field width.'
			);
		for (const p of properties) {
			const v = node.properties[p.name]?.value;
			if (
				p.constraint === 'componentwidth' &&
				typeof v === 'bigint' &&
				node.width &&
				v >= 1n << BigInt(node.width)
			)
				report(
					node.properties[p.name].range ?? node.nameRange,
					'UDP_WIDTH',
					`Property ${p.name} does not fit the component width.`
				);
		}
		if (node.kind === 'reg') {
			const access = numericProp('accesswidth', BigInt(node.width ?? 32));
			if (access < 8n || access > BigInt(node.width ?? 32) || (access & (access - 1n)) !== 0n)
				report(
					inst.nameToken,
					'ACCESS_WIDTH',
					'Access width must be a power of two from 8 bits through the register width.'
				);
		}
		const allowed: Record<string, string[]> = {
			addrmap: ['addrmap', 'regfile', 'reg', 'mem', 'signal'],
			regfile: ['regfile', 'reg', 'mem', 'signal'],
			reg: ['field', 'signal'],
			field: [],
			mem: [],
			signal: []
		};
		for (const child of node.children)
			if (!allowed[node.kind].includes(child.kind))
				report(
					child.nameRange,
					'COMPONENT_NESTING',
					`${child.kind} is not valid inside ${node.kind}.`
				);
		return node;
	}
	let rootInstances = parsed.scope.instances;
	if (!rootInstances.length) {
		const top = [...parsed.scope.definitions.values()].filter((d) => d.kind === 'addrmap').at(-1);
		if (top)
			rootInstances = [
				{
					name: top.name!,
					nameToken: top.nameToken!,
					definition: top,
					scope: parsed.scope,
					range: top.range,
					dimensions: [],
					reset: [],
					address: [],
					stride: [],
					align: [],
					parameters: new Map(),
					generated: top.generated
				}
			];
	}
	const globalAssignments = parsed.scope.assignments
		.filter((a) => a.target)
		.map((a) => ({
			path: a.target!,
			scope: parsed.scope,
			assignment: a,
			params: new Map<string, RdlValue>(),
			applied: false
		}));
	pendingAssignments.push(...globalAssignments);
	for (const inst of rootInstances) {
		const node = instantiate(inst, undefined, 0n, [], new Map(), globalAssignments);
		if (node) roots.push(node);
	}
	if (!roots.length && !diagnostics.some((d) => d.severity === 'error'))
		report(
			{ start: 0, end: Math.min(source.length, 1) },
			'NO_ROOT',
			'The file must define an address map.'
		);
	for (const pending of pendingAssignments)
		if (!pending.applied)
			report(
				pending.assignment.nameToken,
				'REFERENCE',
				`Unknown component ${pending.assignment.target}.`
			);
	function referenceCheck(value: RdlValue, type: string, range: SourceRange, base?: RdlNode): void {
		if (type.endsWith('[]')) {
			if (Array.isArray(value))
				value.forEach((v) => referenceCheck(v, type.slice(0, -2), range, base));
			return;
		}
		if (!referenceTypes.has(type) || typeof value !== 'string') return;
		const [path, property] = value.split('->');
		let target = nodes.find((n) => n.id === path);
		let at = base;
		while (!target && at) {
			target = nodes.find((n) => n.id === `${at!.id}.${path}`);
			at = nodes.find((n) => n.id === at?.parentId);
		}
		if (!target) report(range, 'REFERENCE', `Unknown component reference ${value}.`);
		else if (type !== 'ref' && target.kind !== type)
			report(range, 'REFERENCE_TYPE', `Expected a ${type} reference.`);
		else if (
			property &&
			!Object.hasOwn(target.properties, property) &&
			!Object.hasOwn(builtinProperties, property)
		)
			report(range, 'REFERENCE_PROPERTY', `Unknown property reference ${property}.`);
	}
	for (const property of properties)
		if (property.defaultValue !== undefined)
			referenceCheck(property.defaultValue, property.type, property.range);
	for (const node of nodes)
		for (const p of Object.values(node.properties)) {
			if (p.unassigned) continue;
			if (p.type === 'enum') {
				if (!enums.some((e) => e.name === p.value))
					report(p.range ?? node.nameRange, 'ENUM_REFERENCE', `Unknown enum ${p.value}.`);
			} else referenceCheck(p.value, p.type, p.range ?? node.nameRange, node);
		}
	const structDefinitions = [...scopeRanges.entries()].flatMap(([scope, scopeRange]) =>
		[...scope.structs.values()].map((s) => ({
			name: s.name.text,
			members: structMembers(scope, s.name.text),
			scopeRange
		}))
	);
	return {
		source,
		roots,
		nodes,
		diagnostics,
		properties,
		enums,
		structs: structDefinitions,
		valid: !diagnostics.some((d) => d.severity === 'error')
	};
}
