import { describe, expect, it } from 'vitest';
import { compile, applyEdit } from './index';

function valid(source: string) {
	const result = compile(source);
	expect(result.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
	expect(result.valid).toBe(true);
	return result;
}

describe('independent language acceptance', () => {
	it('keeps addresses above the safe JavaScript number range exact', () => {
		const result = valid('addrmap chip { reg { field {} flag; } probe @ 0x20000000000004; };');
		expect(result.nodes.find((node) => node.name === 'probe')?.address).toBe(0x20000000000004n);
	});
	it('computes nested byte addresses without flattening source scope', () => {
		const result = valid(
			'addrmap chip { regfile { reg { field {} flag; } probe @ 0x8; } bank @ 0x40; };'
		);
		expect(result.nodes.find((node) => node.name === 'probe')?.address).toBe(0x48n);
	});
	it('validates custom string, boolean, integer, enum and list values', () => {
		const result = valid(`enum state_e { idle = 0; running = 1; };
property note { type = string; component = reg; };
property enabled { type = boolean; component = reg; default = true; };
property count { type = longint unsigned; component = reg; };
property state { type = state_e; component = reg; };
property labels { type = string[]; component = reg; };
addrmap chip { reg { note = "two, values"; enabled; count = 0x20000000000001; state = state_e::running; labels = '{"one", "two"}; field {} flag; } probe; };`);
		const properties = result.nodes.find((node) => node.name === 'probe')!.properties;
		expect(properties.note.value).toBe('two, values');
		expect(properties.enabled.value).toBe(true);
		expect(properties.count.value).toBe(0x20000000000001n);
		expect(properties.labels.value).toEqual(['one', 'two']);
	});
	it('does not bind declared custom defaults automatically', () => {
		const result = valid(
			'property custom {type = boolean; component = reg; default = true;}; addrmap chip {reg {field {} flag;} probe;};'
		);
		expect(result.nodes.find((node) => node.name === 'probe')?.properties.custom).toBeUndefined();
	});
	it('rejects unsupported constructs only outside comments and strings', () => {
		valid(
			'addrmap chip { desc = "`include and <% are documentation"; /* `include "x.rdl" */ reg { field {} flag; } probe; };'
		);
		expect(compile('`include "other.rdl"\naddrmap chip {};').valid).toBe(false);
		expect(compile('<% print "text"; %> addrmap chip {};').valid).toBe(false);
	});
	it('preserves all unrelated bytes for a field property change', () => {
		const source =
			'\uFEFF// A comment\r\naddrmap chip {\r\n\treg {\r\n\t\tfield { reset = 0x00; /* keep */ } flag[7:0];\r\n\t} probe;\r\n};\r\n';
		const result = valid(source);
		const output = applyEdit(result, {
			type: 'set-property',
			nodeId: 'chip.probe.flag',
			property: 'reset',
			value: '0x03'
		});
		expect(output).toBe(source.replace('0x00', '0x03'));
	});
	it('rejects a custom property on the wrong component', () => {
		expect(
			compile(
				'property label { type = string; component = field; }; addrmap chip { label = "invalid"; };'
			).valid
		).toBe(false);
	});
	it('rejects an invalid unbound custom default', () => {
		expect(
			compile(
				'property label { type = boolean; component = field; default = "invalid"; }; addrmap chip {};'
			).valid
		).toBe(false);
	});
});
