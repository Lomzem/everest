import { Data, Effect, Schema } from 'effect';
import type { RdlDocument } from './model';
import { normalizeRdlDocument } from './normalize';
import { documentIdentifierIssues } from './validation';

export class DocumentValidationFailed extends Data.TaggedError('DocumentValidationFailed')<{
	readonly message: string;
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

export const RdlDocumentSchema = Schema.Struct({
	deviceName: Schema.String,
	blockName: Schema.String,
	addrmapName: Schema.String,
	title: Schema.String,
	desc: Schema.String,
	hierarchyGroups: Schema.Array(HierarchyGroupSchema),
	registers: Schema.Array(RegisterSchema),
});

export function decodeRdlDocument(
	input: unknown,
): Effect.Effect<RdlDocument, DocumentValidationFailed> {
	return Schema.decodeUnknown(RdlDocumentSchema)(input).pipe(
		Effect.map(normalizeRdlDocument),
		Effect.mapError(
			(cause) =>
				new DocumentValidationFailed({ message: 'The RDL document shape is invalid.', cause }),
		),
	);
}

export function validateRdlDocument(
	document: RdlDocument,
): Effect.Effect<RdlDocument, DocumentValidationFailed> {
	return Effect.gen(function* () {
		const issues = documentIdentifierIssues(document);
		if (issues.length) {
			return yield* Effect.fail(
				new DocumentValidationFailed({
					message: issues.map((issue) => issue.message).join('\n'),
					cause: issues,
				}),
			);
		}

		return document;
	});
}
