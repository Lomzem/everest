import { lex, type Token } from './lexer';
import type { RdlValue } from './types';
export class ExpressionError extends Error {}
export type Resolver = (name: string) => RdlValue | undefined;
const literals = new Set(
	'na rw wr r w rw1 w1 rclr rset ruser woset woclr wot wzs wzc wzt wclr wset wuser compact regalign fullalign hw sw'.split(
		' '
	)
);
const precedence: Record<string, number> = {
	'||': 1,
	'&&': 2,
	'|': 3,
	'^': 4,
	'~^': 4,
	'^~': 4,
	'&': 5,
	'==': 6,
	'!=': 6,
	'<': 7,
	'<=': 7,
	'>': 7,
	'>=': 7,
	'<<': 8,
	'>>': 8,
	'+': 9,
	'-': 9,
	'*': 10,
	'/': 10,
	'%': 10,
	'**': 11
};
export const integer = (v: RdlValue): bigint => {
	if (typeof v === 'bigint') return v;
	if (typeof v === 'boolean') return v ? 1n : 0n;
	throw new ExpressionError('Expected an integer value.');
};
interface Value {
	calculate?: (width: number) => bigint;
	value: RdlValue;
	width: number;
}
const box = (value: RdlValue, width = typeof value === 'boolean' ? 1 : 64): Value => ({
	value,
	width
});
function widthCheck(width: number) {
	if (!Number.isSafeInteger(width) || width < 1 || width > 65536)
		throw new ExpressionError('Expression width must be between 1 and 65,536 bits.');
	return width;
}
const bits = (value: bigint, width: number) => box(BigInt.asUintN(widthCheck(width), value), width);
const widen = (value: Value, width: number): bigint =>
	value.calculate ? value.calculate(width) : integer(value.value);
function calculated(width: number, calculate: (width: number) => bigint): Value {
	widthCheck(width);
	return {
		width,
		calculate: (w) => BigInt.asUintN(widthCheck(w), calculate(w)),
		get value() {
			return BigInt.asUintN(width, calculate(width));
		}
	};
}

function same(a: RdlValue, b: RdlValue): boolean {
	if (typeof a !== typeof b) return false;
	if (a === b) return true;
	if (typeof a !== 'object' || typeof b !== 'object') return false;
	if (Array.isArray(a) !== Array.isArray(b)) return false;
	const av = Object.entries(a),
		bv = Object.entries(b);
	return (
		av.length === bv.length &&
		av.every(
			([key, value]) => Object.hasOwn(b, key) && same(value, (b as Record<string, RdlValue>)[key])
		)
	);
}
/** SystemRDL expressions are unsigned and self-determined. Retain widths for every intermediate. */
export function evaluate(input: string | Token[], resolve: Resolver = () => undefined): RdlValue {
	const ts = typeof input === 'string' ? lex(input) : input;
	let p = 0;
	const take = () => ts[p++]?.text,
		peek = () => ts[p]?.text;
	const need = (s: string) => {
		if (take() !== s) throw new ExpressionError(`Expected ${s}.`);
	};
	function numeric(text: string): Value {
		const clean = text.replace(/[\s_]/g, '');
		const m = clean.match(/^(\d*)'([bBoOdDhH])([\da-fA-F]+)$/);
		if (m) {
			const base = { b: 2, o: 8, d: 10, h: 16 }[m[2].toLowerCase()]!;
			let n = 0n;
			for (const c of m[3]) {
				const digit = parseInt(c, 16);
				if (digit >= base) throw new ExpressionError('Digit is outside the literal base.');
				n = n * BigInt(base) + BigInt(digit);
			}
			return bits(n, m[1] ? Number(m[1]) : Math.max(1, n.toString(2).length));
		}
		if (clean === "'0") return box(0n, 1);
		if (clean === "'1") return box(1n, 1);
		try {
			const n = BigInt(clean);
			if (n > 0xffffffffffffffffn)
				throw new ExpressionError('An unsized integer must fit in 64 bits.');
			return box(n);
		} catch (cause) {
			if (cause instanceof ExpressionError) throw cause;
			throw new ExpressionError(`Invalid numeric literal ${text}.`);
		}
	}
	function concat(): Value {
		const values: Value[] = [expression(0)];
		if (peek() === '{') {
			take();
			const v = concat();
			need('}');
			const count = integer(values[0].value);
			if (count < 1n || count > 65536n)
				throw new ExpressionError('Repeat count must be between 1 and 65,536.');
			if (typeof v.value === 'string') return box(v.value.repeat(Number(count)));
			const width = widthCheck(v.width * Number(count));
			let result = 0n;
			for (let n = 0n; n < count; n++) result = (result << BigInt(v.width)) | integer(v.value);
			return box(result, width);
		}
		while (peek() === ',') {
			take();
			values.push(expression(0));
		}
		need('}');
		if (values.every((v) => typeof v.value === 'string'))
			return box(values.map((v) => v.value).join(''));
		const width = widthCheck(values.reduce((sum, v) => sum + v.width, 0));
		return box(
			values.reduce((a, v) => (a << BigInt(v.width)) | integer(v.value), 0n),
			width
		);
	}
	function primary(): Value {
		const t = take();
		if (t === undefined) throw new ExpressionError('Expected an expression.');
		if (['+', '-', '!', '~', '&', '|', '^', '~&', '~|', '~^', '^~'].includes(t)) {
			const operand = primary(),
				v = integer(operand.value);
			if (t === '+') return operand;
			if (t === '-') return calculated(operand.width, (w) => -widen(operand, w));
			if (t === '!') return box(v === 0n);
			if (t === '~') return calculated(operand.width, (w) => ~widen(operand, w));
			const text = BigInt.asUintN(operand.width, v).toString(2).padStart(operand.width, '0');
			const reduced = t.includes('&')
				? !text.includes('0')
				: t.includes('|')
					? v !== 0n
					: text.split('1').length % 2 === 0;
			return box(t.startsWith('~') || t === '^~' ? !reduced : reduced);
		}
		if (t === '(') {
			const v = expression(0);
			need(')');
			return v;
		}
		if (t === 'true' || t === 'false') return box(t === 'true');
		if (t.startsWith('"')) {
			try {
				return box(JSON.parse(t));
			} catch {
				return box(t.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"'));
			}
		}
		if (/^(\d|'[bBoOdDhH01])/.test(t)) {
			const v = numeric(t);
			if (peek() === "'") {
				take();
				need('(');
				const cast = integer(expression(0).value);
				need(')');
				return bits(cast, Number(integer(v.value)));
			}
			return v;
		}
		if (t === "'") {
			need('{');
			const result: RdlValue[] = [];
			if (peek() !== '}')
				do {
					result.push(expression(0).value);
					if (peek() !== ',') break;
					take();
				} while (p < ts.length);
			need('}');
			return box(result);
		}
		if (t === '{') return concat();
		if (!/^[a-zA-Z_$\\]/.test(t)) throw new ExpressionError(`Unexpected token ${t}.`);
		let name = t;
		if (peek() === "'") {
			take();
			if (peek() === '(') {
				take();
				const v = expression(0);
				need(')');
				if (t === 'boolean') return box(integer(v.value) !== 0n);
				if (t === 'longint') return bits(integer(v.value), 64);
				if (t === 'bit') return v;
				throw new ExpressionError(`Unsupported cast ${t}.`);
			}
			need('{');
			const object: Record<string, RdlValue> = Object.create(null);
			while (peek() !== '}') {
				const key = take();
				if (!key) throw new ExpressionError('Expected a struct member.');
				need(':');
				if (Object.hasOwn(object, key))
					throw new ExpressionError(`Duplicate struct member ${key}.`);
				object[key] = expression(0).value;
				if (peek() !== ',') break;
				take();
			}
			need('}');
			return box(object);
		}
		while (peek() === '::' || peek() === '.' || peek() === '->' || peek() === '[') {
			const op = take()!;
			if (op === '[') {
				const index = integer(expression(0).value);
				need(']');
				name += `[${index}]`;
			} else name += op + (take() ?? '');
		}
		if (literals.has(name)) return box(name);
		const resolved = resolve(name);
		if (resolved !== undefined) return box(resolved);
		throw new ExpressionError(`Unknown reference ${name}.`);
	}
	function expression(min: number): Value {
		let left = primary();
		while (peek() && precedence[peek()!] >= min) {
			const op = take()!,
				prec = precedence[op],
				lhs = left,
				right = expression(prec + (op === '**' ? 0 : 1));
			const width = ['<<', '>>', '**'].includes(op) ? lhs.width : Math.max(lhs.width, right.width);
			if (op === '==' || op === '!=') {
				const equal =
					typeof lhs.value === 'bigint' && typeof right.value === 'bigint'
						? widen(lhs, width) === widen(right, width)
						: same(lhs.value, right.value);
				left = box(op === '==' ? equal : !equal);
				continue;
			}
			if (['<', '<=', '>', '>=', '&&', '||'].includes(op)) {
				const a = ['&&', '||'].includes(op) ? integer(lhs.value) : widen(lhs, width),
					b = ['&&', '||'].includes(op) ? integer(right.value) : widen(right, width);
				left = box(
					op === '<'
						? a < b
						: op === '<='
							? a <= b
							: op === '>'
								? a > b
								: op === '>='
									? a >= b
									: op === '&&'
										? a !== 0n && b !== 0n
										: a !== 0n || b !== 0n
				);
				continue;
			}
			left = calculated(width, (w) => {
				const a = widen(lhs, w),
					b = ['<<', '>>', '**'].includes(op) ? integer(right.value) : widen(right, w);
				switch (op) {
					case '+':
						return a + b;
					case '-':
						return a - b;
					case '*':
						return a * b;
					case '/':
						if (b === 0n) throw new ExpressionError('Division by zero.');
						return a / b;
					case '%':
						if (b === 0n) throw new ExpressionError('Division by zero.');
						return a % b;
					case '**':
						if (b > 65536n) throw new ExpressionError('Exponent exceeds the 65,536 limit.');
						return a ** b;
					case '<<':
					case '>>':
						if (b > 65536n) throw new ExpressionError('Shift exceeds the 65,536 limit.');
						return op === '<<' ? a << b : a >> b;
					case '&':
						return a & b;
					case '|':
						return a | b;
					case '^':
						return a ^ b;
					case '~^':
					case '^~':
						return ~(a ^ b);
					default:
						throw new ExpressionError(`Unsupported operator ${op}.`);
				}
			});
		}
		if (min === 0 && peek() === '?') {
			take();
			const yes = expression(0);
			need(':');
			const no = expression(0);
			const selected = integer(left.value) !== 0n ? yes : no;
			left =
				typeof yes.value === 'bigint' && typeof no.value === 'bigint'
					? calculated(Math.max(yes.width, no.width), (w) => widen(selected, w))
					: selected;
		}
		return left;
	}

	const result = expression(0);
	if (p < ts.length) throw new ExpressionError(`Unexpected token ${peek()}.`);
	return result.value;
}
