import { normalizeHierarchyGroups } from './hierarchy';
import {
	normalizeBitColor,
	resolvedResetEnumValueId,
	type EnumValue,
	type Field,
	type HierarchyGroup,
	type RdlDocument,
	type Register,
} from './model';
import { sortRegisterFields } from './mutations';

type FieldInput = Omit<Field, 'values'> & {
	readonly values: readonly Readonly<EnumValue>[];
};
type RegisterInput = Omit<Register, 'fields'> & {
	readonly fields: readonly FieldInput[];
};
type RdlDocumentInput = Omit<RdlDocument, 'hierarchyGroups' | 'registers'> & {
	readonly hierarchyGroups: readonly Readonly<HierarchyGroup>[];
	readonly registers: readonly RegisterInput[];
};

export function normalizeRdlDocument(document: RdlDocumentInput): RdlDocument {
	const registers = document.registers.map(normalizeRegister);

	return {
		...document,
		hierarchyGroups: normalizeHierarchyGroups(
			document.hierarchyGroups.map((group) => ({ ...group })),
			registers,
		).map((group) => ({ ...group })),
		registers,
	};
}

function normalizeRegister(register: RegisterInput): Register {
	return {
		...register,
		fields: sortRegisterFields(register.fields).map(normalizeField),
	};
}

function normalizeField(field: FieldInput): Field {
	const normalized = {
		...field,
		color: normalizeBitColor(field.color),
		values: field.values.map((value) => ({ ...value })),
	};

	return {
		...normalized,
		resetEnumValueId: resolvedResetEnumValueId(normalized),
	};
}
