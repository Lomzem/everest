import { describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { buildBitSegments } from './bit-layout';
import { exportRdlDocument } from './export';
import { deriveIdentifier, formatEditableValue, formatValue, parseEditableValue } from './format';
import { buildFolderChildren, normalizeHierarchyGroups } from './hierarchy';
import { createBlankDocument, createDefaultField, type Field, type Register } from './model';
import { decodeRdlDocument } from './schema';
import { enumValueErrors, identifierErrors } from './validation';

const createTestRegister = (overrides: Partial<Register> = {}): Register => ({
	id: 'test-register',
	name: 'test_register',
	title: 'Test Register',
	desc: 'Register under test.',
	address: 0,
	width: 8,
	group: '',
	sw: 'RW',
	hw: 'RW',
	fields: [createDefaultField()],
	...overrides,
});

describe('RDL domain helpers', () => {
	it('formats and parses numeric values by mode', () => {
		expect(formatValue(10, 'hex')).toBe('0xa');
		expect(formatEditableValue(10, 'bin', 4)).toBe('1010');
		expect(parseEditableValue('0b1010', 'bin')).toBe(10);
		expect(parseEditableValue('ff', 'hex')).toBe(255);
		expect(parseEditableValue('', 'dec')).toBe(0);
	});

	it('derives RDL identifiers from display names', () => {
		expect(deriveIdentifier('SDI Output 1')).toBe('sdi_output_1');
		expect(deriveIdentifier('  HDMI   Input--Status!! ')).toBe('hdmi_input_status');
		expect(deriveIdentifier('---')).toBe('');
	});

	it('normalizes implicit top-level groups and builds direct folder children', () => {
		const register = createTestRegister({
			id: 'status',
			address: 8,
			group: 'Status/Video',
		});
		const groups = normalizeHierarchyGroups([], [register]);

		expect(groups).toEqual([
			{ id: 'group-status', label: 'Status', path: 'Status' },
			{ id: 'group-status-video', label: 'Video', path: 'Status/Video' },
		]);
		expect(buildFolderChildren('', groups, [register])).toEqual([
			{ kind: 'folder', id: 'group-status', path: 'Status', label: 'Status', address: 8 },
		]);
		expect(buildFolderChildren('Status', groups, [register])).toEqual([
			{
				kind: 'folder',
				id: 'group-status-video',
				path: 'Status/Video',
				label: 'Video',
				address: 8,
			},
		]);
	});

	it('builds bit segments with reserved gaps', () => {
		const register = createTestRegister({
			width: 8,
			fields: [
				{ ...createDefaultField('upper'), title: 'Upper', msb: 7, lsb: 4 },
				{ ...createDefaultField('lower'), title: 'Lower', msb: 1, lsb: 0 },
			],
		});

		expect(buildBitSegments(register).map((segment) => segment.label)).toEqual([
			'Upper [7:4]',
			'RSVD [3:2]',
			'Lower [1:0]',
		]);
	});

	it('reports enum values outside field width and duplicates', () => {
		const field: Field = {
			...createDefaultField(),
			msb: 1,
			lsb: 0,
			values: [
				{ id: 'a', name: 'A', value: 4, desc: '' },
				{ id: 'b', name: 'B', value: 4, desc: '' },
			],
		};

		expect(enumValueErrors(field, field.values[0], 'hex')).toEqual([
			'Value must fit in 2 bits (0x0 to 0x3).',
			'Duplicate enum value.',
		]);
	});

	it('reports invalid identifiers', () => {
		expect(identifierErrors('mode_e', 'Enum name')).toEqual([]);
		expect(identifierErrors('_reserved', 'Enum value name')).toEqual([]);
		expect(identifierErrors('VALUE_1', 'Enum value name')).toEqual([]);
		expect(identifierErrors('', 'Enum name')).toEqual([]);
		expect(identifierErrors('1mode', 'Enum name')).toEqual([
			'Enum name must be a valid identifier.',
		]);
		expect(identifierErrors('bad name', 'Enum value name')).toEqual([
			'Enum value name must be a valid identifier.',
		]);
		expect(identifierErrors('bad-name', 'Enum value name')).toEqual([
			'Enum value name must be a valid identifier.',
		]);
	});

	it('exports selected enum reset values symbolically', () => {
		const field: Field = {
			...createDefaultField(),
			enumName: 'mode_e',
			reset: 1,
			resetEnumValueId: 'on',
			values: [
				{ id: 'off', name: 'OFF', value: 0, desc: 'Off' },
				{ id: 'on', name: 'ON', value: 1, desc: 'On' },
			],
		};
		const document = createBlankDocument();

		expect(
			exportRdlDocument({
				...document,
				registers: [createTestRegister({ fields: [field] })],
			}),
		).toContain('reset = mode_e::ON;');
	});

	it('validates decoded documents at the desktop boundary', async () => {
		await expect(
			Effect.runPromise(decodeRdlDocument(createBlankDocument())),
		).resolves.toMatchObject({
			addrmapName: 'untitled_addrmap',
		});
		const invalid = await Effect.runPromise(Effect.either(decodeRdlDocument({ registers: [] })));
		expect(invalid._tag).toBe('Left');
		if (invalid._tag === 'Left') {
			expect(invalid.left._tag).toBe('DocumentValidationFailed');
		}
	});
});
