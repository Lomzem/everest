import type {
	Access,
	EnumValue,
	EnumValueSourceEditRanges,
	Field,
	FieldSourceEditRanges,
	RdlDocument,
	RdlSourceEditRanges,
	Register,
	RegisterSourceEditRanges,
	ResetSourceValue,
	SourceRange,
	SourceToken,
} from './model';

export type EditableRegisterProp = keyof Omit<RegisterSourceEditRanges, 'fields'>;
export type EditableFieldProp = keyof Omit<FieldSourceEditRanges, 'values'>;
export type EditableEnumValueProp = keyof EnumValueSourceEditRanges;

interface Block {
	readonly start: number;
	readonly openBrace: number;
	readonly bodyStart: number;
	readonly bodyEnd: number;
	readonly closeBrace: number;
	readonly end: number;
	readonly instanceName: string;
	readonly instanceRange: SourceRange;
	readonly addressRange?: SourceRange;
}

interface EnumBlock {
	readonly name: string;
	readonly start: number;
	readonly bodyStart: number;
	readonly bodyEnd: number;
	readonly end: number;
}

interface EnumMemberBlock {
	readonly name: string;
	readonly fullRange: SourceRange;
	readonly nameRange: SourceRange;
	readonly valueRange: SourceRange;
	readonly bodyStart?: number;
	readonly bodyEnd?: number;
}

interface Replacement {
	readonly range: SourceRange;
	readonly text: string;
}

const sourceReadOnlyReason =
	'Source-safe edit ranges could not be identified for this file, so the parsed view is read-only.';

export function prepareSourceBackedDocument(document: RdlDocument): RdlDocument {
	if (!document.source) return document;

	const editRanges = buildSourceEditRanges(document);
	const hasRanges = Object.keys(editRanges.registers).length > 0;

	return {
		...document,
		registers: applySymbolicResetSelections(document, editRanges),
		source: {
			...document.source,
			editRanges,
			readOnly: !hasRanges,
			readOnlyReason: hasRanges ? '' : sourceReadOnlyReason,
		},
	};
}

export function sourceContentFor(document: RdlDocument): string {
	const source = document.source;
	if (!source?.editRanges) return source?.text ?? '';
	return applySourceEdits(source.text, source.editRanges, document);
}

function applySymbolicResetSelections(document: RdlDocument, editRanges: RdlSourceEditRanges) {
	return document.registers.map((register) => {
		const registerRanges = editRanges.registers[register.id];
		if (!registerRanges) return register;
		return {
			...register,
			fields: register.fields.map((field) => {
				const resetSource = registerRanges.fields[field.id]?.reset?.value;
				const enumValue = resetSource?.enumValueName
					? field.values.find(
							(value) =>
								value.name === resetSource.enumValueName &&
								(!resetSource.enumName || resetSource.enumName === field.enumName),
						)
					: undefined;
				return enumValue ? { ...field, resetEnumValueId: enumValue.id } : field;
			}),
		};
	});
}

export function canEditRegisterSourceProp(
	document: RdlDocument,
	registerId: string,
	prop: EditableRegisterProp,
) {
	if (!document.source) return true;
	return Boolean(document.source.editRanges?.registers[registerId]?.[prop]);
}

export function canEditFieldSourceProp(
	document: RdlDocument,
	registerId: string,
	fieldId: string,
	prop: EditableFieldProp,
) {
	if (!document.source) return true;
	const registerRanges = document.source.editRanges?.registers[registerId];
	if (!registerRanges) return false;
	const fieldRanges = registerRanges.fields[fieldId];
	if (!fieldRanges) return canEditNewSourceField(registerRanges, prop);
	return Boolean(fieldRanges[prop] || canInsertMissingFieldSourceProp(fieldRanges, prop));
}

export function canEditEnumValueSourceProp(
	document: RdlDocument,
	registerId: string,
	fieldId: string,
	enumValueId: string,
	prop: EditableEnumValueProp,
) {
	if (!document.source) return true;
	const fieldRanges = document.source.editRanges?.registers[registerId]?.fields[fieldId];
	if (!fieldRanges) return false;
	const valueRanges = fieldRanges.values[enumValueId];
	if (!valueRanges) return canEditNewSourceEnumValue(fieldRanges);
	return Boolean(valueRanges[prop]);
}

function canEditNewSourceField(registerRanges: RegisterSourceEditRanges, prop: EditableFieldProp) {
	if (registerRanges.bodyEnd === undefined) return false;
	return (
		prop === 'name' ||
		prop === 'title' ||
		prop === 'desc' ||
		prop === 'bitRange' ||
		prop === 'reset' ||
		prop === 'sw' ||
		prop === 'hw' ||
		prop === 'enumName'
	);
}

function canInsertMissingFieldSourceProp(
	fieldRanges: FieldSourceEditRanges,
	prop: EditableFieldProp,
) {
	if (prop === 'enumName') return fieldRanges.bodyEnd !== undefined;
	return false;
}

function canEditNewSourceEnumValue(fieldRanges: FieldSourceEditRanges) {
	return fieldRanges.enumBodyEnd !== undefined || fieldRanges.fullRange !== undefined;
}

function buildSourceEditRanges(document: RdlDocument): RdlSourceEditRanges {
	const text = document.source?.text ?? '';
	const addrmap = findAddrmapBody(text);
	const registerBlocks = collectRegisterBlocks(text);
	const availableRegisterBlocks = new Map(
		registerBlocks.map((block) => [block.instanceName, block]),
	);
	const registers: Record<string, RegisterSourceEditRanges> = {};

	for (const register of document.registers) {
		const block = availableRegisterBlocks.get(register.name);
		if (!block) continue;
		availableRegisterBlocks.delete(register.name);

		const range = buildRegisterRanges(text, block, register);
		if (hasRegisterRanges(range)) {
			registers[register.id] = range;
		}
	}

	return {
		addrmapBodyEnd: addrmap?.bodyEnd,
		addrmapIndent: addrmap ? childIndentFor(text, addrmap.bodyStart, addrmap.bodyEnd) : undefined,
		registers,
	};
}

function buildRegisterRanges(
	text: string,
	block: Block,
	register: Register,
): RegisterSourceEditRanges {
	const fieldBlocks = collectFieldBlocks(text, block.bodyStart, block.bodyEnd);
	const availableFieldBlocks = new Map(
		fieldBlocks.map((fieldBlock) => [fieldBlock.instanceName, fieldBlock]),
	);
	const fields: Record<string, FieldSourceEditRanges> = {};

	for (const field of register.fields) {
		const fieldBlock = availableFieldBlocks.get(field.name);
		if (!fieldBlock) continue;
		availableFieldBlocks.delete(field.name);

		const range = buildFieldRanges(text, fieldBlock, block, field);
		if (hasFieldRanges(range)) {
			fields[field.id] = range;
		}
	}

	return {
		fullRange: expandLeadingCommentRange(text, block.start, block.end),
		bodyEnd: block.bodyEnd,
		bodyIndent: childIndentFor(text, block.bodyStart, block.bodyEnd),
		name: token(block.instanceRange, register.name),
		title: sourceStringProperty(text, block, ['name'], register.title),
		desc: sourceStringProperty(text, block, ['desc'], register.desc),
		address: block.addressRange ? token(block.addressRange, register.address) : undefined,
		group: sourceStringProperty(text, block, ['doc_group'], register.group),
		sw: sourceAccessProperty(text, block, ['default', 'sw'], register.sw),
		hw: sourceAccessProperty(text, block, ['default', 'hw'], register.hw),
		fields,
	};
}

function buildFieldRanges(
	text: string,
	fieldBlock: Block,
	registerBlock: Block,
	field: Field,
): FieldSourceEditRanges {
	const enumBlock =
		field.enumName && field.values.length
			? collectEnumBlocks(text, registerBlock.bodyStart, registerBlock.bodyEnd).find(
					(block) => block.name === field.enumName,
				)
			: undefined;

	return {
		fullRange: expandLeadingCommentRange(text, fieldBlock.start, fieldBlock.end),
		bodyEnd: fieldBlock.bodyEnd,
		bodyIndent: childIndentFor(text, fieldBlock.bodyStart, fieldBlock.bodyEnd),
		enumRange: enumBlock
			? expandLeadingCommentRange(text, enumBlock.start, enumBlock.end)
			: undefined,
		enumBodyEnd: enumBlock?.bodyEnd,
		enumBodyIndent: enumBlock
			? childIndentFor(text, enumBlock.bodyStart, enumBlock.bodyEnd)
			: undefined,
		name: token(fieldBlock.instanceRange, field.name),
		title: sourceStringProperty(text, fieldBlock, ['name'], field.title),
		desc: sourceStringProperty(text, fieldBlock, ['desc'], field.desc),
		bitRange: sourceBitRange(text, fieldBlock, field),
		reset: sourceResetProperty(text, fieldBlock, ['reset'], field),
		sw: sourceAccessProperty(text, fieldBlock, ['sw'], field.sw),
		hw: sourceAccessProperty(text, fieldBlock, ['hw'], field.hw),
		enumName: sourceStringToken(
			findAssignment(text, fieldBlock.bodyStart, fieldBlock.bodyEnd, ['encode'], 0),
			field.enumName ?? '',
		),
		values: buildEnumValueRanges(text, registerBlock, field),
	};
}

function buildEnumValueRanges(text: string, registerBlock: Block, field: Field) {
	const values: Record<string, EnumValueSourceEditRanges> = {};
	if (!field.enumName || !field.values.length) return values;

	const enumBlock = collectEnumBlocks(text, registerBlock.bodyStart, registerBlock.bodyEnd).find(
		(block) => block.name === field.enumName,
	);
	if (!enumBlock) return values;

	const members = new Map(
		collectEnumMemberBlocks(text, enumBlock.bodyStart, enumBlock.bodyEnd).map((member) => [
			member.name,
			member,
		]),
	);

	for (const value of field.values) {
		const member = members.get(value.name);
		if (!member) continue;
		values[value.id] = {
			fullRange: member.fullRange,
			name: token(member.nameRange, value.name),
			value: token(member.valueRange, value.value),
			desc:
				member.bodyStart === undefined || member.bodyEnd === undefined
					? undefined
					: sourceStringToken(
							findAssignment(text, member.bodyStart, member.bodyEnd, ['desc'], 0),
							value.desc,
						),
		};
	}

	return values;
}

function applySourceEdits(
	sourceText: string,
	editRanges: RdlSourceEditRanges,
	document: RdlDocument,
) {
	const replacements: Replacement[] = [];
	const deletedRanges: SourceRange[] = [];
	const structuralReplacements = structuralSourceReplacements(sourceText, editRanges, document);
	for (const replacement of structuralReplacements) {
		replacements.push(replacement);
		if (!replacement.text && replacement.range.start !== replacement.range.end) {
			deletedRanges.push(replacement.range);
		}
	}

	for (const register of document.registers) {
		const ranges = editRanges.registers[register.id];
		if (!ranges) continue;
		if (deletedRanges.some((range) => containsRange(range, ranges.fullRange))) continue;

		replaceString(replacements, ranges.name, register.name, rdlIdentifier);
		replaceString(replacements, ranges.title, register.title, rdlString);
		replaceString(replacements, ranges.desc, register.desc, rdlString);
		replaceString(replacements, ranges.group, register.group, rdlString);
		replaceNumber(replacements, ranges.address, register.address, rdlAddress);
		replaceAccess(replacements, ranges.sw, register.sw);
		replaceAccess(replacements, ranges.hw, register.hw);

		for (const field of register.fields) {
			const fieldRanges = ranges.fields[field.id];
			if (!fieldRanges) continue;
			if (deletedRanges.some((range) => containsRange(range, fieldRanges.fullRange))) continue;

			replaceString(replacements, fieldRanges.name, field.name, rdlIdentifier);
			replaceString(replacements, fieldRanges.title, field.title, rdlString);
			replaceString(replacements, fieldRanges.desc, field.desc, rdlString);
			replaceBitRange(replacements, fieldRanges.bitRange, field);
			replaceReset(replacements, fieldRanges.reset, field);
			replaceAccess(replacements, fieldRanges.sw, field.sw);
			replaceAccess(replacements, fieldRanges.hw, field.hw);
			replaceString(replacements, fieldRanges.enumName, field.enumName ?? '', rdlIdentifier);

			for (const value of field.values) {
				const valueRanges = fieldRanges.values[value.id];
				if (!valueRanges) continue;
				if (deletedRanges.some((range) => containsRange(range, valueRanges.fullRange))) continue;

				replaceString(replacements, valueRanges.name, value.name, rdlIdentifier);
				replaceNumber(replacements, valueRanges.value, value.value, rdlInteger);
				replaceString(replacements, valueRanges.desc, value.desc, rdlString);
			}
		}
	}

	return applyReplacements(sourceText, replacements);
}

function structuralSourceReplacements(
	sourceText: string,
	editRanges: RdlSourceEditRanges,
	document: RdlDocument,
) {
	const replacements: Replacement[] = [];
	const currentRegisterIds = new Set(document.registers.map((register) => register.id));
	const sourceRegisterIds = Object.keys(editRanges.registers);
	if (
		orderChanged(
			sourceRegisterIds,
			document.registers.map((register) => register.id),
		)
	) {
		for (const ranges of Object.values(editRanges.registers)) {
			if (ranges.fullRange) replacements.push({ range: ranges.fullRange, text: '' });
		}
		if (editRanges.addrmapBodyEnd !== undefined) {
			replacements.push({
				range: { start: editRanges.addrmapBodyEnd, end: editRanges.addrmapBodyEnd },
				text: `\n${document.registers
					.map((register) => sourceRegister(register, editRanges.addrmapIndent ?? '\t'))
					.join('\n')}`,
			});
		}
		return replacements;
	}

	for (const [registerId, ranges] of Object.entries(editRanges.registers)) {
		if (!currentRegisterIds.has(registerId) && ranges.fullRange) {
			replacements.push({ range: ranges.fullRange, text: '' });
		}
	}

	for (const register of document.registers) {
		const ranges = editRanges.registers[register.id];
		if (!ranges) {
			const insertAt = editRanges.addrmapBodyEnd;
			if (insertAt !== undefined) {
				replacements.push({
					range: { start: insertAt, end: insertAt },
					text: `\n${sourceRegister(register, editRanges.addrmapIndent ?? '\t')}`,
				});
			}
			continue;
		}

		const sourceFieldIds = Object.keys(ranges.fields);
		if (
			orderChanged(
				sourceFieldIds,
				register.fields.map((field) => field.id),
			)
		) {
			for (const fieldRanges of Object.values(ranges.fields)) {
				if (fieldRanges.enumRange) replacements.push({ range: fieldRanges.enumRange, text: '' });
				if (fieldRanges.fullRange) replacements.push({ range: fieldRanges.fullRange, text: '' });
			}
			if (ranges.bodyEnd !== undefined) {
				replacements.push({
					range: { start: ranges.bodyEnd, end: ranges.bodyEnd },
					text: `\n${register.fields
						.flatMap((field) => [
							...(field.values.length && field.enumName
								? [sourceEnum(field, ranges.bodyIndent ?? '\t\t')]
								: []),
							sourceField(register, field, ranges.bodyIndent ?? '\t\t'),
						])
						.join('\n')}`,
				});
			}
			continue;
		}

		const currentFieldIds = new Set(register.fields.map((field) => field.id));
		for (const [fieldId, fieldRanges] of Object.entries(ranges.fields)) {
			if (!currentFieldIds.has(fieldId) && fieldRanges.fullRange) {
				replacements.push({ range: fieldRanges.fullRange, text: '' });
			}
		}

		for (const field of register.fields) {
			const fieldRanges = ranges.fields[field.id];
			if (!fieldRanges) {
				const insertAt = ranges.bodyEnd;
				if (insertAt !== undefined) {
					replacements.push({
						range: { start: insertAt, end: insertAt },
						text: `\n${sourceField(register, field, ranges.bodyIndent ?? '\t\t')}`,
					});
				}
				continue;
			}

			const rewrittenEnumRange = enumOrderChanged(
				Object.keys(fieldRanges.values),
				field.values.map((value) => value.id),
			)
				? rewriteEnumMembers(replacements, fieldRanges, field)
				: undefined;
			const currentValueIds = new Set(field.values.map((value) => value.id));
			for (const [valueId, valueRanges] of Object.entries(fieldRanges.values)) {
				if (containsRange(rewrittenEnumRange, valueRanges.fullRange)) continue;
				if (!currentValueIds.has(valueId) && valueRanges.fullRange) {
					replacements.push({ range: valueRanges.fullRange, text: '' });
				}
			}

			if (field.values.length && field.enumName && !fieldRanges.enumRange) {
				const insertAt = fieldRanges.fullRange?.start ?? fieldRanges.bodyEnd;
				if (insertAt !== undefined) {
					replacements.push({
						range: { start: insertAt, end: insertAt },
						text: `${sourceEnum(field, ranges.bodyIndent ?? '\t\t')}\n`,
					});
				}
			}

			if (field.values.length && field.enumName && !fieldRanges.enumName && fieldRanges.bodyEnd) {
				replacements.push({
					range: { start: fieldRanges.bodyEnd, end: fieldRanges.bodyEnd },
					text: `\n${fieldRanges.bodyIndent ?? '\t\t\t'}encode = ${rdlIdentifier(field.enumName)};`,
				});
			}

			for (const value of field.values) {
				if (rewrittenEnumRange) continue;
				if (fieldRanges.values[value.id] || !fieldRanges.enumBodyEnd) continue;
				replacements.push({
					range: { start: fieldRanges.enumBodyEnd, end: fieldRanges.enumBodyEnd },
					text: `\n${sourceEnumValue(value, fieldRanges.enumBodyIndent ?? '\t\t\t')}`,
				});
			}
		}
	}

	return replacements;
}

function enumOrderChanged(sourceIds: string[], currentIds: string[]) {
	if (sourceIds.length === 0) return false;
	return orderChanged(sourceIds, currentIds);
}

function rewriteEnumMembers(
	replacements: Replacement[],
	fieldRanges: FieldSourceEditRanges,
	field: Field,
) {
	const ranges = Object.values(fieldRanges.values)
		.map((valueRanges) => valueRanges.fullRange)
		.filter((range): range is SourceRange => Boolean(range));
	if (!ranges.length) return undefined;

	const range = {
		start: Math.min(...ranges.map((item) => item.start)),
		end: Math.max(...ranges.map((item) => item.end)),
	};
	replacements.push({
		range,
		text: field.values
			.map((value) => sourceEnumValue(value, fieldRanges.enumBodyIndent ?? '\t\t\t'))
			.join('\n'),
	});
	return range;
}

function orderChanged(sourceIds: string[], currentIds: string[]) {
	const knownCurrentIds = currentIds.filter((id) => sourceIds.includes(id));
	const remainingSourceIds = sourceIds.filter((id) => currentIds.includes(id));
	return knownCurrentIds.join('\0') !== remainingSourceIds.join('\0');
}

function containsRange(container: SourceRange | undefined, range: SourceRange | undefined) {
	return Boolean(
		container && range && container.start <= range.start && range.end <= container.end,
	);
}

function replaceString(
	replacements: Replacement[],
	source: SourceToken<string> | undefined,
	next: string,
	format: (value: string) => string,
) {
	if (!source || source.value === next) return;
	replacements.push({ range: source.range, text: format(next) });
}

function replaceNumber(
	replacements: Replacement[],
	source: SourceToken<number> | undefined,
	next: number,
	format: (value: number) => string,
) {
	if (!source || source.value === next) return;
	replacements.push({ range: source.range, text: format(next) });
}

function replaceReset(
	replacements: Replacement[],
	source: SourceToken<ResetSourceValue> | undefined,
	field: Field,
) {
	if (!source) return;
	const nextText = rdlReset(field);
	const nextSourceValue = resetSourceValue(nextText, field);
	if (
		source.value.value === nextSourceValue.value &&
		source.value.enumName === nextSourceValue.enumName &&
		source.value.enumValueName === nextSourceValue.enumValueName
	) {
		return;
	}
	replacements.push({ range: source.range, text: nextText });
}

function replaceAccess(
	replacements: Replacement[],
	source: SourceToken<Access> | undefined,
	next: Access,
) {
	if (!source || source.value === next) return;
	replacements.push({ range: source.range, text: rdlAccess(next) });
}

function replaceBitRange(
	replacements: Replacement[],
	source: SourceToken<{ msb: number; lsb: number }> | undefined,
	field: Field,
) {
	if (!source || (source.value.msb === field.msb && source.value.lsb === field.lsb)) return;
	replacements.push({
		range: source.range,
		text: `[${rdlInteger(field.msb)}:${rdlInteger(field.lsb)}]`,
	});
}

function applyReplacements(sourceText: string, replacements: Replacement[]) {
	const ordered = [...replacements].sort((left, right) => right.range.start - left.range.start);
	let next = sourceText;
	let previousStart = sourceText.length + 1;

	for (const replacement of ordered) {
		if (
			replacement.range.start < 0 ||
			replacement.range.end < replacement.range.start ||
			replacement.range.end > sourceText.length ||
			replacement.range.end > previousStart
		) {
			continue;
		}

		next =
			next.slice(0, replacement.range.start) + replacement.text + next.slice(replacement.range.end);
		previousStart = replacement.range.start;
	}

	return next;
}

function sourceStringProperty(text: string, block: Block, names: string[], value: string) {
	return sourceStringToken(findAssignment(text, block.bodyStart, block.bodyEnd, names, 0), value);
}

function sourceResetProperty(text: string, block: Block, names: string[], field: Field) {
	const range = findAssignment(text, block.bodyStart, block.bodyEnd, names, 0);
	if (!range) return undefined;
	return token(range, resetSourceValue(text.slice(range.start, range.end), field));
}

function resetSourceValue(rawValue: string, field: Field): ResetSourceValue {
	const symbolic = rawValue.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)::([A-Za-z_][A-Za-z0-9_]*)$/);
	if (!symbolic) return { value: field.reset };
	const enumValue = field.values.find((value) => value.name === symbolic[2]);
	return {
		value: enumValue?.value ?? field.reset,
		enumName: symbolic[1],
		enumValueName: symbolic[2],
	};
}

function sourceAccessProperty(text: string, block: Block, names: string[], value: Access) {
	const range = findAssignment(text, block.bodyStart, block.bodyEnd, names, 0);
	return range ? token(range, value) : undefined;
}

function sourceStringToken(range: SourceRange | undefined, value: string) {
	return range ? token(range, value) : undefined;
}

function sourceBitRange(text: string, fieldBlock: Block, field: Field) {
	const open = findNextSignificant(text, fieldBlock.instanceRange.end, fieldBlock.end, '[');
	if (open === -1) return undefined;
	const close = findNextSignificant(text, open + 1, fieldBlock.end, ']');
	if (close === -1) return undefined;
	return token({ start: open, end: close + 1 }, { msb: field.msb, lsb: field.lsb });
}

function token<T extends string | number | ResetSourceValue | { msb: number; lsb: number }>(
	range: SourceRange,
	value: T,
) {
	return { range, value };
}

function hasRegisterRanges(range: RegisterSourceEditRanges) {
	return Boolean(
		range.name ||
		range.title ||
		range.desc ||
		range.address ||
		range.group ||
		range.sw ||
		range.hw ||
		Object.keys(range.fields).length,
	);
}

function hasFieldRanges(range: FieldSourceEditRanges) {
	return Boolean(
		range.name ||
		range.title ||
		range.desc ||
		range.bitRange ||
		range.reset ||
		range.sw ||
		range.hw ||
		range.enumName ||
		Object.keys(range.values).length,
	);
}

function collectRegisterBlocks(text: string) {
	const blocks: Block[] = [];
	let index = 0;

	while (index < text.length) {
		const found = findBlock(text, index, text.length, 'reg');
		if (!found) break;
		if (found.addressRange) blocks.push(found);
		index = found.end;
	}

	return blocks;
}

function findAddrmapBody(text: string) {
	let index = 0;

	while (index < text.length) {
		const skipped = skipNonCode(text, index, text.length);
		if (skipped !== index) {
			index = skipped;
			continue;
		}

		const id = readIdentifier(text, index, text.length);
		if (!id) {
			index++;
			continue;
		}

		if (id.value !== 'addrmap') {
			index = id.end;
			continue;
		}

		const name = readIdentifier(text, skipTrivia(text, id.end, text.length), text.length);
		const openBrace = findNextSignificant(text, name?.end ?? id.end, text.length, '{');
		if (openBrace === -1) {
			index = id.end;
			continue;
		}

		const closeBrace = findMatchingBrace(text, openBrace, text.length);
		if (closeBrace === -1) {
			index = openBrace + 1;
			continue;
		}

		return { bodyStart: openBrace + 1, bodyEnd: closeBrace };
	}

	return undefined;
}

function collectFieldBlocks(text: string, start: number, end: number) {
	const blocks: Block[] = [];
	let index = start;

	while (index < end) {
		const found = findBlock(text, index, end, 'field', 0);
		if (!found) break;
		blocks.push(found);
		index = found.end;
	}

	return blocks;
}

function collectEnumBlocks(text: string, start: number, end: number) {
	const blocks: EnumBlock[] = [];
	let index = start;

	while (index < end) {
		const found = findEnumBlock(text, index, end, 0);
		if (!found) break;
		blocks.push(found);
		index = found.bodyEnd + 1;
	}

	return blocks;
}

function collectEnumMemberBlocks(text: string, start: number, end: number) {
	const members: EnumMemberBlock[] = [];
	let index = start;

	while (index < end) {
		index = skipTrivia(text, index, end);
		if (index >= end) break;

		const name = readIdentifier(text, index, end);
		if (!name) {
			index = skipToken(text, index, end);
			continue;
		}

		let cursor = skipTrivia(text, name.end, end);
		if (text[cursor] !== '=') {
			index = name.end;
			continue;
		}

		const valueStart = skipTrivia(text, cursor + 1, end);
		const valueEnd = findEnumValueEnd(text, valueStart, end);
		const valueRange = trimRange(text, { start: valueStart, end: valueEnd });
		cursor = skipTrivia(text, valueEnd, end);

		let bodyStart: number | undefined;
		let bodyEnd: number | undefined;
		if (text[cursor] === '{') {
			const closeBrace = findMatchingBrace(text, cursor, end);
			if (closeBrace !== -1) {
				bodyStart = cursor + 1;
				bodyEnd = closeBrace;
				cursor = closeBrace + 1;
			}
		}

		const statementEnd = findNextSignificant(text, cursor, end, ';');
		const fullEnd = statementEnd === -1 ? cursor + 1 : statementEnd + 1;
		members.push({
			name: name.value,
			fullRange: expandLeadingCommentRange(text, name.start, fullEnd),
			nameRange: { start: name.start, end: name.end },
			valueRange,
			bodyStart,
			bodyEnd,
		});
		index = fullEnd;
	}

	return members;
}

function findBlock(
	text: string,
	start: number,
	end: number,
	keyword: string,
	targetDepth?: number,
): Block | undefined {
	let index = start;
	let depth = 0;

	while (index < end) {
		const skipped = skipNonCode(text, index, end);
		if (skipped !== index) {
			index = skipped;
			continue;
		}

		const char = text[index];
		if (char === '{') {
			depth++;
			index++;
			continue;
		}
		if (char === '}') {
			depth = Math.max(0, depth - 1);
			index++;
			continue;
		}

		const id = readIdentifier(text, index, end);
		if (!id) {
			index++;
			continue;
		}

		if (id.value !== keyword || (targetDepth !== undefined && depth !== targetDepth)) {
			index = id.end;
			continue;
		}

		const openBrace = skipTrivia(text, id.end, end);
		if (text[openBrace] !== '{') {
			index = id.end;
			continue;
		}

		const closeBrace = findMatchingBrace(text, openBrace, end);
		if (closeBrace === -1) {
			index = openBrace + 1;
			continue;
		}

		const instance = readIdentifier(text, skipTrivia(text, closeBrace + 1, end), end);
		if (!instance) {
			index = closeBrace + 1;
			continue;
		}

		const addressMarker = findNextSignificant(text, instance.end, end, '@');
		const statementEnd = findNextSignificant(text, instance.end, end, ';');
		if (statementEnd === -1 || (addressMarker !== -1 && addressMarker > statementEnd)) {
			index = instance.end;
			continue;
		}

		return {
			start: id.start,
			openBrace,
			bodyStart: openBrace + 1,
			bodyEnd: closeBrace,
			closeBrace,
			end: statementEnd + 1,
			instanceName: instance.value,
			instanceRange: { start: instance.start, end: instance.end },
			addressRange:
				addressMarker === -1
					? undefined
					: trimRange(text, {
							start: skipTrivia(text, addressMarker + 1, statementEnd),
							end: statementEnd,
						}),
		};
	}

	return undefined;
}

function findEnumBlock(
	text: string,
	start: number,
	end: number,
	targetDepth: number,
): EnumBlock | undefined {
	let index = start;
	let depth = 0;

	while (index < end) {
		const skipped = skipNonCode(text, index, end);
		if (skipped !== index) {
			index = skipped;
			continue;
		}

		if (text[index] === '{') {
			depth++;
			index++;
			continue;
		}
		if (text[index] === '}') {
			depth = Math.max(0, depth - 1);
			index++;
			continue;
		}

		const id = readIdentifier(text, index, end);
		if (!id) {
			index++;
			continue;
		}

		if (id.value !== 'enum' || depth !== targetDepth) {
			index = id.end;
			continue;
		}

		const enumName = readIdentifier(text, skipTrivia(text, id.end, end), end);
		if (!enumName) {
			index = id.end;
			continue;
		}

		const openBrace = findNextSignificant(text, enumName.end, end, '{');
		if (openBrace === -1) {
			index = enumName.end;
			continue;
		}

		const closeBrace = findMatchingBrace(text, openBrace, end);
		if (closeBrace === -1) {
			index = openBrace + 1;
			continue;
		}

		const statementEnd = findNextSignificant(text, closeBrace + 1, end, ';');
		return {
			name: enumName.value,
			start: id.start,
			bodyStart: openBrace + 1,
			bodyEnd: closeBrace,
			end: statementEnd === -1 ? closeBrace + 1 : statementEnd + 1,
		};
	}

	return undefined;
}

function findAssignment(
	text: string,
	start: number,
	end: number,
	names: string[],
	targetDepth: number,
): SourceRange | undefined {
	let index = start;
	let depth = 0;

	while (index < end) {
		const skipped = skipNonCode(text, index, end);
		if (skipped !== index) {
			index = skipped;
			continue;
		}

		const char = text[index];
		if (char === '{') {
			depth++;
			index++;
			continue;
		}
		if (char === '}') {
			depth = Math.max(0, depth - 1);
			index++;
			continue;
		}

		if (depth !== targetDepth) {
			index++;
			continue;
		}

		const matched = matchIdentifierSequence(text, index, end, names);
		if (!matched) {
			index++;
			continue;
		}

		const equals = skipTrivia(text, matched, end);
		if (text[equals] !== '=') {
			index = matched;
			continue;
		}

		const valueStart = skipTrivia(text, equals + 1, end);
		const statementEnd = findStatementEnd(text, valueStart, end);
		if (statementEnd === -1) return undefined;
		return trimRange(text, { start: valueStart, end: statementEnd });
	}

	return undefined;
}

function matchIdentifierSequence(text: string, start: number, end: number, names: string[]) {
	let cursor = start;

	for (const name of names) {
		cursor = skipTrivia(text, cursor, end);
		const id = readIdentifier(text, cursor, end);
		if (!id || id.value !== name) return undefined;
		cursor = id.end;
	}

	return cursor;
}

function findMatchingBrace(text: string, openBrace: number, end: number) {
	let depth = 1;
	let index = openBrace + 1;

	while (index < end) {
		const skipped = skipNonCode(text, index, end);
		if (skipped !== index) {
			index = skipped;
			continue;
		}

		if (text[index] === '{') depth++;
		if (text[index] === '}') depth--;
		if (depth === 0) return index;
		index++;
	}

	return -1;
}

function findStatementEnd(text: string, start: number, end: number) {
	return findNextSignificant(text, start, end, ';');
}

function findEnumValueEnd(text: string, start: number, end: number) {
	let index = start;

	while (index < end) {
		const skipped = skipNonCode(text, index, end);
		if (skipped !== index) {
			index = skipped;
			continue;
		}
		if (text[index] === '{' || text[index] === ';') return index;
		index++;
	}

	return end;
}

function findNextSignificant(text: string, start: number, end: number, target: string) {
	let index = start;

	while (index < end) {
		const skipped = skipNonCode(text, index, end);
		if (skipped !== index) {
			index = skipped;
			continue;
		}
		if (text[index] === target) return index;
		index++;
	}

	return -1;
}

function skipTrivia(text: string, start: number, end: number) {
	let index = start;

	while (index < end) {
		while (index < end && /\s/.test(text[index])) index++;
		const skipped = skipComment(text, index, end);
		if (skipped === index) return index;
		index = skipped;
	}

	return index;
}

function skipNonCode(text: string, start: number, end: number) {
	if (text[start] === '"') return skipString(text, start, end);
	return skipComment(text, start, end);
}

function skipComment(text: string, start: number, end: number) {
	if (text[start] === '/' && text[start + 1] === '/') {
		const newline = text.indexOf('\n', start + 2);
		return newline === -1 ? end : newline + 1;
	}
	if (text[start] === '/' && text[start + 1] === '*') {
		const close = text.indexOf('*/', start + 2);
		return close === -1 ? end : close + 2;
	}
	return start;
}

function skipString(text: string, start: number, end: number) {
	let index = start + 1;
	while (index < end) {
		if (text[index] === '\\') {
			index += 2;
			continue;
		}
		if (text[index] === '"') return index + 1;
		index++;
	}
	return end;
}

function skipToken(text: string, start: number, end: number) {
	if (text[start] === '"') return skipString(text, start, end);
	const comment = skipComment(text, start, end);
	if (comment !== start) return comment;
	return start + 1;
}

function readIdentifier(text: string, start: number, end: number) {
	if (!isIdentifierStart(text[start])) return undefined;
	let cursor = start + 1;
	while (cursor < end && isIdentifierPart(text[cursor])) cursor++;
	return { value: text.slice(start, cursor), start, end: cursor };
}

function isIdentifierStart(char: string | undefined) {
	return Boolean(char && /[A-Za-z_]/.test(char));
}

function isIdentifierPart(char: string | undefined) {
	return Boolean(char && /[A-Za-z0-9_]/.test(char));
}

function trimRange(text: string, range: SourceRange) {
	let start = range.start;
	let end = range.end;
	while (start < end && /\s/.test(text[start])) start++;
	while (end > start && /\s/.test(text[end - 1])) end--;
	return { start, end };
}

function expandLeadingCommentRange(text: string, start: number, end: number): SourceRange {
	let cursor = lineStart(text, start);

	while (cursor > 0) {
		const previousEnd = cursor - 1;
		const previousStart = lineStart(text, previousEnd);
		const line = text.slice(previousStart, previousEnd).trim();
		if (!line.startsWith('//')) break;
		cursor = previousStart;
	}

	return { start: cursor, end };
}

function lineStart(text: string, index: number) {
	const newline = text.lastIndexOf('\n', Math.max(0, index - 1));
	return newline === -1 ? 0 : newline + 1;
}

function childIndentFor(text: string, start: number, end: number) {
	let index = start;
	while (index < end) {
		const newline = text.indexOf('\n', index);
		if (newline === -1 || newline + 1 >= end) break;
		const lineStartIndex = newline + 1;
		const lineEnd = text.indexOf('\n', lineStartIndex);
		const rawLine = text.slice(lineStartIndex, lineEnd === -1 ? end : lineEnd);
		if (rawLine.trim()) return rawLine.match(/^\s*/)?.[0] ?? '';
		index = lineStartIndex;
	}
	return '\t';
}

function sourceRegister(register: Register, baseIndent: string) {
	const childIndent = `${baseIndent}\t`;
	const lines = [
		`${baseIndent}reg {`,
		register.group ? `${childIndent}doc_group = ${rdlString(register.group)};` : '',
		`${childIndent}default sw = ${rdlAccess(register.sw)};`,
		`${childIndent}default hw = ${rdlAccess(register.hw)};`,
		`${childIndent}name = ${rdlString(register.title)};`,
		`${childIndent}desc = ${rdlString(register.desc)};`,
		...register.fields.flatMap((field) => [
			...(field.values.length && field.enumName ? [sourceEnum(field, childIndent)] : []),
			sourceField(register, field, childIndent),
		]),
		`${baseIndent}} ${rdlIdentifier(register.name)} @ ${rdlAddress(register.address)};`,
	];
	return lines.filter(Boolean).join('\n');
}

function sourceEnum(field: Field, baseIndent: string) {
	const childIndent = `${baseIndent}\t`;
	return [
		`${baseIndent}enum ${rdlIdentifier(field.enumName ?? `${field.name}_e`)} {`,
		...field.values.map((value) => sourceEnumValue(value, childIndent)),
		`${baseIndent}};`,
	].join('\n');
}

function sourceEnumValue(value: EnumValue, baseIndent: string) {
	return `${baseIndent}${rdlIdentifier(value.name)} = ${rdlInteger(value.value)} {desc = ${rdlString(
		value.desc,
	)};};`;
}

function sourceField(register: Register, field: Field, baseIndent: string) {
	const childIndent = `${baseIndent}\t`;
	const lines = [
		`${baseIndent}field {`,
		`${childIndent}name = ${rdlString(field.title)};`,
		`${childIndent}desc = ${rdlString(field.desc)};`,
		`${childIndent}sw = ${rdlAccess(field.sw)};`,
		`${childIndent}hw = ${rdlAccess(field.hw)};`,
		field.values.length && field.enumName
			? `${childIndent}encode = ${rdlIdentifier(field.enumName)};`
			: '',
		`${childIndent}reset = ${rdlReset(field)};`,
		`${baseIndent}} ${rdlIdentifier(field.name)}${sourceRange(field, register.width)};`,
	];
	return lines.filter(Boolean).join('\n');
}

function sourceRange(field: Field, registerWidth: number) {
	const max = Math.max(0, registerWidth - 1);
	const msb = Math.min(Math.max(0, Math.trunc(field.msb)), max);
	const lsb = Math.min(Math.max(0, Math.trunc(field.lsb)), max);
	return `[${msb}:${lsb}]`;
}

function rdlAccess(access: Access) {
	if (access === 'RW') return 'rw';
	if (access === 'WO' || access === 'W') return 'w';
	return 'r';
}

function rdlString(value: string) {
	return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function rdlIdentifier(value: string) {
	const candidate = value
		.trim()
		.replace(/[^A-Za-z0-9_]/g, '_')
		.replace(/_+/g, '_')
		.replace(/^([^A-Za-z_])/, '_$1');

	return candidate || 'item';
}

function rdlReset(field: Field) {
	const enumValue = field.values.find((value) => value.id === field.resetEnumValueId);
	if (enumValue && field.enumName) {
		return `${rdlIdentifier(field.enumName)}::${rdlIdentifier(enumValue.name)}`;
	}
	return rdlInteger(field.reset);
}

function rdlAddress(value: number) {
	return `0x${Math.max(0, Math.trunc(value)).toString(16)}`;
}

function rdlInteger(value: number) {
	return `${Math.max(0, Math.trunc(value))}`;
}
