import { Document } from 'flexsearch';
import { formatAddress } from './format';
import type { EnumValue, Field, Register } from './model';

export interface HighlightRange {
	start: number;
	end: number;
}

export interface HighlightPart {
	text: string;
	match: boolean;
}

export interface SearchSnippet {
	label: string;
	text: string;
	ranges: HighlightRange[];
}

export interface RegisterSearchResult {
	register: Register;
	registerId: string;
	nameRanges: HighlightRange[];
	titleRanges: HighlightRange[];
	addressRanges: HighlightRange[];
	snippet?: SearchSnippet;
	score: number;
}

interface RegisterSearchDocument {
	[key: string]: string;
	id: string;
	primary: string;
	content: string;
	address: string;
}

type FlexSearchResult = {
	id: string;
	field?: string[];
};

const resultLimit = 1000;
const searchIndexCache = new WeakMap<Register[], Document<RegisterSearchDocument>>();

export function searchRegisters(registers: Register[], rawQuery: string): RegisterSearchResult[] {
	const query = rawQuery.trim();
	if (!query) return [];

	const index = registerSearchIndex(registers);
	const flexResults = index.search(query, {
		limit: resultLimit,
		merge: true,
	}) as FlexSearchResult[];
	const resultFields = new Map(flexResults.map((result) => [result.id, result.field ?? []]));

	for (const register of registers) {
		if (matchesAddress(register.address, query) && !resultFields.has(register.id)) {
			resultFields.set(register.id, ['address']);
		}
	}

	return registers
		.flatMap((register, index) => {
			const fields = resultFields.get(register.id);
			if (!fields) return [];

			const result = buildSearchResult(register, query, fields, index);
			return result ? [result] : [];
		})
		.sort((left, right) => right.score - left.score);
}

function registerSearchIndex(registers: Register[]) {
	const cached = searchIndexCache.get(registers);
	if (cached) return cached;

	const index = new Document<RegisterSearchDocument>({
		tokenize: 'full',
		cache: 100,
		document: {
			id: 'id',
			index: [
				{ field: 'primary', tokenize: 'full', resolution: 9 },
				{ field: 'address', tokenize: 'forward', resolution: 8 },
				{ field: 'content', tokenize: 'full', resolution: 4 },
			],
		},
	});

	for (const register of registers) {
		index.add(registerSearchDocument(register));
	}

	searchIndexCache.set(registers, index);
	return index;
}

export function highlightTextParts(text: string, ranges: HighlightRange[]): HighlightPart[] {
	const mergedRanges = mergeRanges(ranges);
	if (!mergedRanges.length) return [{ text, match: false }];

	const parts: HighlightPart[] = [];
	let cursor = 0;

	for (const range of mergedRanges) {
		if (range.start > cursor) {
			parts.push({ text: text.slice(cursor, range.start), match: false });
		}
		parts.push({ text: text.slice(range.start, range.end), match: true });
		cursor = range.end;
	}

	if (cursor < text.length) {
		parts.push({ text: text.slice(cursor), match: false });
	}

	return parts;
}

export function matchTextRanges(text: string, query: string): HighlightRange[] {
	const tokens = queryTokens(query);
	if (!tokens.length || !text.trim()) return [];

	const normalized = normalizeWithSourceMap(text);
	const ranges: HighlightRange[] = [];
	let cursor = 0;

	for (const token of tokens) {
		let index = normalized.text.indexOf(token, cursor);
		if (index === -1) index = normalized.text.indexOf(token);
		if (index === -1) continue;

		const sourceStart = normalized.sourceIndexes[index];
		const sourceEnd = normalized.sourceIndexes[index + token.length - 1] + 1;
		ranges.push({ start: sourceStart, end: sourceEnd });
		cursor = index + token.length;
	}

	return mergeRanges(ranges);
}

export function expandSearchText(text: string) {
	const spaced = splitIdentifier(text);
	const compact = spaced.replace(/\s+/g, '');
	return `${text} ${spaced} ${compact}`;
}

export function addressSearchText(address: number) {
	const hex = Math.max(0, address).toString(16);
	const paddedHex = hex.padStart(2, '0');
	const formatted = formatAddress(address);
	return [formatted, `0x${hex}`, `0x${paddedHex}`, hex, paddedHex, address.toString(10)].join(' ');
}

function registerSearchDocument(register: Register): RegisterSearchDocument {
	return {
		id: register.id,
		primary: [
			register.name,
			register.title,
			register.group,
			expandSearchText(register.name),
			expandSearchText(register.title),
			expandSearchText(register.group),
		].join(' '),
		content: [
			register.desc,
			...register.fields.flatMap((field) => [
				field.name,
				field.title,
				field.desc,
				field.enumName ?? '',
				expandSearchText(field.name),
				expandSearchText(field.title),
				expandSearchText(field.enumName ?? ''),
				...field.values.flatMap((value) => [value.name, value.desc, expandSearchText(value.name)]),
			]),
		].join(' '),
		address: addressSearchText(register.address),
	};
}

function buildSearchResult(
	register: Register,
	query: string,
	fields: string[],
	originalIndex: number,
): RegisterSearchResult | undefined {
	const nameRanges = matchTextRanges(register.name, query);
	const titleRanges = matchTextRanges(register.title, query);
	const addressRanges = matchTextRanges(formatAddress(register.address), query);
	const addressMatch = matchesAddress(register.address, query);
	const snippet = bestSnippet(register, query, addressMatch && !addressRanges.length);
	const contentMatched = fields.includes('content') || Boolean(snippet);
	const primaryMatched =
		fields.includes('primary') || nameRanges.length > 0 || titleRanges.length > 0;

	let score = 0;
	if (addressMatch || fields.includes('address')) score += 120;
	if (nameRanges.length || titleRanges.length) score += 110;
	if (primaryMatched) score += 80;
	if (contentMatched) score += 40;
	if (snippet?.label === 'Title') score += 20;
	if (snippet?.label === 'Address') score += 15;
	score -= originalIndex / 1000;

	if (!score) return undefined;

	return {
		register,
		registerId: register.id,
		nameRanges,
		titleRanges,
		addressRanges,
		snippet,
		score,
	};
}

function bestSnippet(
	register: Register,
	query: string,
	needsAddressSnippet: boolean,
): SearchSnippet | undefined {
	if (needsAddressSnippet) {
		const text = `${register.address.toString(10)} (${formatAddress(register.address)})`;
		const ranges = matchTextRanges(text, query);
		return {
			label: 'Address',
			text,
			ranges: ranges.length ? ranges : [{ start: 0, end: register.address.toString(10).length }],
		};
	}

	const candidates = [
		snippetCandidate('Title', register.title),
		snippetCandidate('Group', register.group),
		snippetCandidate('Description', register.desc),
		...register.fields.flatMap((field) => fieldSnippetCandidates(field)),
	].filter((candidate) => candidate.text.trim());

	return candidates
		.map((candidate, index) => ({
			...candidate,
			index,
			ranges: matchTextRanges(candidate.text, query),
			matchedTokens: matchedTokenCount(candidate.text, query),
		}))
		.filter((candidate) => candidate.ranges.length)
		.sort((left, right) => right.matchedTokens - left.matchedTokens || left.index - right.index)[0];
}

function fieldSnippetCandidates(field: Field) {
	return [
		snippetCandidate(`Field ${field.name}`, [field.name, field.title, field.desc].join(' · ')),
		snippetCandidate('Enum', field.enumName ?? ''),
		...field.values.map((value) => enumSnippetCandidate(field, value)),
	];
}

function enumSnippetCandidate(field: Field, value: EnumValue) {
	return snippetCandidate(`Enum ${field.name}`, [value.name, value.desc].join(' · '));
}

function snippetCandidate(label: string, text: string) {
	return { label, text };
}

function matchesAddress(address: number, query: string) {
	const tokens = queryTokens(query);
	if (!tokens.length || !tokens.every(isAddressLikeToken)) return false;

	const variants = addressSearchText(address)
		.split(/\s+/)
		.filter(Boolean)
		.map((value) => value.toLowerCase());

	return tokens.every((token) => variants.some((variant) => variant.startsWith(token)));
}

function isAddressLikeToken(token: string) {
	return /^(?:0x)?[0-9a-f]+$/i.test(token);
}

function queryTokens(query: string) {
	return (
		splitIdentifier(query)
			.toLowerCase()
			.match(/[a-z0-9]+/g)
			?.filter(Boolean) ?? []
	);
}

function matchedTokenCount(text: string, query: string) {
	const normalized = normalizeWithSourceMap(text).text;
	return queryTokens(query).filter((token) => normalized.includes(token)).length;
}

function splitIdentifier(text: string) {
	return text
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/[_/\\.-]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function normalizeWithSourceMap(text: string) {
	let normalized = '';
	const sourceIndexes: number[] = [];

	for (let index = 0; index < text.length; index += 1) {
		const char = text[index];
		const previous = text[index - 1];
		if (previous && /[a-z0-9]/.test(previous) && /[A-Z]/.test(char)) {
			normalized += ' ';
			sourceIndexes.push(index);
		}

		if (/[_/\\.\-\s]/.test(char)) {
			normalized += ' ';
			sourceIndexes.push(index);
			continue;
		}

		normalized += char.toLowerCase();
		sourceIndexes.push(index);
	}

	return { text: normalized, sourceIndexes };
}

function mergeRanges(ranges: HighlightRange[]) {
	return [...ranges]
		.filter((range) => range.end > range.start)
		.sort((left, right) => left.start - right.start)
		.reduce<HighlightRange[]>((merged, range) => {
			const previous = merged[merged.length - 1];
			if (previous && range.start <= previous.end) {
				previous.end = Math.max(previous.end, range.end);
				return merged;
			}
			merged.push({ ...range });
			return merged;
		}, []);
}
