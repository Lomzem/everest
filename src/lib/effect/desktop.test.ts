import { describe, expect, it, vi } from 'vitest';
import { Effect } from 'effect';
import type { DesktopApi } from '$lib/desktop-api';
import {
	DesktopBridge,
	DesktopBridgeLive,
	DesktopOperationFailed,
	RdlParseFailed,
	rdlParseFailureFromUnknown,
} from './desktop';

describe('DesktopBridgeLive', () => {
	it('maps native RDL parse errors into structured Effect errors', async () => {
		const error = {
			kind: 'rdlParseError',
			path: '/tmp/bad.rdl',
			message: "extraneous input '}' expecting ';'",
			line: 3,
			column: 1,
			snippet: '};\n^',
			details: 'raw parser output',
		} as const;
		const desktopApi = {
			openRdlFile: vi.fn().mockRejectedValue(error),
		} as unknown as DesktopApi;
		Object.defineProperty(globalThis, 'window', {
			configurable: true,
			value: { everest: desktopApi },
		});

		const result = await Effect.runPromise(
			Effect.either(
				Effect.gen(function* () {
					const desktop = yield* DesktopBridge;
					return yield* desktop.openRdlFile;
				}).pipe(Effect.provide(DesktopBridgeLive)),
			),
		);

		expect(result._tag).toBe('Left');
		if (result._tag === 'Left') {
			expect(result.left).toBeInstanceOf(RdlParseFailed);
			const parseError = result.left as RdlParseFailed;
			expect(parseError.path).toBe('/tmp/bad.rdl');
			expect(parseError.line).toBe(3);
		}
	});

	it('maps native raw SystemRDL diagnostics into structured Effect errors', async () => {
		const desktopApi = {
			openRdlFile: vi
				.fn()
				.mockRejectedValue(
					[
						"/home/lomzem/foo.rdl:9:2: fatal: Type 'efault' is not defined",
						'    efault regwidth = 8;',
						'    ^^^^^^',
					].join('\n'),
				),
		} as unknown as DesktopApi;
		Object.defineProperty(globalThis, 'window', {
			configurable: true,
			value: { everest: desktopApi },
		});

		const result = await Effect.runPromise(
			Effect.either(
				Effect.gen(function* () {
					const desktop = yield* DesktopBridge;
					return yield* desktop.openRdlFile;
				}).pipe(Effect.provide(DesktopBridgeLive)),
			),
		);

		expect(result._tag).toBe('Left');
		if (result._tag === 'Left') {
			expect(result.left).toBeInstanceOf(RdlParseFailed);
			const parseError = result.left as RdlParseFailed;
			expect(parseError.path).toBe('/home/lomzem/foo.rdl');
			expect(parseError.line).toBe(9);
			expect(parseError.message).toBe("Type 'efault' is not defined");
		}
	});

	it('normalizes wrapped native RDL parse error objects', () => {
		const error = rdlParseFailureFromUnknown(
			new DesktopOperationFailed({
				operation: 'openRdlFile',
				cause: {
					kind: 'rdlParseError',
					path: '/tmp/bad.rdl',
					message: "extraneous input '}' expecting ';'",
					line: 3,
					column: 1,
				},
			}),
		);

		expect(error).toBeInstanceOf(RdlParseFailed);
		expect(error?.path).toBe('/tmp/bad.rdl');
		expect(error?.message).toBe("extraneous input '}' expecting ';'");
	});

	it('normalizes raw SystemRDL fatal diagnostics', () => {
		const details = [
			"/home/lomzem/foo.rdl:9:2: fatal: Type 'efault' is not defined",
			'    efault regwidth = 8;',
			'    ^^^^^^',
		].join('\n');

		const error = rdlParseFailureFromUnknown(details);

		expect(error).toBeInstanceOf(RdlParseFailed);
		expect(error?.path).toBe('/home/lomzem/foo.rdl');
		expect(error?.message).toBe("Type 'efault' is not defined");
		expect(error?.line).toBe(9);
		expect(error?.column).toBe(2);
		expect(error?.snippet).toBe('    efault regwidth = 8;\n    ^^^^^^');
	});

	it('applies optional desktop zoom when available', async () => {
		const setZoom = vi.fn().mockResolvedValue(undefined);
		const desktopApi = {
			setZoom,
		} as unknown as DesktopApi;
		Object.defineProperty(globalThis, 'window', {
			configurable: true,
			value: { everest: desktopApi },
		});

		await Effect.runPromise(
			Effect.gen(function* () {
				const desktop = yield* DesktopBridge;
				yield* desktop.setZoom(1.2);
			}).pipe(Effect.provide(DesktopBridgeLive)),
		);

		expect(setZoom).toHaveBeenCalledWith(1.2);
	});
});
