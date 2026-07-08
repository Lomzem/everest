import type { EnumValue, Field, RdlDocument, Register, ValueMode } from './model';
import { fieldBitWidth, formatValue, maxValueForWidth } from './format';

const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function identifierErrors(value: string | undefined, label: string) {
	if (!value || identifierPattern.test(value)) return [];
	if (/^[0-9]/.test(value)) return [`${label} can't start with a number.`];
	if (/\s/.test(value)) return [`${label} can't contain spaces.`];
	return [`${label} can only contain letters, numbers, and underscores.`];
}

export type DocumentIdentifierIssueKind = 'register' | 'enum';

export interface DocumentIdentifierIssue {
	readonly kind: DocumentIdentifierIssueKind;
	readonly identifier: string;
	readonly ids: readonly string[];
	readonly registerNames?: readonly string[];
	readonly message: string;
}

export function documentIdentifierIssues(document: RdlDocument): DocumentIdentifierIssue[] {
	return [
		...duplicateIdentifierIssues(
			'register',
			document.registers.map((register) => ({
				id: register.id,
				identifier: normalizeIdentifier(register.name),
			})),
			document.addrmapName,
		),
		...duplicateEnumIssues(
			document.registers.flatMap((register) =>
				register.fields
					.filter((field) => field.values.length)
					.map((field) => ({
						id: field.id,
						identifier: normalizeIdentifier(field.enumName),
						registerName: register.name,
					})),
			),
		),
	];
}

export function registerIdentifierErrors(document: RdlDocument, register: Register) {
	const identifier = normalizeIdentifier(register.name);
	if (!identifier) return [];
	return documentIdentifierIssues(document)
		.filter((issue) => issue.kind === 'register' && issue.identifier === identifier)
		.map((issue) => issue.message);
}

export function enumIdentifierErrors(document: RdlDocument, field: Field) {
	const identifier = normalizeIdentifier(field.enumName);
	if (!identifier || !field.values.length) return [];
	const duplicateRegisters = uniqueItems(
		document.registers.flatMap((register) =>
			register.fields.some(
				(candidate) =>
					candidate.id !== field.id &&
					candidate.values.length &&
					normalizeIdentifier(candidate.enumName) === identifier,
			)
				? [register.name]
				: [],
		),
	);

	if (!duplicateRegisters.length) return [];
	return [duplicateEnumMessage(identifier, duplicateRegisters)];
}

function duplicateIdentifierIssues(
	kind: DocumentIdentifierIssueKind,
	items: readonly { readonly id: string; readonly identifier: string }[],
	addrmapName: string,
) {
	const idsByIdentifier = new Map<string, string[]>();
	for (const item of items) {
		if (!item.identifier) continue;
		idsByIdentifier.set(item.identifier, [
			...(idsByIdentifier.get(item.identifier) ?? []),
			item.id,
		]);
	}

	return [...idsByIdentifier.entries()]
		.filter(([, ids]) => ids.length > 1)
		.map(([identifier, ids]) => ({
			kind,
			identifier,
			ids,
			message: `Duplicate ${kind} identifier "${identifier}" in addrmap "${addrmapName}".`,
		}));
}

function duplicateEnumIssues(
	items: readonly {
		readonly id: string;
		readonly identifier: string;
		readonly registerName: string;
	}[],
) {
	const itemsByIdentifier = new Map<string, { id: string; registerName: string }[]>();
	for (const item of items) {
		if (!item.identifier) continue;
		itemsByIdentifier.set(item.identifier, [
			...(itemsByIdentifier.get(item.identifier) ?? []),
			{ id: item.id, registerName: item.registerName },
		]);
	}

	return [...itemsByIdentifier.entries()]
		.filter(([, items]) => items.length > 1)
		.map(([identifier, items]) => {
			const registerNames = uniqueItems(items.map((item) => item.registerName));
			return {
				kind: 'enum' as const,
				identifier,
				ids: items.map((item) => item.id),
				registerNames,
				message: duplicateEnumMessage(identifier, registerNames),
			};
		});
}

function duplicateEnumMessage(identifier: string, registerNames: readonly string[]) {
	return `Duplicate enum identifier "${identifier}" also used in ${registerLabel(registerNames)}.`;
}

function registerLabel(registerNames: readonly string[]) {
	const labels = registerNames.map((name) => `"${name}"`);
	if (labels.length === 1) return `register ${labels[0]}`;
	return `registers ${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

function uniqueItems(items: readonly string[]) {
	return [...new Set(items)];
}

function normalizeIdentifier(value: string | undefined) {
	return value?.trim() ?? '';
}

export function bitRangeErrors(field: Field) {
	if (field.msb >= field.lsb) return [];
	return ['MSB must be greater than or equal to LSB.'];
}

export interface FieldOverlap {
	readonly fieldIds: readonly string[];
	readonly fieldTitles: readonly string[];
	readonly high: number;
	readonly low: number;
}

export function fieldOverlapErrors(register: Register, field: Field) {
	return fieldOverlaps(register)
		.filter((overlap) => overlap.fieldIds.includes(field.id))
		.map((overlap) => {
			const otherFields = overlap.fieldTitles.filter(
				(title, index) => overlap.fieldIds[index] !== field.id,
			);
			const range =
				overlap.high === overlap.low ? `[${overlap.high}]` : `[${overlap.high}:${overlap.low}]`;
			const bitLabel = overlap.high === overlap.low ? 'bit' : 'bits';
			return `Overlaps ${otherFields.map((title) => `\`${title}\``).join(', ')} on ${bitLabel} ${range}.`;
		});
}

export function fieldOverlaps(register: Register): FieldOverlap[] {
	const validFields = register.fields.filter((field) => field.msb >= field.lsb);
	const overlaps: FieldOverlap[] = [];

	for (let bit = register.width - 1; bit >= 0; bit -= 1) {
		const fields = validFields.filter((field) => field.msb >= bit && field.lsb <= bit);
		if (fields.length < 2) continue;

		const previous = overlaps.at(-1);
		const fieldIds = fields.map((field) => field.id);
		if (previous && sameItems(previous.fieldIds, fieldIds) && previous.low === bit + 1) {
			overlaps[overlaps.length - 1] = { ...previous, low: bit };
			continue;
		}

		overlaps.push({
			fieldIds,
			fieldTitles: fields.map((field) => field.title),
			high: bit,
			low: bit,
		});
	}

	return overlaps;
}

function sameItems(left: readonly string[], right: readonly string[]) {
	if (left.length !== right.length) return false;
	return left.every((item, index) => item === right[index]);
}

export function enumValueErrors(field: Field, enumValue: EnumValue, valueMode: ValueMode) {
	const width = fieldBitWidth(field);
	const maxValue = maxValueForWidth(width);
	const errors: string[] = [];

	if (enumValue.value < 0 || enumValue.value > maxValue) {
		errors.push(
			`Value must fit in ${width} bits (${formatValue(0, valueMode, width)} to ${formatValue(maxValue, valueMode, width)}).`,
		);
	}

	if (field.values.filter((value) => value.value === enumValue.value).length > 1) {
		errors.push('Duplicate enum value.');
	}

	return errors;
}

export function resetErrors(field: Field, valueMode: ValueMode) {
	if (!field.values.length) return [];
	const width = fieldBitWidth(field);
	const maxValue = maxValueForWidth(width);
	const errors: string[] = [];

	if (field.reset < 0 || field.reset > maxValue) {
		errors.push(
			`Reset must fit in ${width} bits (${formatValue(0, valueMode, width)} to ${formatValue(maxValue, valueMode, width)}).`,
		);
	}

	if (!field.values.some((value) => value.id === field.resetEnumValueId)) {
		errors.push('Reset does not match an enum encoding.');
	}

	return errors;
}
