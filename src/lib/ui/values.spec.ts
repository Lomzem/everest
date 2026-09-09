import { describe, expect, it } from 'vitest';
import { aggregateMembers, decodeText, valueDefault, scopedDefinition } from './values';
import { compile } from '$lib/rdl';

describe('typed property values', () => {
	it('selects the nearest lexical declaration without leaking local names', () => {
		const global = { name: 'Mode', scopeRange: { start: 0, end: 100 } };
		const local = { name: 'Mode', scopeRange: { start: 20, end: 50 } };
		expect(scopedDefinition([global, local], 'Mode', 30)).toBe(local);
		expect(scopedDefinition([global, local], 'Mode', 70)).toBe(global);
		expect(scopedDefinition([local], 'Mode', 0)).toBeUndefined();
	});
	it('ignores commas and brackets inside comments', () => {
		expect(aggregateMembers("'{1, /* , } */ 2, // , {\n3}")).toEqual(['1', '2', '3']);
	});
	it('preserves commas and escaped quotes inside list strings', () => {
		expect(aggregateMembers('\'{"first, second", "say \\"yes\\"", \'{1, 2}}')).toEqual([
			'"first, second"',
			'"say \\"yes\\""',
			"'{1, 2}"
		]);
	});
	it('shows string content without source quotes', () => {
		expect(decodeText('"two\\nlines"')).toBe('two\nlines');
		expect(decodeText('"literal\nnewline"')).toBe('literal\nnewline');
	});
	it('chooses typed defaults for enum and aggregate controls', () => {
		const result = compile('enum modes { idle = 0; active = 1; }; addrmap device {};');
		expect(valueDefault('modes', result)).toBe('modes::idle');
		expect(valueDefault('boolean[]', result)).toBe("'{}");
		expect(valueDefault('string', result)).toBe('""');
	});
});
