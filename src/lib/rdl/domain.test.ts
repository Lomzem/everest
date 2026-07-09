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
import { sortRegisterFields, sortRegistersByAddress } from './mutations';
import { decodeRdlDocument, validateRdlDocument } from './schema';
import {
	bitRangeErrors,
	documentIdentifierIssues,
	enumValueErrors,
	fieldOverlapErrors,
	fieldOverlaps,
	identifierErrors,
	registerAddressErrors,
	registerIdentifierErrors,
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

function withoutRegisterBlock(content: string, registerName: string) {
	const lines = content.split('\n');

	for (let index = 0; index < lines.length; index += 1) {
		if (lines[index] !== '    reg {') continue;

		const end = lines.findIndex(
			(line, lineIndex) => lineIndex > index && /^ {4}} [A-Za-z_][A-Za-z0-9_]* @ /.test(line),
		);
		if (end === -1) break;
		if (lines[end].startsWith(`    } ${registerName} @ `)) {
			return [...lines.slice(0, index), ...lines.slice(end + 1)].join('\n');
		}

		index = end;
	}

	throw new Error(`Missing register block ${registerName}.`);
}

function registerBlockOrder(content: string) {
	return [...content.matchAll(/^ {4}} ([A-Za-z_][A-Za-z0-9_]*) @ /gm)].map((match) => match[1]);
}

describe('RDL domain helpers', () => {
	it('formats and parses numeric values by mode', () => {
		expect(formatValue(10, 'hex')).toBe('0xa');
		expect(formatEditableValue(10, 'bin', 4)).toBe('1010');
		expect(formatEditableValue(63, 'bin', 6)).toBe('11 1111');
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

	it('sorts register fields from largest MSB to smallest MSB', () => {
		const low = { ...createDefaultField('low-field'), msb: 1, lsb: 0 };
		const high = { ...createDefaultField('high-field'), msb: 7, lsb: 4 };
		const middle = { ...createDefaultField('middle-field'), msb: 3, lsb: 2 };

		expect(sortRegisterFields([low, high, middle]).map((field) => field.id)).toEqual([
			'high-field',
			'middle-field',
			'low-field',
		]);
	});

	it('sorts registers by address while preserving duplicate-address order', () => {
		const first = createTestRegister({ id: 'first', address: 4 });
		const second = createTestRegister({ id: 'second', address: 0 });
		const third = createTestRegister({ id: 'third', address: 4 });

		expect(sortRegistersByAddress([first, second, third]).map((register) => register.id)).toEqual([
			'second',
			'first',
			'third',
		]);
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
			{ kind: 'reserved', id: 'reserved-1-3', address: 1, endAddress: 3 },
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
			{ kind: 'reserved', id: 'reserved-4-b', address: 4, endAddress: 0x0b },
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

	it('collapses child folder internal gaps at the parent level', () => {
		const moduleId = createTestRegister({
			id: 'module-id',
			address: 0x00,
			group: 'Module ID and Version Registers',
		});
		const major = createTestRegister({
			id: 'major',
			address: 0x01,
			group: 'Module ID and Version Registers',
		});
		const minor = createTestRegister({
			id: 'minor',
			address: 0x02,
			group: 'Module ID and Version Registers',
		});
		const revision = createTestRegister({
			id: 'revision',
			address: 0x03,
			group: 'Module ID and Version Registers',
		});
		const control = createTestRegister({
			id: 'control',
			address: 0x04,
			group: 'Control Registers/System Control',
		});
		const los = createTestRegister({
			id: 'los',
			address: 0x06,
			group: 'Control Registers/System Control',
		});
		const sdiInput = createTestRegister({
			id: 'sdi-input',
			address: 0x08,
			group: 'Control Registers/SDI Input 1 Control',
		});
		const componentLsbs = createTestRegister({
			id: 'component-lsbs',
			address: 0x56,
			group: 'Control Registers/Test Signal Generator 1 Control',
		});
		const status = createTestRegister({
			id: 'status',
			address: 0x60,
			group: 'Status Registers/FPGA Status',
		});
		const registers = [
			moduleId,
			major,
			minor,
			revision,
			control,
			los,
			sdiInput,
			componentLsbs,
			status,
		];
		const groups = normalizeHierarchyGroups([], registers);

		expect(buildFolderChildren('', groups, registers)).toEqual([
			{
				kind: 'folder',
				id: 'group-module-id-and-version-registers',
				path: 'Module ID and Version Registers',
				label: 'Module ID and Version Registers',
				address: 0,
			},
			{
				kind: 'folder',
				id: 'group-control-registers',
				path: 'Control Registers',
				label: 'Control Registers',
				address: 4,
			},
			{ kind: 'reserved', id: 'reserved-57-5f', address: 0x57, endAddress: 0x5f },
			{
				kind: 'folder',
				id: 'group-status-registers',
				path: 'Status Registers',
				label: 'Status Registers',
				address: 0x60,
			},
		]);
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
		expect(resetErrors({ ...field, reset: 0 }, 'hex')).toEqual([]);
		expect(resetErrors({ ...field, reset: 1, resetEnumValueId: 'on' }, 'hex')).toEqual([]);
	});

	it('infers enum reset selections while decoding parser documents', async () => {
		const field: Field = {
			...createDefaultField(),
			id: 'control-mode',
			reset: 0,
			enumName: 'mode_e',
			values: [
				{ id: 'control-mode-off', name: 'OFF', value: 0, desc: '' },
				{ id: 'control-mode-on', name: 'ON', value: 1, desc: '' },
			],
		};

		const document = await Effect.runPromise(
			decodeRdlDocument({
				...createBlankDocument(),
				registers: [createTestRegister({ fields: [field] })],
			}),
		);

		expect(document.registers[0].fields[0].resetEnumValueId).toBe('control-mode-off');
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

	it('reports duplicate register identifiers across hierarchy groups', () => {
		const document = {
			...createBlankDocument(),
			addrmapName: 'top',
			registers: [
				createTestRegister({ id: 'root-control', name: 'control', group: '' }),
				createTestRegister({
					id: 'nested-control',
					name: 'control',
					address: 1,
					group: 'Nested/Video',
				}),
				createTestRegister({ id: 'status', name: 'status', address: 2, group: 'Nested' }),
			],
		};

		expect(documentIdentifierIssues(document)).toEqual([
			{
				kind: 'register',
				identifier: 'control',
				ids: ['root-control', 'nested-control'],
				message: 'Duplicate register identifier "control" in addrmap "top".',
			},
		]);
		expect(registerIdentifierErrors(document, document.registers[1])).toEqual([
			'Duplicate register identifier "control" in addrmap "top".',
		]);
		expect(registerIdentifierErrors(document, document.registers[2])).toEqual([]);
	});

	it('allows duplicate enum identifiers across registers', async () => {
		const modeField = {
			...createDefaultField('mode'),
			enumName: 'mode_e',
			values: [{ id: 'mode-off', name: 'OFF', value: 0, desc: '' }],
		};
		const statusField = {
			...createDefaultField('status'),
			enumName: 'mode_e',
			values: [{ id: 'status-off', name: 'OFF', value: 0, desc: '' }],
		};
		const emptyEnumNameField = {
			...createDefaultField('empty'),
			enumName: '',
			values: [{ id: 'empty-off', name: 'OFF', value: 0, desc: '' }],
		};
		const document = {
			...createBlankDocument(),
			addrmapName: 'top',
			registers: [
				createTestRegister({
					id: 'control',
					name: 'control',
					fields: [modeField, emptyEnumNameField],
				}),
				createTestRegister({
					id: 'status',
					name: 'status',
					address: 1,
					fields: [statusField],
				}),
				createTestRegister({
					id: 'mode-register',
					name: 'mode_e',
					address: 2,
					fields: [{ ...createDefaultField('plain'), enumName: '', values: [] }],
				}),
			],
		};

		expect(documentIdentifierIssues(document)).toEqual([]);
		await expect(Effect.runPromise(validateRdlDocument(document))).resolves.toBe(document);
	});

	it('reports duplicate register addresses', () => {
		const document = {
			...createBlankDocument(),
			addrmapName: 'top',
			registers: [
				createTestRegister({ id: 'control', name: 'control', address: 0 }),
				createTestRegister({ id: 'status', name: 'status', address: 0 }),
			],
		};

		expect(documentIdentifierIssues(document)).toContainEqual({
			kind: 'address',
			identifier: '0x0',
			address: 0,
			ids: ['control', 'status'],
			message: 'Duplicate register address 0x0 in addrmap "top".',
		});
		expect(registerAddressErrors(document, document.registers[0])).toEqual([
			'Duplicate register address 0x0 in addrmap "top".',
		]);
	});

	it('reports overlapping register address ranges and allows adjacent ranges', async () => {
		const overlapping = {
			...createBlankDocument(),
			registers: [
				createTestRegister({ id: 'wide', name: 'wide', address: 0, width: 32 }),
				createTestRegister({ id: 'inside', name: 'inside', address: 1, width: 8 }),
			],
		};
		const adjacent = {
			...createBlankDocument(),
			registers: [
				createTestRegister({ id: 'wide', name: 'wide', address: 0, width: 32 }),
				createTestRegister({ id: 'next', name: 'next', address: 4, width: 8 }),
			],
		};

		expect(registerAddressErrors(overlapping, overlapping.registers[0])).toEqual([
			'Register address range 0x0-0x3 overlaps register "inside" at 0x1.',
		]);
		expect(registerAddressErrors(adjacent, adjacent.registers[0])).toEqual([]);

		const invalid = await Effect.runPromise(Effect.either(validateRdlDocument(overlapping)));
		expect(invalid._tag).toBe('Left');
		await expect(Effect.runPromise(validateRdlDocument(adjacent))).resolves.toBe(adjacent);
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

	it('exports normalized RDL with spaces and explicit mixed register widths', () => {
		const document = {
			...createBlankDocument(),
			addrmapName: 'top',
			registers: [
				createTestRegister({ id: 'control', name: 'control', width: 8 }),
				createTestRegister({ id: 'wide', name: 'wide', width: 32 }),
			],
		};
		const content = exportRdlDocument(document);

		expect(content).toContain('    default regwidth = 8;');
		expect(content).toContain('        regwidth = 32;');
		expect(content).toContain('    } control @ 0x0;');
		expect(content).not.toContain('\t');
	});

	it('exports registers in ascending address order', () => {
		const document = {
			...createBlankDocument(),
			addrmapName: 'top',
			registers: [
				createTestRegister({ id: 'control', name: 'control', address: 0 }),
				createTestRegister({ id: 'last', name: 'last', address: 0xff }),
				createTestRegister({ id: 'middle', name: 'middle', address: 1 }),
			],
		};

		expect(registerBlockOrder(exportRdlDocument(document))).toEqual(['control', 'middle', 'last']);
	});

	it('keeps normalized diffs limited when inserting a register', () => {
		const baseRegister = createTestRegister({
			id: 'control',
			name: 'control',
			address: 0,
			width: 8,
		});
		const newRegister = createTestRegister({
			id: 'wide',
			name: 'wide',
			title: 'Wide',
			desc: 'Wide register.',
			address: 4,
			width: 32,
			fields: [
				{
					...createDefaultField('wide-value'),
					msb: 31,
					lsb: 0,
				},
			],
		});
		const baseDocument = {
			...createBlankDocument(),
			addrmapName: 'top',
			registers: [baseRegister],
		};
		const changedDocument = {
			...baseDocument,
			registers: [newRegister, baseRegister],
		};

		expect(withoutRegisterBlock(exportRdlDocument(changedDocument), 'wide')).toBe(
			exportRdlDocument(baseDocument),
		);
	});

	it('keeps normalized diffs limited when inserting into an address gap', () => {
		const control = createTestRegister({ id: 'control', name: 'control', address: 0 });
		const last = createTestRegister({ id: 'last', name: 'last', address: 0xff });
		const middle = createTestRegister({ id: 'middle', name: 'middle', address: 1 });
		const baseDocument = {
			...createBlankDocument(),
			addrmapName: 'top',
			registers: [control, last],
		};
		const changedDocument = {
			...baseDocument,
			registers: [control, last, middle],
		};

		expect(withoutRegisterBlock(exportRdlDocument(changedDocument), 'middle')).toBe(
			exportRdlDocument(baseDocument),
		);
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
