import { describe, expect, it } from 'vitest';
import { createDefaultField, type Register } from './model';
import { highlightTextParts, matchTextRanges, searchRegisters } from './search';

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

describe('RDL search', () => {
	it('fuzzy-searches split identifiers', () => {
		const register = createTestRegister({
			id: 'metadata',
			name: 'hdmi_in_control_metadata',
		});

		expect(searchRegisters([register], 'hdmi data').map((result) => result.registerId)).toEqual([
			'metadata',
		]);
	});

	it('searches nested field and enum text', () => {
		const register = createTestRegister({
			id: 'control',
			fields: [
				{
					...createDefaultField('enabled'),
					name: 'enabled',
					title: 'Enabled',
					values: [{ id: 'on', name: 'ON', value: 1, desc: 'Enable output' }],
				},
			],
		});

		const results = searchRegisters([register], 'enable output');

		expect(results).toHaveLength(1);
		expect(results[0].registerId).toBe('control');
		expect(results[0].snippet?.label).toBe('Enum enabled');
	});

	it('matches hex and decimal address prefixes', () => {
		const registers = [
			createTestRegister({ id: 'control', address: 0x10 }),
			createTestRegister({ id: 'status', address: 0x20 }),
		];

		expect(searchRegisters(registers, '0x1').map((result) => result.registerId)).toEqual([
			'control',
		]);
		expect(searchRegisters(registers, '16').map((result) => result.registerId)).toEqual([
			'control',
		]);
		expect(searchRegisters(registers, '10').map((result) => result.registerId)).toEqual([
			'control',
		]);
	});

	it('builds highlight ranges for fuzzy identifier matches', () => {
		const ranges = matchTextRanges('hdmi_in_control_metadata', 'hdmi data');
		const highlighted = highlightTextParts('hdmi_in_control_metadata', ranges)
			.filter((part) => part.match)
			.map((part) => part.text);

		expect(highlighted).toEqual(['hdmi', 'data']);
	});
});
