import type { Access, Field, RdlDocument, Register } from './model';
import { sortRegistersByAddress } from './mutations';
import { normalizeRdlDocument } from './normalize';

const indent = '    ';
const defaultRegisterWidth = 8;

export function exportRdlDocument(document: RdlDocument): string {
	const normalizedDocument = normalizeRdlDocument(document);
	const lines: string[] = [
		'property doc_group {',
		`${indent}type = string;`,
		`${indent}component = reg;`,
		'};',
		'',
		`addrmap ${rdlIdentifier(normalizedDocument.addrmapName, 'addrmap')} {`,
		`${indent}name = ${rdlString(normalizedDocument.title || normalizedDocument.deviceName)};`,
		`${indent}desc = ${rdlString(
			normalizedDocument.desc || normalizedDocument.title || normalizedDocument.deviceName,
		)};`,
		`${indent}default regwidth = ${defaultRegisterWidth};`,
		`${indent}default sw = r;`,
		`${indent}default hw = rw;`,
	];

	for (const register of sortRegistersByAddress(normalizedDocument.registers)) {
		lines.push(...exportRegister(register));
	}

	lines.push(`};`, '');
	return `${lines.join('\n')}`;
}

function exportRegister(register: Register): string[] {
	const registerName = rdlIdentifier(register.name, 'register');
	const emittedEnums = new Set<string>();
	const lines = [`${indent}reg {`];

	if (register.group) {
		lines.push(`${indent}${indent}doc_group = ${rdlString(register.group)};`);
	}

	if (normalizedWidth(register.width) !== defaultRegisterWidth) {
		lines.push(`${indent}${indent}regwidth = ${normalizedWidth(register.width)};`);
	}

	lines.push(
		`${indent}${indent}default sw = ${rdlAccess(register.sw)};`,
		`${indent}${indent}default hw = ${rdlAccess(register.hw)};`,
		`${indent}${indent}name = ${rdlString(register.title)};`,
		`${indent}${indent}desc = ${rdlString(register.desc)};`,
	);

	for (const field of register.fields) {
		const enumName = field.enumName ? rdlIdentifier(field.enumName, `${field.name}_e`) : '';
		if (field.values.length && enumName && !emittedEnums.has(enumName)) {
			lines.push(...exportEnum(field));
			emittedEnums.add(enumName);
		}
		lines.push(...exportField(register, field));
	}

	lines.push(`${indent}} ${registerName} @ ${formatAddress(register.address)};`);
	return lines;
}

function exportEnum(field: Field): string[] {
	const enumName = rdlIdentifier(field.enumName ?? `${field.name}_e`, `${field.name}_e`);
	const lines = [`${indent}${indent}enum ${enumName} {`];

	for (const value of field.values) {
		lines.push(
			`${indent}${indent}${indent}${rdlIdentifier(value.name, 'VALUE')} = ${rdlInteger(value.value)} {desc = ${rdlString(value.desc)};};`,
		);
	}

	lines.push(`${indent}${indent}};`);
	return lines;
}

function exportField(register: Register, field: Field): string[] {
	const fieldName = rdlIdentifier(field.name, 'field');
	const lines = [
		`${indent}${indent}field {`,
		`${indent}${indent}${indent}name = ${rdlString(field.title)};`,
		`${indent}${indent}${indent}desc = ${rdlString(field.desc)};`,
		`${indent}${indent}${indent}sw = ${rdlAccess(field.sw)};`,
		`${indent}${indent}${indent}hw = ${rdlAccess(field.hw)};`,
	];

	if (field.values.length && field.enumName) {
		lines.push(
			`${indent}${indent}${indent}encode = ${rdlIdentifier(field.enumName, `${field.name}_e`)};`,
		);
	}

	lines.push(`${indent}${indent}${indent}reset = ${rdlReset(field)};`);
	lines.push(`${indent}${indent}} ${fieldName}${formatRange(field, register.width)};`);
	return lines;
}

function normalizedWidth(width: number) {
	if (!Number.isFinite(width)) return defaultRegisterWidth;
	return Math.max(1, Math.trunc(width));
}

function fieldBitWidth(field: Field) {
	return Math.max(1, field.msb - field.lsb + 1);
}

function maxValueForWidth(width: number) {
	return 2 ** width - 1;
}

function clampInteger(value: number, max: number) {
	if (!Number.isFinite(value)) return 0;
	return Math.min(Math.max(Math.trunc(value), 0), max);
}

function rdlReset(field: Field) {
	const enumValue = field.values.find((value) => value.id === field.resetEnumValueId);
	if (enumValue && field.enumName) {
		return `${rdlIdentifier(field.enumName, `${field.name}_e`)}::${rdlIdentifier(enumValue.name, 'VALUE')}`;
	}
	return `${clampInteger(field.reset, maxValueForWidth(fieldBitWidth(field)))}`;
}

function formatRange(field: Field, registerWidth: number) {
	const max = normalizedWidth(registerWidth) - 1;
	const msb = clampInteger(field.msb, max);
	const lsb = clampInteger(field.lsb, max);
	return `[${msb}:${lsb}]`;
}

function formatAddress(address: number) {
	return `0x${Math.max(0, Math.trunc(address)).toString(16)}`;
}

function rdlAccess(access: Access) {
	if (access === 'RW') return 'rw';
	if (access === 'WO' || access === 'W') return 'w';
	return 'r';
}

function rdlString(value: string) {
	return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function rdlInteger(value: number) {
	if (!Number.isFinite(value)) return '0';
	return `${Math.max(0, Math.trunc(value))}`;
}

function rdlIdentifier(value: string | undefined, fallback: string) {
	const candidate = (value || fallback)
		.trim()
		.replace(/[^A-Za-z0-9_]/g, '_')
		.replace(/_+/g, '_')
		.replace(/^([^A-Za-z_])/, '_$1');

	return candidate || fallback;
}
