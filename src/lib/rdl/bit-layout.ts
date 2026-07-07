import type { Register } from './model';
import { fieldOverlaps } from './validation';

export interface BitSegment {
	readonly key: string;
	readonly label: string;
	readonly span: number;
	readonly classes: string;
	readonly fieldId?: string;
}

export interface BitAxisLabel {
	readonly value: number;
	readonly position: number;
}

export interface BitCell {
	readonly bit: number;
	readonly key: string;
	readonly label: string;
	readonly classes: string;
	readonly fieldId?: string;
	readonly overlapFieldId?: string;
	readonly overlapLabel?: string;
	readonly conflict: boolean;
	readonly showLabel: boolean;
	readonly showRightBorder: boolean;
}

export interface BitRun {
	readonly key: string;
	readonly label: string;
	readonly span: number;
	readonly classes: string;
	readonly fieldId?: string;
	readonly conflict: boolean;
}

export interface BitOverlapRun {
	readonly key: string;
	readonly label: string;
	readonly columnStart: number;
	readonly span: number;
	readonly fieldId?: string;
}

export function buildBitSegments(register: Register): BitSegment[] {
	const byMsb = [...register.fields].sort((a, b) => b.msb - a.msb);
	const segments: BitSegment[] = [];
	let cursor = register.width - 1;

	for (const field of byMsb) {
		const high = Math.max(field.msb, field.lsb);
		const low = Math.min(field.msb, field.lsb);
		if (cursor > high) {
			segments.push({
				key: `reserved-${cursor}-${high + 1}`,
				label: `Reserved [${cursor}:${high + 1}]`,
				span: cursor - high,
				classes: 'border-border bg-muted/50 text-muted-foreground',
			});
		}
		segments.push({
			key: field.id,
			label: high === low ? `${field.title} [${high}]` : `${field.title} [${high}:${low}]`,
			span: high - low + 1,
			classes: field.color,
			fieldId: field.id,
		});
		cursor = low - 1;
	}

	if (cursor >= 0) {
		segments.push({
			key: `reserved-${cursor}-0`,
			label: cursor === 0 ? 'Reserved [0]' : `Reserved [${cursor}:0]`,
			span: cursor + 1,
			classes: 'border-border bg-muted/50 text-muted-foreground',
		});
	}

	return segments;
}

export function buildBitAxisLabels(width: number): BitAxisLabel[] {
	const msb = width - 1;
	const labels = [msb, 0];
	return [...new Set(labels)].map((value) => ({
		value,
		position: ((msb - value) / Math.max(1, msb)) * 100,
	}));
}

export function buildBitCells(register: Register): BitCell[] {
	const overlaps = fieldOverlaps(register);

	return Array.from({ length: register.width }, (_, index) => {
		const bit = register.width - 1 - index;
		const fields = register.fields.filter((field) => field.msb >= bit && field.lsb <= bit);
		const field = fields[0];
		const overlap = overlaps.find((item) => item.high >= bit && item.low <= bit);
		const nextBit = bit - 1;
		const nextFields =
			nextBit >= 0
				? register.fields.filter((item) => item.msb >= nextBit && item.lsb <= nextBit)
				: [];
		const nextField = nextFields[0];
		const nextOverlap = overlaps.find((item) => item.high >= nextBit && item.low <= nextBit);
		const previousBit = bit + 1;
		const previousFields =
			previousBit < register.width
				? register.fields.filter((item) => item.msb >= previousBit && item.lsb <= previousBit)
				: [];
		const previousField = previousFields[0];
		const previousOverlap = overlaps.find(
			(item) => item.high >= previousBit && item.low <= previousBit,
		);
		const showRightBorder =
			nextBit < 0 ||
			field?.id !== nextField?.id ||
			Boolean(overlap) !== Boolean(nextOverlap) ||
			overlap?.fieldIds.join('|') !== nextOverlap?.fieldIds.join('|');
		const showLabel =
			previousBit >= register.width ||
			field?.id !== previousField?.id ||
			Boolean(overlap) !== Boolean(previousOverlap) ||
			overlap?.fieldIds.join('|') !== previousOverlap?.fieldIds.join('|');
		const overlapRange = overlap
			? overlap.high === overlap.low
				? `[${overlap.high}]`
				: `[${overlap.high}:${overlap.low}]`
			: '';
		const overlapLabel = overlap
			? `Overlap ${overlapRange}: ${overlap.fieldTitles.join(', ')}`
			: undefined;

		return {
			bit,
			key: `bit-${bit}`,
			label: field ? `${field.title} [${bit}]` : `Reserved [${bit}]`,
			classes: field?.color ?? 'border-border bg-muted/50 text-muted-foreground',
			fieldId: field?.id,
			overlapFieldId: overlap?.fieldIds[0],
			overlapLabel,
			conflict: Boolean(overlap),
			showLabel,
			showRightBorder,
		};
	});
}

export function buildBitRuns(register: Register): BitRun[] {
	const cells = buildBitCells(register);
	const runs: BitRun[] = [];

	for (const cell of cells) {
		const previous = runs.at(-1);
		if (previous && previous.fieldId === cell.fieldId && previous.classes === cell.classes) {
			runs[runs.length - 1] = {
				...previous,
				label: runLabel(previous.label, cell),
				span: previous.span + 1,
			};
			continue;
		}

		runs.push({
			key: `run-${cell.bit}`,
			label: cell.fieldId ? cell.label : `Reserved [${cell.bit}]`,
			span: 1,
			classes: cell.classes,
			fieldId: cell.fieldId,
			conflict: cell.conflict,
		});
	}

	return runs;
}

export function buildBitOverlapRuns(register: Register): BitOverlapRun[] {
	return fieldOverlaps(register).map((overlap) => {
		const range =
			overlap.high === overlap.low ? `[${overlap.high}]` : `[${overlap.high}:${overlap.low}]`;

		return {
			key: `overlap-${overlap.high}-${overlap.low}-${overlap.fieldIds.join('-')}`,
			label: `Overlap ${range}: ${overlap.fieldTitles.join(', ')}`,
			columnStart: register.width - overlap.high,
			span: overlap.high - overlap.low + 1,
			fieldId: overlap.fieldIds[0],
		};
	});
}

function runLabel(label: string, cell: BitCell) {
	if (!cell.fieldId) return label.replace(/\[\d+(?::\d+)?\]/, `[${labelHigh(label)}:${cell.bit}]`);
	const title = cell.label.replace(/ \[\d+\]$/, '');
	return `${title} [${labelHigh(label)}:${cell.bit}]`;
}

function labelHigh(label: string) {
	return Number(label.match(/\[(\d+)/)?.[1] ?? 0);
}
