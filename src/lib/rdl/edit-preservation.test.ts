import { describe, it, expect } from 'vitest';
import { compile, applyEdit } from './index';
const map = 'addrmap device { reg { field { sw = rw; } value[3:0]; } control; };\n';
describe('declaration source preservation', () => {
	it('changes only a UDP default literal and preserves comments and CRLF', () => {
		const source =
			'property label {\r\n\ttype = string; // Keep type\r\n\tcomponent = reg | field;\r\n\tdefault = "before"; // Keep this\r\n};\r\n' +
			map;
		expect(
			applyEdit(compile(source), {
				type: 'upsert-property-definition',
				previousName: 'label',
				definition: {
					name: 'label',
					type: 'string',
					components: ['reg', 'field'],
					defaultText: '"after"'
				}
			})
		).toBe(source.replace('"before"', '"after"'));
	});
	it('keeps unchanged enum values in their original radix and preserves comments on rename', () => {
		const source =
			'enum State {\n    OFF = 0x0; // Off note\n    ON = 0x1 { desc = "On note"; };\n};\n' + map;
		expect(
			applyEdit(compile(source), {
				type: 'upsert-enum',
				previousName: 'State',
				definition: {
					name: 'State',
					members: [
						{ name: 'IDLE', value: '0' },
						{ name: 'ON', value: '1' }
					]
				}
			})
		).toBe(source.replace('OFF', 'IDLE'));
	});
	it('edits only the enum description text', () => {
		const source = 'enum State { OFF = 0; ON = 1 { desc = "Before"; /* Preserve */ }; };\n' + map;
		expect(
			applyEdit(compile(source), {
				type: 'upsert-enum',
				definition: {
					name: 'State',
					members: [
						{ name: 'OFF', value: '0' },
						{ name: 'ON', value: '1', description: 'After' }
					]
				}
			})
		).toBe(source.replace('"Before"', '"After"'));
	});
	it('adds and removes enum members without replacing other text', () => {
		const source = 'enum State {\n    OFF = 0x0; // Keep\n    ON = 1;\n};\n' + map;
		const next = applyEdit(compile(source), {
			type: 'upsert-enum',
			definition: {
				name: 'State',
				members: [
					{ name: 'OFF', value: '0' },
					{ name: 'ON', value: '1' },
					{ name: 'WAIT', value: '2' }
				]
			}
		});
		expect(next).toBe(source.replace('    ON = 1;', '    ON = 1;\n    WAIT = 2;'));
		expect(
			applyEdit(compile(next), {
				type: 'upsert-enum',
				definition: {
					name: 'State',
					members: [
						{ name: 'OFF', value: '0' },
						{ name: 'ON', value: '1' }
					]
				}
			})
		).toBe(source);
	});
	it('updates and removes a compact reset without leaving an equals sign', () => {
		const source = 'addrmap device { reg { field {} value[3:0] = 0; } control; };';
		expect(
			applyEdit(compile(source), {
				type: 'set-property',
				nodeId: 'device.control.value',
				property: 'reset',
				value: '3'
			})
		).toBe(source.replace('= 0', '= 3'));
		expect(
			applyEdit(compile(source), {
				type: 'remove-property',
				nodeId: 'device.control.value',
				property: 'reset'
			})
		).toBe(source.replace('= 0', ''));
	});
	it('updates a bare boolean binding without corrupting its statement', () => {
		const source = 'addrmap device { reg { field { sticky; } value; } control; };';
		expect(
			applyEdit(compile(source), {
				type: 'set-property',
				nodeId: 'device.control.value',
				property: 'sticky',
				value: 'false'
			})
		).toBe(source.replace('sticky;', 'sticky = false;'));
	});
});
