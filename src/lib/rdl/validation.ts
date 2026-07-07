import type { EnumValue, Field, ValueMode } from './model';
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
