import type { EnumValue, Field, ValueMode } from './model';
import { fieldBitWidth, formatValue, maxValueForWidth } from './format';

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
