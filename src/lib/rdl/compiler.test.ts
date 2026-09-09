import { describe, expect, it } from 'vitest';
import { applyEdit, compile, SAMPLE_RDL } from './index';
import { evaluate } from './expression';
const document = (body: string) => `addrmap test { ${body} };`;
const register = (body: string) => document(`reg { ${body} } control @ 0x20;`);
describe('SystemRDL compiler', () => {
	it('compiles the sample with exact source locations and addresses', () => {
		const c = compile(SAMPLE_RDL);
		expect(c.diagnostics).toEqual([]);
		expect(c.nodes).toHaveLength(7);
		expect(c.nodes.find((n) => n.id === 'device.status')?.address).toBe(4n);
		expect(c.nodes.find((n) => n.name === 'mode')?.width).toBe(2);
	});
	it('evaluates arbitrary precision constants without Number loss', () => {
		expect(evaluate("64'hffff_ffff_ffff_ffff")).toBe(18446744073709551615n);
		expect(evaluate('(3 + 5) * 2 << 1')).toBe(32n);
		expect(evaluate('true ? 7 : 9')).toBe(7n);
		expect(evaluate("'{ 1, 2, 3 }")).toEqual([1n, 2n, 3n]);
		expect(evaluate("Pair'{ low: 1, high: 2 }")).toEqual({ low: 1n, high: 2n });
	});
	it('resolves component types and parameter overrides', () => {
		const c = compile(
			`reg Cell #(longint W = 32) { regwidth = W; field { sw=rw; } data[7:0]; }; addrmap test { Cell #(.W(64)) value @ 0x10000000000000; };`
		);
		expect(c.diagnostics).toEqual([]);
		expect(c.nodes[1].width).toBe(64);
		expect(c.nodes[1].address).toBe(0x10000000000000n);
	});
	it('applies lexical defaults without attaching unbound UDP defaults', () => {
		const c = compile(
			`property tag { type=string; component=reg; default="hello"; }; addrmap test { default regwidth=64; reg { field {} value; } data; };`
		);
		expect(c.valid).toBe(true);
		expect(c.nodes[1].width).toBe(64);
		expect(c.nodes[1].properties.tag).toBeUndefined();
	});
	it('validates UDP scalar, array and struct values', () => {
		const c = compile(
			`struct Pair { longint low; boolean enabled; }; property pair { type=Pair; component=reg; }; property labels { type=string[]; component=reg; }; addrmap test { reg { pair=Pair'{low:3,enabled:true}; labels='{"a","b"}; field {} value; } data; };`
		);
		expect(c.diagnostics).toEqual([]);
		expect(c.nodes[1].properties.pair.value).toEqual({ low: 3n, enabled: true });
		expect(c.nodes[1].properties.labels.value).toEqual(['a', 'b']);
	});
	it('rejects incorrect UDP type and placement', () => {
		const c = compile(
			`property flag { type=boolean; component=field; }; addrmap test { flag=true; reg {field {flag=3;} value;} data; };`
		);
		expect(c.diagnostics.map((d) => d.code)).toContain('PROPERTY_COMPONENT');
		expect(c.diagnostics.map((d) => d.code)).toContain('PROPERTY_TYPE');
	});
	it('rejects invalid input with line locations', () => {
		const c = compile('addrmap test {\n reg { field { reset = 8; } data[1:0]; } control;\n};');
		expect(c.valid).toBe(false);
		expect(c.diagnostics[0].line).toBe(2);
		expect(c.diagnostics.map((d) => d.code)).toContain('RESET_WIDTH');
	});
	it('rejects field and address overlap', () => {
		expect(
			compile(register('field {} a[3:0]; field {} b[2:1];')).diagnostics.map((d) => d.code)
		).toContain('FIELD_OVERLAP');
		expect(
			compile(document('reg {field {} a;} one @ 0; reg {field {} b;} two @ 0;')).diagnostics.map(
				(d) => d.code
			)
		).toContain('ADDRESS_OVERLAP');
	});
	it('handles arrays and explicit strides', () => {
		const c = compile(
			document('reg {field {} value;} bank[4] @ 0x10 += 8; reg {field {} value;} tail;')
		);
		expect(c.diagnostics).toEqual([]);
		expect(c.nodes.find((n) => n.name === 'bank')?.size).toBe(28n);
		expect(c.nodes.find((n) => n.name === 'tail')?.address).toBe(44n);
	});
	it('reports includes only when present and ignores commented directives', () => {
		expect(compile(SAMPLE_RDL).diagnostics).toEqual([]);
		expect(compile('// `include "unused.rdl"\n' + SAMPLE_RDL).valid).toBe(true);
		expect(compile('`include "other.rdl"\n' + SAMPLE_RDL).diagnostics.map((d) => d.code)).toContain(
			'EXTERNAL_INCLUDE'
		);
	});
	it('supports object macros and conditionals', () => {
		const c = compile(
			'`define WIDTH 16\n`ifdef WIDTH\naddrmap test {reg {regwidth=`WIDTH; field {} data;} value;};\n`else\ninvalid\n`endif\n'
		);
		expect(c.diagnostics).toEqual([]);
		expect(c.nodes[1].width).toBe(16);
		expect(c.nodes[1].editable).toBe(false);
	});
	it('retains numeric widths through concatenation, repetition and reduction', () => {
		expect(evaluate("{8'h01,8'h02}")).toBe(258n);
		expect(evaluate("{2{8'h01}}")).toBe(257n);
		expect(evaluate("&8'h01")).toBe(false);
		expect(evaluate("~8'h01")).toBe(254n);
		expect(evaluate("8'hff + 8'h01")).toBe(0n);
		expect(evaluate("8'(0x101)")).toBe(1n);
		expect(evaluate("(8'hff + 8'h01) + 16'h00")).toBe(256n);
	});
	it('applies macros in source order with arguments and ignores comments', () => {
		const c = compile(
			'`define W 16\nreg Small { regwidth=`W; field {} data; };\n`undef W\n`define W 32\n`define PLUS(a,b) ((a)+(b))\naddrmap test { Small first; reg {regwidth=`PLUS(`W,32);field {} data;} second;};'
		);
		expect(c.diagnostics).toEqual([]);
		expect(c.nodes.find((n) => n.name === 'first')?.width).toBe(16);
		expect(c.nodes.find((n) => n.name === 'second')?.width).toBe(64);
		expect(compile('// <% ignored %>\n' + SAMPLE_RDL).valid).toBe(true);
		expect(compile('/*\n`include "ignored.rdl"\n*/\n' + SAMPLE_RDL).valid).toBe(true);
	});
	it('validates post assignments before elaboration', () => {
		expect(
			compile(document('reg {field {} value;} control; control.value->reset=2;')).diagnostics.map(
				(d) => d.code
			)
		).toContain('RESET_WIDTH');
		const c = compile(
			document(
				'reg {field {} value;} control; control->regwidth=64; reg {field {} value;} nextreg;'
			)
		);
		expect(c.valid).toBe(true);
		expect(c.nodes.find((n) => n.name === 'nextreg')?.address).toBe(8n);
	});
	it('reports unknown properties and unresolved references', () => {
		expect(
			compile(register('field { mystery=1; } value;')).diagnostics.map((d) => d.code)
		).toContain('UNKNOWN_PROPERTY');
		expect(
			compile(register('field { next=missing; } value;')).diagnostics.map((d) => d.code)
		).toContain('REFERENCE');
	});
});
describe('source edits', () => {
	it('changes only the literal and preserves CRLF comments and spacing', () => {
		const source =
			'addrmap test {\r\n    reg { field { reset   = 0x0; // Keep this\r\n    } value[3:0]; } data;\r\n};\r\n';
		const next = applyEdit(compile(source), {
			type: 'set-property',
			nodeId: 'test.data.value',
			property: 'reset',
			value: '0x3'
		});
		expect(next).toBe(source.replace('0x0', '0x3'));
	});
	it('changes field range without rewriting the declaration', () => {
		const source = register('field { reset=0; } value[3:0];');
		expect(
			applyEdit(compile(source), { type: 'set-bits', nodeId: 'test.control.value', msb: 7, lsb: 0 })
		).toBe(source.replace('[3:0]', '[7:0]'));
	});
	it('rejects invalid edit transactions', () => {
		const c = compile(register('field {reset=0;} value[1:0];'));
		expect(() =>
			applyEdit(c, {
				type: 'set-property',
				nodeId: 'test.control.value',
				property: 'reset',
				value: '8'
			})
		).toThrow('Reset value');
		expect(c.source).toContain('reset=0');
	});
	it('supports adding and removing properties and components', () => {
		let c = compile(register('field {} value[0:0];'));
		let source = applyEdit(c, {
			type: 'set-property',
			nodeId: 'test.control.value',
			property: 'desc',
			value: '"Hello"'
		});
		c = compile(source);
		expect(c.nodes[2].properties.desc.value).toBe('Hello');
		source = applyEdit(c, {
			type: 'remove-property',
			nodeId: 'test.control.value',
			property: 'desc'
		});
		expect(compile(source).nodes[2].properties.desc).toBeUndefined();
		source = applyEdit(compile(source), {
			type: 'add-component',
			parentId: 'test.control',
			kind: 'field',
			name: 'extra'
		});
		expect(compile(source).nodes.find((n) => n.name === 'extra')?.lsb).toBe(1);
		source = applyEdit(compile(source), { type: 'delete-component', nodeId: 'test.control.extra' });
		expect(compile(source).nodes.find((n) => n.name === 'extra')).toBeUndefined();
	});
	it('supports UDP and enum declaration commands', () => {
		let source = applyEdit(compile(SAMPLE_RDL), {
			type: 'upsert-property-definition',
			definition: { name: 'flag', type: 'boolean', components: ['field'], defaultText: 'false' }
		});
		expect(compile(source).properties.find((p) => p.name === 'flag')?.defaultValue).toBe(false);
		source = applyEdit(compile(source), {
			type: 'upsert-enum',
			definition: {
				name: 'State',
				members: [
					{ name: 'OFF', value: '0' },
					{ name: 'ON', value: '1' }
				]
			}
		});
		expect(compile(source).enums.find((e) => e.name === 'State')?.members).toHaveLength(2);
	});
});

describe('binding, layout and scope regressions', () => {
	it('binds an unassigned UDP and uses its declaration default', () => {
		const source = `property label { type=string; component=reg; }; property flag { type=boolean; component=reg; default=false; }; addrmap test { reg { flag; field {} value; } data; };`;
		let c = compile(source);
		expect(c.valid).toBe(true);
		expect(c.nodes[1].properties.flag.value).toBe(false);
		c = compile(
			applyEdit(c, { type: 'set-property', nodeId: 'test.data', property: 'label', value: '' })
		);
		expect(c.valid).toBe(true);
		expect(c.nodes[1].properties.label.unassigned).toBe(true);
		c = compile(
			applyEdit(c, { type: 'set-property', nodeId: 'test.data', property: 'label', value: '"set"' })
		);
		expect(c.nodes[1].properties.label.value).toBe('set');
	});
	it('does not confuse user identifiers with Object prototype keys', () => {
		const c = compile(
			'property constructor {type=boolean;component=reg;}; property __proto__ {type=string;component=reg;}; addrmap test {reg {constructor=true;__proto__="safe";field {} value;} data;};'
		);
		expect(c.diagnostics).toEqual([]);
		expect(c.nodes[1].properties['constructor'].value).toBe(true);
		expect(c.nodes[1].properties.__proto__.value).toBe('safe');
	});
	it('packs implicit fields from MSB in msb0 maps', () => {
		const c = compile('addrmap test {msb0;reg {field {} first[4];field {} next[4];} data;};');
		expect(c.diagnostics).toEqual([]);
		expect(c.nodes.find((n) => n.name === 'first')?.lsb).toBe(28);
		expect(c.nodes.find((n) => n.name === 'next')?.msb).toBe(27);
	});
	it('aligns complete arrays in fullalign mode', () => {
		const c = compile(
			'addrmap test {addressing=fullalign;reg {field {} value;} first; reg {field {} value;} bank[3];};'
		);
		expect(c.diagnostics).toEqual([]);
		expect(c.nodes.find((n) => n.name === 'bank')?.offset).toBe(16n);
	});
	it('keeps compact registers aligned to access width', () => {
		const c = compile(
			'addrmap test {addressing=compact;default accesswidth=32;reg {field {} value;} first;reg {regwidth=64;field {} value;} second;};'
		);
		expect(c.diagnostics).toEqual([]);
		expect(c.nodes.find((n) => n.name === 'second')?.offset).toBe(4n);
	});
	it('exposes inherited struct members and distinct enum source identities', () => {
		const c = compile(
			'struct Base {boolean enabled;}; struct Extended:Base {longint count;}; enum Mode {OFF=0;}; addrmap test {enum Mode {ON=1;}; reg {field {} value;} data;};'
		);
		expect(c.valid).toBe(true);
		expect(c.structs?.find((s) => s.name === 'Extended')?.members.map((m) => m.name)).toEqual([
			'enabled',
			'count'
		]);
		expect(c.enums[0].scopeRange).not.toEqual(c.enums[1].scopeRange);
		const updated = compile(
			applyEdit(c, {
				type: 'upsert-enum',
				previousStart: c.enums[1].range.start,
				definition: { name: 'Mode', members: [{ name: 'ON', value: '2' }] }
			})
		);
		expect(updated.enums.map((e) => e.members[0].value)).toEqual([0n, 2n]);
	});
	it('rejects undeclared UDP types before binding', () => {
		expect(compile('property invalid {type=Missing;component=reg;};' + SAMPLE_RDL).valid).toBe(
			false
		);
	});
});

it('reports external includes even in inactive branches', () => {
	const c = compile('`ifdef NEVER_DEFINED\n`include "other.rdl"\n`endif\n' + SAMPLE_RDL);
	expect(c.diagnostics.map((d) => d.code)).toContain('EXTERNAL_INCLUDE');
});
