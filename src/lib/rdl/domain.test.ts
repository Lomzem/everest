import { describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { buildBitCells, buildBitSegments } from './bit-layout';
import { exportRdlDocument } from './export';
import {
	addressInputPattern,
	deriveIdentifier,
	formatEditableValue,
	formatValue,
	isValidAddressInput,
	isValidEditableValueInput,
	parseEditableValue,
	valueInputPattern,
} from './format';
import {
	buildFolderChildren,
	buildReservedAddressChildren,
	normalizeHierarchyGroups,
} from './hierarchy';
import { createBlankDocument, createDefaultField, type Field, type Register } from './model';
import { decodeRdlDocument } from './schema';
import {
	bitRangeErrors,
	enumValueErrors,
	fieldOverlapErrors,
	fieldOverlaps,
	identifierErrors,
	resetErrors,
} from './validation';

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

	it('validates numeric input text by address and value mode', () => {
		expect(addressInputPattern).toBe('[0-9a-fA-F]*');
		expect(valueInputPattern('hex')).toBe('[0-9a-fA-F]*');
		expect(valueInputPattern('dec')).toBe('[0-9]*');
		expect(valueInputPattern('bin')).toBe('[01\\s_]*');

		expect(isValidAddressInput('0aF')).toBe(true);
		expect(isValidAddressInput('0x0')).toBe(false);
		expect(isValidAddressInput('19g')).toBe(false);

		expect(isValidEditableValueInput('123', 'dec')).toBe(true);
		expect(isValidEditableValueInput('12a', 'dec')).toBe(false);
		expect(isValidEditableValueInput('deadBEEF', 'hex')).toBe(true);
		expect(isValidEditableValueInput('0x12', 'hex')).toBe(false);
		expect(isValidEditableValueInput('1010 0011_0000', 'bin')).toBe(true);
		expect(isValidEditableValueInput('102', 'bin')).toBe(false);
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

	it('builds reserved address rows for register gaps', () => {
		const control = createTestRegister({ id: 'control', address: 0 });
		const status = createTestRegister({ id: 'status', address: 0x04 });

		expect(buildReservedAddressChildren([control, status])).toEqual([
			{ kind: 'reserved', id: 'reserved-1', address: 1 },
		]);
		expect(buildFolderChildren('', [], [status, control]).map((child) => child.kind)).toEqual([
			'register',
			'reserved',
			'register',
		]);
	});

	it('uses 32-bit register width for 4-byte reserved address rows', () => {
		const control = createTestRegister({ id: 'control', address: 0, width: 32 });
		const status = createTestRegister({ id: 'status', address: 0x0c, width: 32 });

		expect(buildReservedAddressChildren([control, status])).toEqual([
			{ kind: 'reserved', id: 'reserved-4', address: 4 },
		]);
	});

	it('does not reserve addresses occupied by child folders', () => {
		const control = createTestRegister({ id: 'control', address: 0 });
		const nested = createTestRegister({ id: 'nested', address: 0x04, group: 'Status' });
		const status = createTestRegister({ id: 'status', address: 0x06 });
		const groups = normalizeHierarchyGroups([], [nested]);

		expect(
			buildFolderChildren('', groups, [status, nested, control]).map((child) => child.kind),
		).toEqual(['register', 'reserved', 'folder', 'reserved', 'register']);
	});

	it('builds bit segments with reserved gaps', () => {
		const register = createTestRegister({
			width: 8,
			fields: [
				{ ...createDefaultField('upper'), title: 'Upper', msb: 7, lsb: 4 },
				{ ...createDefaultField('flag'), title: 'Flag', msb: 2, lsb: 2 },
				{ ...createDefaultField('lower'), title: 'Lower', msb: 1, lsb: 0 },
			],
		});

		expect(buildBitSegments(register).map((segment) => segment.label)).toEqual([
			'Upper [7:4]',
			'Reserved [3:3]',
			'Flag [2]',
			'Lower [1:0]',
		]);
	});

	it('reports no field overlap for adjacent ranges', () => {
		const register = createTestRegister({
			fields: [
				{ ...createDefaultField('upper'), title: 'Upper', msb: 7, lsb: 4 },
				{ ...createDefaultField('lower'), title: 'Lower', msb: 3, lsb: 0 },
			],
		});

		expect(fieldOverlaps(register)).toEqual([]);
		expect(fieldOverlapErrors(register, register.fields[0])).toEqual([]);
	});

	it('reports partial field overlaps', () => {
		const register = createTestRegister({
			fields: [
				{ ...createDefaultField('upper'), title: 'Upper', msb: 4, lsb: 2 },
				{ ...createDefaultField('lower'), title: 'Lower', msb: 3, lsb: 1 },
			],
		});

		expect(fieldOverlaps(register)).toEqual([
			{
				fieldIds: ['upper', 'lower'],
				fieldTitles: ['Upper', 'Lower'],
				high: 3,
				low: 2,
			},
		]);
		expect(fieldOverlapErrors(register, register.fields[0])).toEqual([
			'Overlaps `Lower` on bits [3:2].',
		]);
	});

	it('reports identical single-bit field overlaps', () => {
		const register = createTestRegister({
			fields: [
				{ ...createDefaultField('ready'), title: 'Ready', msb: 1, lsb: 1 },
				{ ...createDefaultField('valid'), title: 'Valid', msb: 1, lsb: 1 },
			],
		});

		expect(fieldOverlapErrors(register, register.fields[1])).toEqual([
			'Overlaps `Ready` on bit [1].',
		]);
		expect(buildBitCells(register).find((cell) => cell.bit === 1)).toMatchObject({
			conflict: true,
			overlapFieldId: 'ready',
			overlapLabel: 'Overlap [1]: Ready, Valid',
		});
	});

	it('does not report overlaps for reversed invalid ranges', () => {
		const register = createTestRegister({
			fields: [
				{ ...createDefaultField('invalid'), title: 'Invalid', msb: 1, lsb: 4 },
				{ ...createDefaultField('lower'), title: 'Lower', msb: 3, lsb: 0 },
			],
		});

		expect(bitRangeErrors(register.fields[0])).toEqual([
			'MSB must be greater than or equal to LSB.',
		]);
		expect(fieldOverlaps(register)).toEqual([]);
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

	it('reports enum reset values that do not match an encoding', () => {
		const field: Field = {
			...createDefaultField(),
			reset: 2,
			enumName: 'mode_e',
			values: [
				{ id: 'off', name: 'OFF', value: 0, desc: '' },
				{ id: 'on', name: 'ON', value: 1, desc: '' },
			],
		};

		expect(resetErrors(field, 'hex')).toEqual(['Reset does not match an enum encoding.']);
		expect(resetErrors({ ...field, reset: 1, resetEnumValueId: 'on' }, 'hex')).toEqual([]);
	});

	it('reports bit ranges where MSB is less than LSB', () => {
		expect(bitRangeErrors({ ...createDefaultField(), msb: 3, lsb: 0 })).toEqual([]);
		expect(bitRangeErrors({ ...createDefaultField(), msb: 2, lsb: 2 })).toEqual([]);
		expect(bitRangeErrors({ ...createDefaultField(), msb: 1, lsb: 4 })).toEqual([
			'MSB must be greater than or equal to LSB.',
		]);
	});

	it('reports invalid identifiers', () => {
		expect(identifierErrors('mode_e', 'Enum name')).toEqual([]);
		expect(identifierErrors('_reserved', 'Enum value name')).toEqual([]);
		expect(identifierErrors('VALUE_1', 'Enum value name')).toEqual([]);
		expect(identifierErrors('', 'Enum name')).toEqual([]);
		expect(identifierErrors('1mode', 'Enum name')).toEqual([
			"Enum name can't start with a number.",
		]);
		expect(identifierErrors('bad name', 'Enum value name')).toEqual([
			"Enum value name can't contain spaces.",
		]);
		expect(identifierErrors('bad-name', 'Enum value name')).toEqual([
			'Enum value name can only contain letters, numbers, and underscores.',
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
