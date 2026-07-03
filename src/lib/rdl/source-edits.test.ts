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
});
