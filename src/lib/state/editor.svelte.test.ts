import { beforeEach, describe, expect, it } from 'vitest';
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
});
