import type { Field, ValueMode } from './model';

export const addressInputPattern = '[0-9a-fA-F]*';

const valueInputPatterns: Record<ValueMode, string> = {
	hex: '[0-9a-fA-F]*',
	dec: '[0-9]*',
	bin: '[01\\s_]*',
};

const addressInputRegex = /^[0-9a-fA-F]*$/;

const valueInputRegexes: Record<ValueMode, RegExp> = {
	hex: /^[0-9a-fA-F]*$/,
	dec: /^[0-9]*$/,
	bin: /^[01\s_]*$/,
};

export function formatAddress(address: number) {
	return `0x${Math.max(0, address).toString(16).padStart(2, '0')}`;
}

export function formatEditableAddress(address: number) {
	return Math.max(0, address).toString(16).padStart(2, '0');
}

export function parseAddress(value: string) {
	return parseInt(value.trim().replace(/^0x/i, ''), 16) || 0;
}

export function isValidAddressInput(value: string) {
	return addressInputRegex.test(value);
}

export function valueInputPattern(mode: ValueMode) {
	return valueInputPatterns[mode];
}

export function isValidEditableValueInput(value: string, mode: ValueMode) {
	return valueInputRegexes[mode].test(value);
}

export function formatValue(value: number, mode: ValueMode, width = 4) {
	if (mode === 'dec') return value.toString(10);
	if (mode === 'bin') return `0b${formatBinaryValue(value, width)}`;
	return `0x${value.toString(16)}`;
}

export function formatEditableValue(value: number, mode: ValueMode, width = 4) {
	if (mode === 'dec') return value.toString(10);
	if (mode === 'bin') return formatBinaryValue(value, width);
	return value.toString(16);
}

export function formatBinaryValue(value: number, width = 4) {
	const bits = Math.max(0, value).toString(2);
	const minimumBits = Math.max(width, bits.length);
	const groupedWidth = Math.ceil(minimumBits / 4) * 4;
	const padded = bits.padStart(groupedWidth, '0');
	return padded.match(/.{1,4}/g)?.join(' ') ?? padded;
}

export function valuePrefix(mode: ValueMode) {
	if (mode === 'hex') return '0x';
	if (mode === 'bin') return '0b';
	return '';
}

export function parseEditableValue(value: string, mode: ValueMode) {
	const trimmed = value.trim();
	if (!trimmed) return 0;
	if (mode === 'hex') return parseInt(trimmed.replace(/^0x/i, ''), 16) || 0;
	if (mode === 'bin') return parseInt(trimmed.replace(/^0b/i, '').replace(/[\s_]/g, ''), 2) || 0;
	return Number(trimmed) || 0;
}

export function deriveIdentifier(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
}

export function fieldBitWidth(field: Field) {
	return Math.max(1, Math.abs(field.msb - field.lsb) + 1);
}

export function maxValueForWidth(width: number) {
	return 2 ** width - 1;
}

export function range(start: number, end: number) {
	const low = Math.min(start, end);
	const high = Math.max(start, end);
	return Array.from({ length: high - low + 1 }, (_, index) => low + index);
}
