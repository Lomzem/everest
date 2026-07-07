import type { EnumValue, Field, Register, ValueMode } from './model';
import { fieldBitWidth, formatValue, maxValueForWidth } from './format';

const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function identifierErrors(value: string | undefined, label: string) {
	if (!value || identifierPattern.test(value)) return [];
	if (/^[0-9]/.test(value)) return [`${label} can't start with a number.`];
	if (/\s/.test(value)) return [`${label} can't contain spaces.`];
	return [`${label} can only contain letters, numbers, and underscores.`];
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
