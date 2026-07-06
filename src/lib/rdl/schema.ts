import { Data, Effect, Schema } from 'effect';
import { normalizeBitColor, type RdlDocument } from './model';

export class DocumentValidationFailed extends Data.TaggedError('DocumentValidationFailed')<{
	readonly cause: unknown;
}> {}

const AccessSchema = Schema.Literal('RW', 'RO', 'WO', 'R', 'W');

const EnumValueSchema = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	value: Schema.Number,
	desc: Schema.String,
});

const FieldSchema = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	title: Schema.String,
	desc: Schema.String,
	msb: Schema.Number,
	lsb: Schema.Number,
	reset: Schema.Number,
	resetEnumValueId: Schema.optional(Schema.String),
	sw: AccessSchema,
	hw: AccessSchema,
	enumName: Schema.optional(Schema.String),
	values: Schema.Array(EnumValueSchema),
	color: Schema.String,
});

const RegisterSchema = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	title: Schema.String,
	desc: Schema.String,
	address: Schema.Number,
	width: Schema.Number,
	group: Schema.String,
	sw: AccessSchema,
	hw: AccessSchema,
	fields: Schema.Array(FieldSchema),
});

const HierarchyGroupSchema = Schema.Struct({
	id: Schema.String,
	label: Schema.String,
	path: Schema.String,
});

const SourceRangeSchema = Schema.Struct({
	start: Schema.Number,
	end: Schema.Number,
});

const SourceStringTokenSchema = Schema.Struct({
	range: SourceRangeSchema,
	value: Schema.String,
});

const SourceNumberTokenSchema = Schema.Struct({
	range: SourceRangeSchema,
	value: Schema.Number,
});

const SourceResetValueSchema = Schema.Struct({
	value: Schema.Number,
	enumName: Schema.optional(Schema.String),
	enumValueName: Schema.optional(Schema.String),
});

const SourceResetTokenSchema = Schema.Struct({
	range: SourceRangeSchema,
	value: SourceResetValueSchema,
});

const SourceAccessTokenSchema = Schema.Struct({
	range: SourceRangeSchema,
	value: AccessSchema,
});

const SourceBitRangeTokenSchema = Schema.Struct({
	range: SourceRangeSchema,
	value: Schema.Struct({
		msb: Schema.Number,
		lsb: Schema.Number,
	}),
});

const EnumValueSourceEditRangesSchema = Schema.Struct({
	fullRange: Schema.optional(SourceRangeSchema),
	name: Schema.optional(SourceStringTokenSchema),
	value: Schema.optional(SourceNumberTokenSchema),
	desc: Schema.optional(SourceStringTokenSchema),
});

const FieldSourceEditRangesSchema = Schema.Struct({
	fullRange: Schema.optional(SourceRangeSchema),
	bodyEnd: Schema.optional(Schema.Number),
	bodyIndent: Schema.optional(Schema.String),
	enumRange: Schema.optional(SourceRangeSchema),
	enumBodyEnd: Schema.optional(Schema.Number),
	enumBodyIndent: Schema.optional(Schema.String),
	name: Schema.optional(SourceStringTokenSchema),
	title: Schema.optional(SourceStringTokenSchema),
	desc: Schema.optional(SourceStringTokenSchema),
	bitRange: Schema.optional(SourceBitRangeTokenSchema),
	reset: Schema.optional(SourceResetTokenSchema),
	sw: Schema.optional(SourceAccessTokenSchema),
	hw: Schema.optional(SourceAccessTokenSchema),
	enumName: Schema.optional(SourceStringTokenSchema),
	values: Schema.Record({ key: Schema.String, value: EnumValueSourceEditRangesSchema }),
});

const RegisterSourceEditRangesSchema = Schema.Struct({
	fullRange: Schema.optional(SourceRangeSchema),
	bodyEnd: Schema.optional(Schema.Number),
	bodyIndent: Schema.optional(Schema.String),
	name: Schema.optional(SourceStringTokenSchema),
	title: Schema.optional(SourceStringTokenSchema),
	desc: Schema.optional(SourceStringTokenSchema),
	address: Schema.optional(SourceNumberTokenSchema),
	group: Schema.optional(SourceStringTokenSchema),
	sw: Schema.optional(SourceAccessTokenSchema),
	hw: Schema.optional(SourceAccessTokenSchema),
	fields: Schema.Record({ key: Schema.String, value: FieldSourceEditRangesSchema }),
});

const RdlSourceEditRangesSchema = Schema.Struct({
	addrmapName: Schema.optional(SourceStringTokenSchema),
	addrmapBodyEnd: Schema.optional(Schema.Number),
	addrmapIndent: Schema.optional(Schema.String),
	registers: Schema.Record({ key: Schema.String, value: RegisterSourceEditRangesSchema }),
});

const RdlSourceDocumentSchema = Schema.Struct({
	rootPath: Schema.String,
	text: Schema.String,
	readOnly: Schema.Boolean,
	readOnlyReason: Schema.String,
	editRanges: Schema.optional(RdlSourceEditRangesSchema),
});

export const RdlDocumentSchema = Schema.Struct({
	deviceName: Schema.String,
	blockName: Schema.String,
	addrmapName: Schema.String,
	title: Schema.String,
	desc: Schema.String,
	hierarchyGroups: Schema.Array(HierarchyGroupSchema),
	registers: Schema.Array(RegisterSchema),
	source: Schema.optional(RdlSourceDocumentSchema),
});

export function decodeRdlDocument(
	input: unknown,
): Effect.Effect<RdlDocument, DocumentValidationFailed> {
	return Schema.decodeUnknown(RdlDocumentSchema)(input).pipe(
		Effect.map((document) => ({
			...document,
			source: document.source ? { ...document.source } : undefined,
			hierarchyGroups: document.hierarchyGroups.map((group) => ({ ...group })),
			registers: document.registers.map((register) => ({
				...register,
				fields: register.fields.map((field) => ({
					...field,
					color: normalizeBitColor(field.color),
					values: field.values.map((value) => ({ ...value })),
				})),
			})),
		})),
		Effect.mapError((cause) => new DocumentValidationFailed({ cause })),
	);
}
