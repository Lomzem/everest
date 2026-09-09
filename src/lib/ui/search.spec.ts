import { describe, expect, it } from 'vitest';
import { compile } from '$lib/rdl';
import { searchDocument } from './search';

describe('document search', () => {
	const document = compile(`addrmap device {
 reg { enum Mode { IDLE=0; RUN=1; }; field {encode=Mode;} mode[0:0]; } control @0x10;
 reg { enum Mode { STOP=0; GO=1; }; field {encode=Mode;} mode[0:0]; } status @0x20;
 };`);
	it('finds formatted addresses and preserves the register target', () => {
		expect(searchDocument(document, '0x10').map((r) => r.registerId)).toEqual(['device.control']);
	});
	it('uses the field scope for encoding results with the same enum name', () => {
		const results = searchDocument(document, 'GO');
		expect(results).toHaveLength(1);
		expect(results[0].fieldId).toBe('device.status.mode');
		expect(results[0].member).toBe('GO');
		expect(searchDocument(document, 'RUN')[0].registerId).toBe('device.control');
	});
	it('does not search or return all records for whitespace', () => {
		expect(searchDocument(document, '   ')).toEqual([]);
	});
});
