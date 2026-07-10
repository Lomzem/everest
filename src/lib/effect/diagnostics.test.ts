import { beforeEach, describe, expect, it } from 'vitest';
import { Effect, Layer } from 'effect';
import type { DiagnosticLogEntry } from '$lib/desktop-api';
import { DesktopBridge, DesktopUnavailable, type DesktopBridgeService } from './desktop';
import {
	appendDiagnosticLogEntry,
	clearDiagnostics,
	parseDiagnosticLogContent,
	readDiagnostics,
} from './diagnostics';

const entry: DiagnosticLogEntry = {
	version: 1,
	timestamp: '2026-07-09T00:00:00.000Z',
	level: 'error',
	source: 'test',
	message: 'boom',
	details: 'stack',
};

const runWithDesktop = <A, E>(effect: Effect.Effect<A, E, DesktopBridge>) =>
	Effect.runPromise(effect.pipe(Effect.provide(Layer.succeed(DesktopBridge, desktopMock()))));

function desktopMock(overrides: Partial<DesktopBridgeService> = {}): DesktopBridgeService {
	return {
		api: Effect.succeed(undefined),
		openRdlFile: Effect.fail(new DesktopUnavailable({ operation: 'openRdlFile' })),
		saveRdlFile: () => Effect.fail(new DesktopUnavailable({ operation: 'saveRdlFile' })),
		chooseRdlSavePath: () =>
			Effect.fail(new DesktopUnavailable({ operation: 'chooseRdlSavePath' })),
		saveRdlFileAs: () => Effect.fail(new DesktopUnavailable({ operation: 'saveRdlFileAs' })),
		setDocumentEdited: () => Effect.void,
		setWindowTitle: () => Effect.void,
		appendDiagnosticLog: () =>
			Effect.fail(new DesktopUnavailable({ operation: 'appendDiagnosticLog' })),
		readDiagnosticLogs: Effect.fail(new DesktopUnavailable({ operation: 'readDiagnosticLogs' })),
		clearDiagnosticLogs: Effect.fail(new DesktopUnavailable({ operation: 'clearDiagnosticLogs' })),
		quitApplication: Effect.void,
		setZoom: () => Effect.void,
		...overrides,
	};
}

function installLocalStorage() {
	const values = new Map<string, string>();
	Object.defineProperty(globalThis, 'window', {
		configurable: true,
		value: {
			localStorage: {
				getItem: (key: string) => values.get(key) ?? null,
				setItem: (key: string, value: string) => values.set(key, value),
				removeItem: (key: string) => values.delete(key),
			},
		},
	});
}

describe('diagnostics effects', () => {
	beforeEach(() => {
		installLocalStorage();
	});

	it('parses valid diagnostic entries and ignores malformed lines', () => {
		const parsed = parseDiagnosticLogContent(
			`${JSON.stringify(entry)}\nnot json\n${JSON.stringify({ ...entry, version: 2 })}\n`,
		);

		expect(parsed.entries).toEqual([entry]);
		expect(parsed.ignoredLines).toBe(2);
	});

	it('persists diagnostics in browser storage when desktop integration is unavailable', async () => {
		await runWithDesktop(appendDiagnosticLogEntry(entry));

		const snapshot = await runWithDesktop(readDiagnostics());

		expect(snapshot.path).toBe('Browser local storage: everest.diagnostics');
		expect(snapshot.entries).toEqual([entry]);
		expect(snapshot.ignoredLines).toBe(0);
	});

	it('clears browser diagnostics when desktop integration is unavailable', async () => {
		await runWithDesktop(appendDiagnosticLogEntry(entry));

		const snapshot = await runWithDesktop(clearDiagnostics());

		expect(snapshot.entries).toEqual([]);
		expect((await runWithDesktop(readDiagnostics())).entries).toEqual([]);
	});
});
