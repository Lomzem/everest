import type { Register } from './model';

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
