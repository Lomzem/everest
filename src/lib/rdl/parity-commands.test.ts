import { describe, expect, it } from 'vitest';
import { applyEdit, compile } from './index';
const source = `property doc_group { type=string; component=reg; };
addrmap map {
    reg {
        default sw = rw; // Keep this default comment.
        field {} first[0:0];
        field { sw=r; } second[1:1];
        doc_group = "Controls/Primary";
    } control @ 0x0;
    reg { field {} value; doc_group="Status"; } status @ 0x4;
};`;
describe('desktop action parity', () => {
	it('derives logical folders from doc_group without changing component hierarchy', () => {
		const c = compile(source);
		expect(c.valid).toBe(true);
		expect(c.groups?.map((g) => g.path)).toEqual(['Controls', 'Controls/Primary', 'Status']);
		expect(c.nodes.find((n) => n.name === 'control')?.parentId).toBe('map');
		expect(c.groups?.find((g) => g.path === 'Controls/Primary')?.registerIds).toEqual([
			'map.control'
		]);
	});
	it('changes register default access while retaining explicit field access', () => {
		const next = applyEdit(compile(source), {
			type: 'set-register-access',
			nodeId: 'map.control',
			sw: 'w',
			hw: 'r'
		});
		expect(next).toContain('default sw = w; // Keep this default comment.');
		const c = compile(next);
		expect(c.nodes.find((n) => n.name === 'first')?.properties.sw.value).toBe('w');
		expect(c.nodes.find((n) => n.name === 'second')?.properties.sw.value).toBe('r');
		expect(c.nodes.find((n) => n.name === 'control')?.defaultAccess).toEqual({ sw: 'w', hw: 'r' });
	});
	it('moves and renames logical folders without moving register addresses', () => {
		let c = compile(
			applyEdit(compile(source), { type: 'move-group', path: 'Controls', parentPath: 'Status' })
		);
		expect(c.nodes.find((n) => n.name === 'control')?.groupPath).toBe('Status/Controls/Primary');
		c = compile(applyEdit(c, { type: 'rename-group', path: 'Status/Controls', name: 'Options' }));
		expect(c.nodes.find((n) => n.name === 'control')?.groupPath).toBe('Status/Options/Primary');
		expect(c.nodes.find((n) => n.name === 'control')?.address).toBe(0n);
		expect(c.nodes.find((n) => n.name === 'status')?.address).toBe(4n);
	});
	it('creates a register with all requested details in one valid transaction', () => {
		const next = applyEdit(compile(source), {
			type: 'add-register',
			parentId: 'map',
			name: 'new_register',
			title: 'New register',
			address: '0x8',
			width: 64,
			groupPath: 'Controls'
		});
		const n = compile(next).nodes.find((n) => n.name === 'new_register');
		expect(n?.width).toBe(64);
		expect(n?.children).toEqual([]);
		expect(n?.address).toBe(8n);
		expect(n?.properties.name.value).toBe('New register');
		expect(n?.groupPath).toBe('Controls');
	});
	it('creates the grouping property only when grouping is used', () => {
		const input = 'addrmap map {reg {field {} value;} control;};';
		const next = applyEdit(compile(input), {
			type: 'move-to-group',
			nodeId: 'map.control',
			path: 'Folder'
		});
		expect(compile(next).properties.find((p) => p.name === 'doc_group')?.type).toBe('string');
		expect(compile(next).groups?.[0].path).toBe('Folder');
	});
	it('creates and unlinks field enums atomically', () => {
		let c = compile(source);
		c = compile(
			applyEdit(c, {
				type: 'bind-enum',
				nodeId: 'map.control.first',
				definition: {
					name: 'Choice',
					members: [
						{ name: 'OFF', value: '0' },
						{ name: 'ON', value: '1' }
					]
				}
			})
		);
		expect(c.nodes.find((n) => n.name === 'first')?.properties.encode.value).toBe('Choice');
		c = compile(
			applyEdit(c, {
				type: 'bind-enum',
				nodeId: 'map.control.first',
				previousName: 'Choice',
				definition: { name: 'Choice', members: [] }
			})
		);
		expect(c.nodes.find((n) => n.name === 'first')?.properties.encode).toBeUndefined();
		expect(c.valid).toBe(true);
	});
	it('preserves addresses during physical component moves', () => {
		const input =
			'addrmap map {regfile {reg {field {} value;} control @ 0x8;} group @ 0x0; regfile {} other @ 0x4;};';
		const c = compile(input);
		expect(c.valid).toBe(true);
		const moved = compile(
			applyEdit(c, { type: 'move-component', nodeId: 'map.group.control', parentId: 'map.other' })
		);
		expect(moved.nodes.find((n) => n.id === 'map.other.control')?.address).toBe(8n);
	});
	it('rejects invalid folder and address changes', () => {
		expect(() =>
			applyEdit(compile(source), {
				type: 'move-group',
				path: 'Controls',
				parentPath: 'Controls/Primary'
			})
		).toThrow('inside itself');
		expect(() =>
			applyEdit(compile(source), {
				type: 'add-register',
				parentId: 'map',
				name: 'collision',
				address: '0x0',
				width: 32
			})
		).toThrow('overlaps');
	});
});

it('deletes all registers in a logical folder subtree', () => {
	const c = compile(applyEdit(compile(source), { type: 'delete-group', path: 'Controls' }));
	expect(c.valid).toBe(true);
	expect(c.nodes.some((n) => n.name === 'control')).toBe(false);
	expect(c.nodes.find((n) => n.name === 'status')?.address).toBe(4n);
	expect(c.groups?.map((g) => g.path)).toEqual(['Status']);
});
it('creates an enum member and selects it as reset in one transaction', () => {
	const c = compile(
		applyEdit(compile(source), {
			type: 'bind-enum',
			nodeId: 'map.control.first',
			definition: { name: 'Choice', members: [{ name: 'ON', value: '1' }] },
			resetMember: 'ON'
		})
	);
	const field = c.nodes.find((n) => n.name === 'first');
	expect(field?.properties.reset.value).toBe(1n);
	expect(field?.properties.reset.text).toBe('Choice::ON');
});

it('matches the original default access display fallback without changing declared defaults', () => {
	const c = compile(
		'addrmap map {reg {field {sw=w;hw=r;} value;} first;reg {default sw=rw;field {sw=w;} value;} second;};'
	);
	expect(c.nodes.find((n) => n.name === 'first')?.defaultAccess).toEqual({ sw: 'w', hw: 'r' });
	expect(c.nodes.find((n) => n.name === 'second')?.defaultAccess?.sw).toBe('rw');
});
it('rejects enum values outside the encoded field width', () => {
	const c = compile(
		'enum Choice {HIGH=2;};addrmap map {reg {field {encode=Choice;} value[0:0];} control;};'
	);
	expect(c.diagnostics.map((d) => d.code)).toContain('ENUM_WIDTH');
});
it('renames a bound enum and keeps symbolic reset references valid', () => {
	const input =
		'enum Choice {OFF=0;ON=1;};addrmap map {reg {field {encode=Choice;reset=Choice::ON;} value;} control;};';
	const c = compile(
		applyEdit(compile(input), {
			type: 'bind-enum',
			nodeId: 'map.control.value',
			previousName: 'Choice',
			definition: {
				name: 'Mode',
				members: [
					{ name: 'OFF', value: '0' },
					{ name: 'ON', value: '1' }
				]
			}
		})
	);
	expect(c.valid).toBe(true);
	expect(c.nodes.at(-1)?.properties.encode.value).toBe('Mode');
	expect(c.nodes.at(-1)?.properties.reset.text).toBe('Mode::ON');
});
it('updates an inferred enum reset when its encoding value changes', () => {
	const input =
		'enum Choice {LOW=0;};addrmap map {reg {field {encode=Choice;reset=0;} value;} control;};';
	const c = compile(
		applyEdit(compile(input), {
			type: 'bind-enum',
			nodeId: 'map.control.value',
			previousName: 'Choice',
			definition: { name: 'Choice', members: [{ name: 'LOW', value: '1' }] }
		})
	);
	expect(c.nodes.at(-1)?.properties.reset.value).toBe(1n);
	expect(c.nodes.at(-1)?.properties.reset.text).toBe('Choice::LOW');
});
it('updates a new display name and derived identifier atomically', () => {
	const input = 'addrmap map {reg {name="Old Name";field {} value;} old_name;};';
	const next = compile(
		applyEdit(compile(input), {
			type: 'update-title',
			nodeId: 'map.old_name',
			title: 'New Name',
			deriveIdentifier: true
		})
	);
	expect(next.nodes.find((n) => n.kind === 'reg')?.id).toBe('map.new_name');
	expect(next.nodes.find((n) => n.kind === 'reg')?.properties.name.value).toBe('New Name');
});
it('keeps imported and custom identifiers when their display name changes', () => {
	const input = 'addrmap map {reg {name="Old Name";field {} value;} custom;};';
	const next = compile(
		applyEdit(compile(input), {
			type: 'update-title',
			nodeId: 'map.custom',
			title: 'New Name',
			deriveIdentifier: true
		})
	);
	expect(next.nodes.find((n) => n.kind === 'reg')?.id).toBe('map.custom');
	const imported = compile(
		applyEdit(compile(input), { type: 'update-title', nodeId: 'map.custom', title: 'Updated' })
	);
	expect(imported.nodes.find((n) => n.kind === 'reg')?.name).toBe('custom');
});
