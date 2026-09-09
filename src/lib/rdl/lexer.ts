import type { Diagnostic, SourceRange } from './types';
export interface Token extends SourceRange {
	text: string;
	generated?: boolean;
}
export function diagnostic(
	source: string,
	range: SourceRange,
	code: string,
	message: string,
	severity: 'error' | 'warning' = 'error'
): Diagnostic {
	const prefix = source.slice(0, range.start);
	const lines = prefix.split('\n');
	return {
		severity,
		code,
		message,
		line: lines.length,
		column: (lines.at(-1)?.length ?? 0) + 1,
		range
	};
}
/** A lexer keeps original offsets. Comments are trivia and remain in the source buffer. */
export function lex(source: string, diagnostics: Diagnostic[] = []): Token[] {
	const out: Token[] = [];
	let i = 0;
	while (i < source.length) {
		const start = i,
			c = source[i];
		if (/\s/.test(c)) {
			i++;
			continue;
		}
		if (source.startsWith('//', i)) {
			const end = source.indexOf('\n', i);
			i = end < 0 ? source.length : end;
			continue;
		}
		if (source.startsWith('/*', i)) {
			const end = source.indexOf('*/', i + 2);
			if (end < 0) {
				diagnostics.push(
					diagnostic(
						source,
						{ start, end: source.length },
						'LEX_COMMENT',
						'Unclosed block comment.'
					)
				);
				break;
			}
			i = end + 2;
			continue;
		}
		if (c === '"') {
			i++;
			while (i < source.length && source[i] !== '"') {
				if (source[i] === '\\') i++;
				i++;
			}
			if (i >= source.length)
				diagnostics.push(diagnostic(source, { start, end: i }, 'LEX_STRING', 'Unclosed string.'));
			else i++;
		} else if (/[a-zA-Z_$]/.test(c)) {
			i++;
			while (i < source.length && /[a-zA-Z0-9_$]/.test(source[i])) i++;
		} else if (c === '\\') {
			i++;
			while (i < source.length && !/\s/.test(source[i])) i++;
		} else if (/[0-9]/.test(c) || (c === "'" && /[bBoOdDhH01]/.test(source[i + 1] ?? ''))) {
			const match = source
				.slice(i)
				.match(
					/^(?:[0-9][0-9_]*\s*'[bBoOdDhH][0-9a-fA-F_xXzZ?]+|'[bBoOdDhH][0-9a-fA-F_xXzZ?]+|'[01]|0[xX][0-9a-fA-F_]+|[0-9][0-9_]*)/
				);
			i += match?.[0].length ?? 1;
		} else {
			const op = [
				'<<=',
				'>>=',
				'**',
				'<<',
				'>>',
				'<=',
				'>=',
				'==',
				'!=',
				'&&',
				'||',
				'~&',
				'~|',
				'~^',
				'^~',
				'+=',
				'%=',
				'->',
				'::'
			].find((op) => source.startsWith(op, i));
			i += op?.length ?? 1;
		}
		out.push({ text: source.slice(start, i), start, end: i });
	}
	return out;
}
/** Expand in source order. Macro-origin tokens retain the invocation span and are read-only. */
export function preprocess(source: string, diagnostics: Diagnostic[]): Token[] {
	const input = lex(source, diagnostics),
		output: Token[] = [];
	const macros = new Map<string, { body: Token[]; parameters?: string[] }>();
	const states: { parent: boolean; matched: boolean; hadElse: boolean }[] = [];
	let active = true;
	const directives = new Set([
		'define',
		'undef',
		'ifdef',
		'ifndef',
		'elsif',
		'else',
		'endif',
		'include'
	]);
	const fail = (token: Token, code: string, message: string) =>
		diagnostics.push(diagnostic(source, token, code, message));
	function expand(ts: Token[], stack: string[] = []): Token[] {
		const result: Token[] = [];
		for (let p = 0; p < ts.length; p++) {
			const token = ts[p];
			if (token.text !== '`') {
				result.push(token);
				continue;
			}
			const name = ts[++p],
				macro = name && macros.get(name.text);
			if (!macro) {
				fail(token, 'PREPROCESS_MACRO', `Unknown macro ${name?.text ?? ''}.`);
				continue;
			}
			if (stack.includes(name.text) || stack.length >= 32) {
				fail(token, 'PREPROCESS_MACRO', 'Recursive macro expansion.');
				continue;
			}
			let end = name.end;
			const bindings = new Map<string, Token[]>();
			if (macro.parameters) {
				if (ts[++p]?.text !== '(') {
					fail(token, 'PREPROCESS_MACRO', 'Expected macro arguments.');
					continue;
				}
				let depth = 0;
				const args: Token[][] = [[]];
				while (++p < ts.length) {
					const t = ts[p];
					if (t.text === ')' && depth === 0) {
						end = t.end;
						break;
					}
					if (t.text === ',' && depth === 0) {
						args.push([]);
						continue;
					}
					if (['(', '[', '{'].includes(t.text)) depth++;
					if ([')', ']', '}'].includes(t.text)) depth--;
					args.at(-1)!.push(t);
				}
				if (macro.parameters.length === 0 && args.length === 1 && !args[0].length) args.pop();
				if (args.length !== macro.parameters.length) {
					fail(
						token,
						'PREPROCESS_MACRO',
						`Macro ${name.text} expects ${macro.parameters.length} arguments.`
					);
					continue;
				}
				macro.parameters.forEach((parameter, index) => bindings.set(parameter, args[index]));
			}
			const body = macro.body
				.flatMap((t) => bindings.get(t.text) ?? [t])
				.map((t) => ({ ...t, start: token.start, end, generated: true }));
			result.push(...expand(body, [...stack, name.text]));
			if (result.length > 500_000) {
				fail(token, 'PREPROCESS_LIMIT', 'Macro expansion exceeds the token limit.');
				return result;
			}
		}
		return result;
	}
	let chunk: Token[] = [];
	const flush = () => {
		if (active) output.push(...expand(chunk));
		chunk = [];
	};
	for (let p = 0; p < input.length; p++) {
		const token = input[p];
		if (token.text === '`' && directives.has(input[p + 1]?.text)) {
			flush();
			const directive = input[++p].text;
			let lineEnd = source.indexOf('\n', token.start);
			if (lineEnd < 0) lineEnd = source.length;
			while (
				source.slice(token.start, lineEnd).trimEnd().endsWith('\\') &&
				lineEnd < source.length
			) {
				const next = source.indexOf('\n', lineEnd + 1);
				lineEnd = next < 0 ? source.length : next;
			}
			const args: Token[] = [];
			while (input[p + 1] && input[p + 1].start < lineEnd) {
				const item = input[++p];
				if (item.text !== '\\') args.push(item);
			}
			const name = args[0]?.text ?? '';
			if (directive === 'ifdef' || directive === 'ifndef') {
				const condition = macros.has(name) !== (directive === 'ifndef');
				states.push({ parent: active, matched: condition, hadElse: false });
				active = active && condition;
			} else if (directive === 'elsif' || directive === 'else') {
				const state = states.at(-1);
				if (!state || state.hadElse)
					fail(token, 'PREPROCESS_CONDITION', 'Unexpected conditional directive.');
				else {
					const condition = directive === 'else' || macros.has(name);
					active = state.parent && !state.matched && condition;
					state.matched ||= condition;
					state.hadElse = directive === 'else';
				}
			} else if (directive === 'endif') {
				const state = states.pop();
				if (!state) fail(token, 'PREPROCESS_CONDITION', 'Unexpected `endif.');
				active = state?.parent ?? true;
			} else if (directive === 'include')
				fail(
					token,
					'EXTERNAL_INCLUDE',
					'External includes are not supported. Open a self-contained .rdl file.'
				);
			else if (active && directive === 'undef') macros.delete(name);
			else if (active && directive === 'define') {
				if (!/^[A-Za-z_]\w*$/.test(name)) {
					fail(token, 'PREPROCESS_DEFINE', 'Expected a macro name.');
					continue;
				}
				let body = args.slice(1),
					parameters: string[] | undefined;
				if (body[0]?.text === '(' && body[0].start === args[0].end) {
					const close = body.findIndex((t) => t.text === ')');
					if (close < 0) {
						fail(token, 'PREPROCESS_DEFINE', 'Expected closing macro parameter parenthesis.');
						continue;
					}
					parameters = body
						.slice(1, close)
						.filter((t) => t.text !== ',')
						.map((t) => t.text);
					if (parameters.some((n) => !/^[A-Za-z_]\w*$/.test(n))) {
						fail(token, 'PREPROCESS_DEFINE', 'Macro parameter defaults are not supported.');
						continue;
					}
					body = body.slice(close + 1);
				}
				if (body.some((t, i) => t.text === '`' && ['`', '"'].includes(body[i + 1]?.text))) {
					fail(
						token,
						'PREPROCESS_DEFINE',
						'Macro token concatenation and quoting are not supported.'
					);
					continue;
				}
				macros.set(name, { body, parameters });
			}
		} else if (active) chunk.push(token);
	}
	flush();
	if (states.length)
		diagnostics.push(
			diagnostic(
				source,
				{ start: source.length, end: source.length },
				'PREPROCESS_CONDITION',
				'Missing `endif.'
			)
		);
	const perl = output.findIndex((t, i) => t.text === '<' && output[i + 1]?.text === '%');
	if (perl >= 0)
		fail(output[perl], 'UNSUPPORTED_PERL', 'Embedded Perl preprocessing is not supported.');
	return output;
}
