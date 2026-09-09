export interface DiffRow {
	type: 'equal' | 'add' | 'remove';
	text: string;
	oldLine?: number;
	newLine?: number;
}

/** Line diff with bounded Myers search. Original documents are never normalized. */
export function diffLines(before: string, after: string): DiffRow[] {
	if (before === after) return [];
	const lines = (text: string) => (text === '' ? [] : text.split('\n'));
	const a = lines(before),
		b = lines(after);
	let prefix = 0;
	while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
	let suffix = 0;
	while (
		suffix < a.length - prefix &&
		suffix < b.length - prefix &&
		a[a.length - suffix - 1] === b[b.length - suffix - 1]
	)
		suffix++;
	const left = a.slice(prefix, a.length - suffix),
		right = b.slice(prefix, b.length - suffix);
	type Step = { type: DiffRow['type']; text: string };
	const middle = (): Step[] => {
		const trace: Map<number, number>[] = [];
		const v = new Map<number, number>([[1, 0]]);
		const bound = Math.min(left.length + right.length, 1200);
		for (let d = 0; d <= bound; d++) {
			trace.push(new Map(v));
			for (let k = -d; k <= d; k += 2) {
				let x =
					k === -d || (k !== d && (v.get(k - 1) ?? -1) < (v.get(k + 1) ?? -1))
						? (v.get(k + 1) ?? 0)
						: (v.get(k - 1) ?? 0) + 1;
				let y = x - k;
				while (x < left.length && y < right.length && left[x] === right[y]) {
					x++;
					y++;
				}
				v.set(k, x);
				if (x >= left.length && y >= right.length) {
					const steps: Step[] = [];
					for (let depth = d; depth >= 0; depth--) {
						const previous = trace[depth],
							diagonal = x - y;
						const pk =
							diagonal === -depth ||
							(diagonal !== depth &&
								(previous.get(diagonal - 1) ?? -1) < (previous.get(diagonal + 1) ?? -1))
								? diagonal + 1
								: diagonal - 1;
						const px = previous.get(pk) ?? 0,
							py = px - pk;
						while (x > px && y > py) {
							steps.push({ type: 'equal', text: left[--x] });
							y--;
						}
						if (depth === 0) break;
						if (x === px) steps.push({ type: 'add', text: right[--y] });
						else steps.push({ type: 'remove', text: left[--x] });
					}
					return steps.reverse();
				}
			}
		}
		return [
			...left.map((text) => ({ type: 'remove' as const, text })),
			...right.map((text) => ({ type: 'add' as const, text }))
		];
	};
	const steps: Step[] = [
		...a.slice(0, prefix).map((text) => ({ type: 'equal' as const, text })),
		...middle(),
		...a.slice(a.length - suffix).map((text) => ({ type: 'equal' as const, text }))
	];
	let oldLine = 0,
		newLine = 0;
	return steps.map((step) => ({
		...step,
		oldLine: step.type === 'add' ? undefined : ++oldLine,
		newLine: step.type === 'remove' ? undefined : ++newLine
	}));
}

/** Keep context around changed lines while avoiding thousands of DOM rows. */
export function diffContext(
	rows: DiffRow[],
	context = 3
): (DiffRow | { type: 'gap'; count: number })[] {
	const visible = new Set<number>();
	rows.forEach((row, index) => {
		if (row.type !== 'equal')
			for (
				let i = Math.max(0, index - context);
				i <= Math.min(rows.length - 1, index + context);
				i++
			)
				visible.add(i);
	});
	const result: (DiffRow | { type: 'gap'; count: number })[] = [];
	let skipped = 0;
	rows.forEach((row, i) => {
		if (!visible.has(i)) {
			skipped++;
			return;
		}
		if (skipped) result.push({ type: 'gap', count: skipped });
		skipped = 0;
		result.push(row);
	});
	if (skipped) result.push({ type: 'gap', count: skipped });
	return result;
}
