import { beforeEach, describe, expect, it } from 'vitest';
import type { RdlDocument } from '$lib/rdl/model';
import { prepareSourceBackedDocument } from '$lib/rdl/source-edits';
import { EditorState } from './editor.svelte';

describe('EditorState derived names', () => {
	beforeEach(() => {
		Object.defineProperty(globalThis, 'document', {
			configurable: true,
			value: {
				querySelector: () => null,
			},
		});
	});

	it('derives a new register ID from the display name until manually edited', async () => {
		const state = new EditorState();
		state.newDocument();
		await state.addRegister('');

		expect(state.selectedRegister.name).toBe('');

		state.updateSelectedRegister({ title: 'SDI' });
		expect(state.selectedRegister.name).toBe('sdi');

		state.updateSelectedRegister({ title: 'SDI Output 1' });
		expect(state.selectedRegister.name).toBe('sdi_output_1');

		state.updateSelectedRegister({ name: 'custom_sdi' });
		state.updateSelectedRegister({ title: 'SDI Output 2' });
		expect(state.selectedRegister.name).toBe('custom_sdi');
	});

	it('derives a new field ID from the display name until manually edited', async () => {
		const state = new EditorState();
		state.newDocument();
		await state.addRegister('');
		await state.addField();
		const fieldId = state.selectedFieldId;

		expect(state.selectedField.name).toBe('');

		state.updateField(fieldId, { title: 'Output' });
		expect(state.selectedField.name).toBe('output');

		state.updateField(fieldId, { title: 'SDI Output 1' });
		expect(state.selectedField.name).toBe('sdi_output_1');

		state.updateField(fieldId, { name: 'custom_field' });
		state.updateField(fieldId, { title: 'SDI Output 2' });
		expect(state.selectedField.name).toBe('custom_field');
	});

	it('allows structural edits for source-backed documents with safe ranges', async () => {
		const state = new EditorState();
		state.applyDocument(prepareSourceBackedDocument(sourceDocument()), '/tmp/top.rdl', false);
		state.selectRegister('control');

		expect(state.canEditStructure()).toBe(true);

		await state.addField();
		expect(state.selectedRegister.fields).toHaveLength(2);

		await state.addEnumValue('control-mode');
		expect(state.selectedRegister.fields[0].values).toHaveLength(1);
	});
});

function sourceDocument(): RdlDocument {
	return {
		deviceName: 'top',
		blockName: 'top',
		addrmapName: 'top',
		title: 'top',
		desc: '',
		hierarchyGroups: [],
		registers: [
			{
				id: 'control',
				name: 'control',
				title: 'Control',
				desc: '',
				address: 0,
				width: 8,
				group: '',
				sw: 'RW',
				hw: 'R',
				fields: [
					{
						id: 'control-mode',
						name: 'mode',
						title: 'Mode',
						desc: '',
						msb: 1,
						lsb: 0,
						reset: 0,
						sw: 'RW',
						hw: 'R',
						enumName: '',
						values: [],
						color: '',
					},
				],
			},
		],
		source: {
			rootPath: '/tmp/top.rdl',
			text: 'addrmap top { reg { field { reset = 0; } mode[1:0]; } control @ 0x0; };',
			readOnly: true,
			readOnlyReason: 'Source-safe edit ranges are not available yet.',
		},
	};
}
