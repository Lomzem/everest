import { describe, expect, it } from 'vitest';
import type { RdlDocument } from './model';
import {
	canEditEnumValueSourceProp,
	canEditFieldSourceProp,
	canEditRegisterSourceProp,
	prepareSourceBackedDocument,
	sourceContentFor,
} from './source-edits';

const sourceText = `property doc_group {
\ttype = string;
\tcomponent = reg;
};

addrmap top {
\treg {
\t\tdoc_group = "Control Registers";
\t\tdefault sw = rw;
\t\tdefault hw = r;
\t\tname = "Control";
\t\tdesc = "Original register";
\t\tenum mode_e {
\t\t\tOFF = 0 {desc = "Off";};
\t\t\tON = 1 {desc = "On";};
\t\t};
\t\tfield {
\t\t\tname = "Mode";
\t\t\tdesc = "Original field";
\t\t\tsw = rw;
\t\t\thw = r;
\t\t\tencode = mode_e;
\t\t\treset = mode_e::OFF;
\t\t} mode[1:0];
\t} control @ 0x00;
};`;

function sourceDocument(): RdlDocument {
	return {
		deviceName: 'top',
		blockName: 'top',
		addrmapName: 'top',
		title: 'top',
		desc: '',
		hierarchyGroups: [
			{ id: 'group-control-registers', label: 'Control Registers', path: 'Control Registers' },
		],
		registers: [
			{
				id: 'control',
				name: 'control',
				title: 'Control',
				desc: 'Original register',
				address: 0,
				width: 8,
				group: 'Control Registers',
				sw: 'RW',
				hw: 'R',
				fields: [
					{
						id: 'control-mode',
						name: 'mode',
						title: 'Mode',
						desc: 'Original field',
						msb: 1,
						lsb: 0,
						reset: 0,
						sw: 'RW',
						hw: 'R',
						enumName: 'mode_e',
						values: [
							{ id: 'control-mode-off', name: 'OFF', value: 0, desc: 'Off' },
							{ id: 'control-mode-on', name: 'ON', value: 1, desc: 'On' },
						],
						color: '',
					},
				],
			},
		],
		source: {
			rootPath: '/tmp/top.rdl',
			text: sourceText,
			readOnly: true,
			readOnlyReason: 'Source-safe edit ranges are not available yet.',
		},
	};
}

describe('source-safe edit ranges', () => {
	it('discovers editable ranges for anonymous register source', () => {
		const document = prepareSourceBackedDocument(sourceDocument());

		expect(document.source?.readOnly).toBe(false);
		expect(canEditRegisterSourceProp(document, 'control', 'title')).toBe(true);
		expect(canEditRegisterSourceProp(document, 'control', 'address')).toBe(true);
		expect(canEditFieldSourceProp(document, 'control', 'control-mode', 'bitRange')).toBe(true);
		expect(canEditFieldSourceProp(document, 'control', 'control-mode', 'reset')).toBe(true);
		expect(document.registers[0].fields[0].resetEnumValueId).toBe('control-mode-off');
		expect(
			canEditEnumValueSourceProp(document, 'control', 'control-mode', 'control-mode-off', 'desc'),
		).toBe(true);
		expect(sourceContentFor(document)).toBe(sourceText);
	});

	it('patches only known ranges in the original source text', () => {
		const document = prepareSourceBackedDocument(sourceDocument());
		const register = document.registers[0];
		const field = register.fields[0];
		const edited: RdlDocument = {
			...document,
			registers: [
				{
					...register,
					name: 'control_next',
					title: 'Control Next',
					address: 4,
					fields: [
						{
							...field,
							msb: 2,
							lsb: 1,
							reset: 1,
							resetEnumValueId: 'control-mode-on',
							values: [
								{ ...field.values[0], desc: 'Disabled' },
								{ ...field.values[1], value: 3 },
							],
						},
					],
				},
			],
		};

		const content = sourceContentFor(edited);

		expect(content).toContain('name = "Control Next";');
		expect(content).toContain('OFF = 0 {desc = "Disabled";};');
		expect(content).toContain('ON = 3 {desc = "On";};');
		expect(content).toContain('reset = mode_e::ON;');
		expect(content).toContain('} mode[2:1];');
		expect(content).toContain('} control_next @ 0x4;');
		expect(content).toContain('addrmap top');
	});

	it('inserts new fields into source-backed registers', () => {
		const document = prepareSourceBackedDocument(sourceDocument());
		const register = document.registers[0];
		const nextField = {
			id: 'control-enable',
			name: 'enable',
			title: 'Enable',
			desc: 'Enables the block.',
			msb: 2,
			lsb: 2,
			reset: 0,
			sw: 'RW' as const,
			hw: 'R' as const,
			enumName: '',
			values: [],
			color: '',
		};
		const edited: RdlDocument = {
			...document,
			registers: [
				{
					...register,
					fields: [...register.fields, nextField],
				},
			],
		};

		const content = sourceContentFor(edited);

		expect(canEditFieldSourceProp(edited, 'control', 'control-enable', 'name')).toBe(true);
		expect(canEditFieldSourceProp(edited, 'control', 'control-enable', 'title')).toBe(true);
		expect(canEditFieldSourceProp(edited, 'control', 'control-enable', 'desc')).toBe(true);
		expect(canEditFieldSourceProp(edited, 'control', 'control-enable', 'bitRange')).toBe(true);
		expect(canEditFieldSourceProp(edited, 'control', 'control-enable', 'reset')).toBe(true);
		expect(canEditFieldSourceProp(edited, 'control', 'control-enable', 'sw')).toBe(true);
		expect(canEditFieldSourceProp(edited, 'control', 'control-enable', 'hw')).toBe(true);
		expect(canEditFieldSourceProp(edited, 'control', 'control-enable', 'enumName')).toBe(true);
		expect(content).toContain('field {\n\t\t\tname = "Enable";');
		expect(content).toContain('} enable[2:2];');
		expect(content).toContain('OFF = 0 {desc = "Off";};');
	});

	it('adds the first enum encoding to an existing source-backed field', () => {
		const base = sourceDocument();
		const register = base.registers[0];
		const field = register.fields[0];
		const source = base.source?.text
			.replace(
				'\t\t\tenum mode_e {\n\t\t\t\tOFF = 0 {desc = "Off";};\n\t\t\t\tON = 1 {desc = "On";};\n\t\t\t};\n',
				'',
			)
			.replace('\t\t\tencode = mode_e;\n', '')
			.replace('\t\t\treset = mode_e::OFF;', '\t\t\treset = 0;');
		const document = prepareSourceBackedDocument({
			...base,
			registers: [
				{
					...register,
					fields: [{ ...field, enumName: '', values: [], resetEnumValueId: undefined }],
				},
			],
			source: { ...base.source!, text: source! },
		});
		const editedField = {
			...document.registers[0].fields[0],
			enumName: 'mode_e',
			resetEnumValueId: 'control-mode-off',
			values: [
				{ id: 'control-mode-off', name: 'OFF', value: 0, desc: 'Off' },
				{ id: 'control-mode-on', name: 'ON', value: 1, desc: 'On' },
			],
		};
		const edited: RdlDocument = {
			...document,
			registers: [{ ...document.registers[0], fields: [editedField] }],
		};

		const content = sourceContentFor(edited);

		expect(content).toContain('enum mode_e {');
		expect(content).toContain('OFF = 0 {desc = "Off";};');
		expect(content).toContain('encode = mode_e;');
	});

	it('inserts and removes enum members in source-backed enum blocks', () => {
		const document = prepareSourceBackedDocument(sourceDocument());
		const register = document.registers[0];
		const field = register.fields[0];
		const edited: RdlDocument = {
			...document,
			registers: [
				{
					...register,
					fields: [
						{
							...field,
							values: [
								field.values[0],
								{ id: 'control-mode-auto', name: 'AUTO', value: 2, desc: 'Auto' },
							],
						},
					],
				},
			],
		};

		const content = sourceContentFor(edited);

		expect(content).toContain('AUTO = 2 {desc = "Auto";};');
		expect(
			canEditEnumValueSourceProp(edited, 'control', 'control-mode', 'control-mode-auto', 'name'),
		).toBe(true);
		expect(
			canEditEnumValueSourceProp(edited, 'control', 'control-mode', 'control-mode-auto', 'value'),
		).toBe(true);
		expect(
			canEditEnumValueSourceProp(edited, 'control', 'control-mode', 'control-mode-auto', 'desc'),
		).toBe(true);
		expect(content).not.toContain('ON = 1 {desc = "On";};');
	});

	it('rewrites source-backed enum members when they are reordered', () => {
		const document = prepareSourceBackedDocument(sourceDocument());
		const register = document.registers[0];
		const field = register.fields[0];
		const edited: RdlDocument = {
			...document,
			registers: [
				{
					...register,
					fields: [
						{
							...field,
							values: [field.values[1], field.values[0]],
						},
					],
				},
			],
		};

		const content = sourceContentFor(edited);

		expect(content.indexOf('ON = 1 {desc = "On";};')).toBeLessThan(
			content.indexOf('OFF = 0 {desc = "Off";};'),
		);
	});

	it('keeps existing source properties read-only when their token ranges are missing', () => {
		const document = prepareSourceBackedDocument({
			...sourceDocument(),
			source: {
				...sourceDocument().source!,
				text: sourceText.replace('\t\t\tname = "Mode";\n', ''),
			},
		});

		expect(canEditFieldSourceProp(document, 'control', 'control-mode', 'name')).toBe(true);
		expect(canEditFieldSourceProp(document, 'control', 'control-mode', 'title')).toBe(false);
	});

	it('removes deleted registers from source-backed files', () => {
		const document = prepareSourceBackedDocument(sourceDocument());
		const edited: RdlDocument = { ...document, registers: [] };

		const content = sourceContentFor(edited);

		expect(content).not.toContain('control @ 0x00');
		expect(content).toContain('addrmap top');
	});

	it('rewrites source-backed register fields when they are reordered', () => {
		const base = sourceDocument();
		const field = base.registers[0].fields[0];
		const status = {
			...field,
			id: 'control-status',
			name: 'status',
			title: 'Status',
			desc: 'Status bit',
			msb: 2,
			lsb: 2,
			enumName: '',
			values: [],
		};
		const source = base.source!.text.replace(
			'\t\tfield {\n\t\t\tname = "Mode";',
			'\t\tfield {\n\t\t\tname = "Status";\n\t\t\tdesc = "Status bit";\n\t\t\tsw = rw;\n\t\t\thw = r;\n\t\t\treset = 0;\n\t\t} status[2:2];\n\t\tfield {\n\t\t\tname = "Mode";',
		);
		const document = prepareSourceBackedDocument({
			...base,
			registers: [{ ...base.registers[0], fields: [status, field] }],
			source: { ...base.source!, text: source },
		});
		const edited: RdlDocument = {
			...document,
			registers: [{ ...document.registers[0], fields: [field, status] }],
		};

		const content = sourceContentFor(edited);

		expect(content.indexOf('} mode[1:0];')).toBeLessThan(content.indexOf('} status[2:2];'));
	});

	it('rewrites source-backed registers when they are reordered', () => {
		const base = sourceDocument();
		const statusRegister = {
			...base.registers[0],
			id: 'status',
			name: 'status',
			title: 'Status',
			address: 4,
			fields: [{ ...base.registers[0].fields[0], id: 'status-ready', name: 'ready' }],
		};
		const source = base.source!.text.replace(
			'\t} control @ 0x00;',
			'\t} control @ 0x00;\n\treg {\n\t\tname = "Status";\n\t\tfield { reset = 0; } ready[0:0];\n\t} status @ 0x4;',
		);
		const document = prepareSourceBackedDocument({
			...base,
			registers: [base.registers[0], statusRegister],
			source: { ...base.source!, text: source },
		});
		const edited: RdlDocument = {
			...document,
			registers: [statusRegister, base.registers[0]],
		};

		const content = sourceContentFor(edited);

		expect(content.indexOf('} status @ 0x4;')).toBeLessThan(content.indexOf('} control @ 0x0;'));
	});
});
