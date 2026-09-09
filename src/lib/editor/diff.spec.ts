import { describe, expect, it } from 'vitest';
import { diffContext, diffLines } from './diff';

describe('source diff', () => {
	it('shows only one changed property with line numbers', () => {
		const rows = diffLines('reg {\n  reset = 0;\n};\n', 'reg {\n  reset = 1;\n};\n');
		expect(rows.filter((row) => row.type !== 'equal')).toEqual([
			{ type: 'remove', text: '  reset = 0;', oldLine: 2, newLine: undefined },
			{ type: 'add', text: '  reset = 1;', oldLine: undefined, newLine: 2 }
		]);
	});
	it('has no diff after undo to baseline', () => {
		expect(diffLines('same\r\n', 'same\r\n')).toEqual([]);
	});
	it('preserves both exact documents across insertions, deletions, and line endings', () => {
		const samples = ['', 'a', 'a\n', 'a\r\n', 'a\nb\nc', 'c\nb\na', 'a\na\nb\n', '\n\n'];
		for (const before of samples)
			for (const after of samples) {
				if (before === after) continue;
				const diff = diffLines(before, after);
				expect(
					diff
						.filter((row) => row.type !== 'add')
						.map((row) => row.text)
						.join('\n')
				).toBe(before);
				expect(
					diff
						.filter((row) => row.type !== 'remove')
						.map((row) => row.text)
						.join('\n')
				).toBe(after);
			}
	});
	it('keeps distant changes small in a large file', () => {
		const before = Array.from({ length: 6500 }, (_, i) => `line ${i}`);
		const after = [...before];
		after[2] = 'first change';
		after[6490] = 'second change';
		const diff = diffLines(before.join('\n'), after.join('\n'));
		expect(diff.filter((row) => row.type !== 'equal')).toHaveLength(4);
		expect(diffContext(diff).length).toBeLessThan(25);
	});
});
