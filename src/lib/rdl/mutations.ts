import type { EnumValue, Field, Register } from './model';

export function sortRegisterFields(fields: Field[]) {
	return [...fields].sort((a, b) => b.msb - a.msb);
}

export function sortRegistersFields(registers: Register[]) {
	return registers.map((register) => ({
		...register,
		fields: sortRegisterFields(register.fields),
	}));
}

export function updateRegister(
	registers: Register[],
	registerId: string,
	changes: Partial<Register>,
) {
	return registers.map((register) =>
		register.id === registerId ? { ...register, ...changes } : register,
	);
}

export function updateField(
	registers: Register[],
	registerId: string,
	fieldId: string,
	changes: Partial<Field>,
) {
	return registers.map((register) => {
		if (register.id !== registerId) return register;
		return {
			...register,
			fields: sortRegisterFields(
				register.fields.map((field) => (field.id === fieldId ? { ...field, ...changes } : field)),
			),
		};
	});
}

export function updateEnumValue(
	registers: Register[],
	registerId: string,
	fieldId: string,
	enumValueId: string,
	changes: Partial<EnumValue>,
	fieldChanges: Partial<Field> = {},
) {
	return registers.map((register) => {
		if (register.id !== registerId) return register;
		return {
			...register,
			fields: register.fields.map((field) => {
				if (field.id !== fieldId) return field;
				return {
					...field,
					...fieldChanges,
					values: field.values.map((value) =>
						value.id === enumValueId ? { ...value, ...changes } : value,
					),
				};
			}),
		};
	});
}

export function sortFieldEnumValues(registers: Register[], registerId: string, fieldId: string) {
	return registers.map((register) => {
		if (register.id !== registerId) return register;
		return {
			...register,
			fields: register.fields.map((field) =>
				field.id === fieldId
					? { ...field, values: [...field.values].sort((a, b) => a.value - b.value) }
					: field,
			),
		};
	});
}
