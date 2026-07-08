import { describe, expect, it } from 'vitest';
import { Effect, Layer } from 'effect';
import { createBlankDocument, createDefaultField, type RdlDocument } from '$lib/rdl/model';
import { prepareSourceBackedDocument } from '$lib/rdl/source-edits';
import { DesktopBridge, DesktopUnavailable, type DesktopBridgeService } from './desktop';
import { openDocument, saveDocument } from './document-commands';

const runWithDesktop = <A, E>(
	effect: Effect.Effect<A, E, DesktopBridge>,
	desktop: DesktopBridgeService,
) => Effect.runPromise(effect.pipe(Effect.provide(Layer.succeed(DesktopBridge, desktop))));

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
		quitApplication: Effect.void,
		...overrides,
	};
}

describe('document command effects', () => {
	it('validates, exports, and saves new documents with Save As', async () => {
		const saves: { content: string; suggestedPath?: string }[] = [];
		const result = await runWithDesktop(
			saveDocument({
				document: createBlankDocument(),
				currentPath: '',
				saveAs: false,
				suggestedPath: 'untitled_addrmap.rdl',
			}),
			desktopMock({
				saveRdlFileAs: (content, suggestedPath) =>
					Effect.sync(() => {
						saves.push({ content, suggestedPath });
						return { path: `/tmp/${suggestedPath}` };
					}),
			}),
		);

		expect(result).toEqual({ path: '/tmp/untitled_addrmap.rdl', saved: true });
		expect(saves[0].suggestedPath).toBe('untitled_addrmap.rdl');
		expect(saves[0].content).toContain('property doc_group');
		expect(saves[0].content).toContain('addrmap untitled_addrmap');
	});

	it('reports canceled Save As without marking the document saved', async () => {
		const result = await runWithDesktop(
			saveDocument({
				document: createBlankDocument(),
				currentPath: '',
				saveAs: false,
				suggestedPath: 'untitled_addrmap.rdl',
			}),
			desktopMock({
				saveRdlFileAs: () => Effect.succeed(null),
			}),
		);

		expect(result).toEqual({ path: '', saved: false });
	});

	it('suggests only the file name when saving an existing document with Save As', async () => {
		const suggestedPaths: string[] = [];
		const result = await runWithDesktop(
			saveDocument({
				document: createBlankDocument(),
				currentPath: '/tmp/projects/current/top.rdl',
				saveAs: true,
				suggestedPath: 'untitled_addrmap.rdl',
			}),
			desktopMock({
				saveRdlFileAs: (_content, suggestedPath) =>
					Effect.sync(() => {
						suggestedPaths.push(suggestedPath ?? '');
						return { path: '/tmp/projects/copy/top-copy.rdl' };
					}),
			}),
		);

		expect(result).toEqual({ path: '/tmp/projects/copy/top-copy.rdl', saved: true });
		expect(suggestedPaths).toEqual(['top.rdl']);
	});

	it('suggests only the file name for Windows paths with Save As', async () => {
		const suggestedPaths: string[] = [];
		const result = await runWithDesktop(
			saveDocument({
				document: createBlankDocument(),
				currentPath: String.raw`C:\Users\lawjay\Documents\top.rdl`,
				saveAs: true,
				suggestedPath: 'untitled_addrmap.rdl',
			}),
			desktopMock({
				saveRdlFileAs: (_content, suggestedPath) =>
					Effect.sync(() => {
						suggestedPaths.push(suggestedPath ?? '');
						return { path: String.raw`C:\Users\lawjay\Documents\top-copy.rdl` };
					}),
			}),
		);

		expect(result).toEqual({
			path: String.raw`C:\Users\lawjay\Documents\top-copy.rdl`,
			saved: true,
		});
		expect(suggestedPaths).toEqual(['top.rdl']);
	});

	it('opens the Save As dialog even when document identifiers are duplicated', async () => {
		const calls: string[] = [];
		const document: RdlDocument = {
			...createBlankDocument(),
			registers: [
				{
					id: 'control-a',
					name: 'control',
					title: 'Control A',
					desc: '',
					address: 0,
					width: 8,
					group: '',
					sw: 'RW',
					hw: 'RW',
					fields: [],
				},
				{
					id: 'control-b',
					name: 'control',
					title: 'Control B',
					desc: '',
					address: 1,
					width: 8,
					group: '',
					sw: 'RW',
					hw: 'RW',
					fields: [],
				},
			],
		};

		const result = await runWithDesktop(
			saveDocument({
				document,
				currentPath: '/tmp/top.rdl',
				saveAs: true,
				suggestedPath: 'top.rdl',
			}),
			desktopMock({
				saveRdlFileAs: () =>
					Effect.sync(() => {
						calls.push('write');
						return { path: '/tmp/copy.rdl' };
					}),
			}),
		);

		expect(calls).toEqual(['write']);
		expect(result).toEqual({ path: '/tmp/copy.rdl', saved: true });
	});

	it('saves source-backed documents with newly inserted register, field, and enum content', async () => {
		const writes: { path: string; content: string }[] = [];
		const sourceDocument = prepareSourceBackedDocument({
			...createBlankDocument(),
			addrmapName: 'top',
			registers: [
				{
					id: 'control',
					name: 'control',
					title: 'Control',
					desc: '',
					address: 0,
					width: 8,
					group: '',
					sw: 'RW',
					hw: 'RW',
					fields: [],
				},
			],
			source: {
				rootPath: '/tmp/top.rdl',
				text: 'addrmap top { reg { name = "Control"; } control @ 0x0; };',
				readOnly: true,
				readOnlyReason: 'Source-safe edit ranges are not available yet.',
			},
		});
		const document: RdlDocument = {
			...sourceDocument,
			registers: [
				...sourceDocument.registers,
				{
					id: 'new-register-1',
					name: 'mock_reg',
					title: 'Mock Reg',
					desc: '',
					address: 4,
					width: 8,
					group: '',
					sw: 'RW',
					hw: 'RW',
					fields: [
						{
							id: 'field-1',
							name: 'mock_field',
							title: 'Mock Field',
							desc: '',
							msb: 1,
							lsb: 0,
							reset: 0,
							resetEnumValueId: 'enum-0',
							sw: 'RW',
							hw: 'RW',
							enumName: 'mock_e',
							values: [
								{ id: 'enum-0', name: 'ZERO', value: 0, desc: '' },
								{ id: 'enum-1', name: 'ONE', value: 1, desc: '' },
							],
							color: '',
						},
					],
				},
			],
		};

		const result = await runWithDesktop(
			saveDocument({
				document,
				currentPath: '/tmp/top.rdl',
				saveAs: true,
				suggestedPath: 'top.rdl',
			}),
			desktopMock({
				saveRdlFileAs: (content) =>
					Effect.sync(() => {
						writes.push({ path: '/tmp/copy.rdl', content });
						return { path: '/tmp/copy.rdl' };
					}),
			}),
		);

		expect(result).toEqual({ path: '/tmp/copy.rdl', saved: true });
		expect(writes).toHaveLength(1);
		expect(writes[0].content).toContain('} mock_reg @ 0x4;');
		expect(writes[0].content).toContain('enum mock_e {');
		expect(writes[0].content).toContain('reset = mock_e::ZERO;');
	});

	it('saves duplicate register identifiers instead of blocking the write', async () => {
		const writes: string[] = [];
		const document: RdlDocument = {
			...createBlankDocument(),
			addrmapName: 'top',
			registers: [
				{
					id: 'root-control',
					name: 'control',
					title: 'Control',
					desc: '',
					address: 0,
					width: 8,
					group: '',
					sw: 'RW',
					hw: 'RW',
					fields: [],
				},
				{
					id: 'nested-control',
					name: 'control',
					title: 'Nested Control',
					desc: '',
					address: 1,
					width: 8,
					group: 'Nested',
					sw: 'RW',
					hw: 'RW',
					fields: [],
				},
			],
		};

		const result = await runWithDesktop(
			saveDocument({
				document,
				currentPath: '/tmp/top.rdl',
				saveAs: false,
				suggestedPath: 'top.rdl',
			}),
			desktopMock({
				saveRdlFile: (path, content) =>
					Effect.sync(() => {
						writes.push(`${path}:${content}`);
					}),
			}),
		);

		expect(result).toEqual({ path: '/tmp/top.rdl', saved: true });
		expect(writes).toHaveLength(1);
		expect(writes[0]).toContain('} control @ 0x0;');
		expect(writes[0]).toContain('} control @ 0x1;');
	});

	it('saves duplicate enum identifiers instead of blocking the write', async () => {
		const writes: string[] = [];
		const document: RdlDocument = {
			...createBlankDocument(),
			addrmapName: 'top',
			registers: [
				{
					id: 'control',
					name: 'control',
					title: 'Control',
					desc: '',
					address: 0,
					width: 8,
					group: '',
					sw: 'RW',
					hw: 'RW',
					fields: [
						{
							id: 'mode',
							name: 'mode',
							title: 'Mode',
							desc: '',
							msb: 0,
							lsb: 0,
							reset: 0,
							sw: 'RW',
							hw: 'RW',
							enumName: 'mode_e',
							values: [{ id: 'mode-off', name: 'OFF', value: 0, desc: '' }],
							color: '',
						},
					],
				},
				{
					id: 'status',
					name: 'status',
					title: 'Status',
					desc: '',
					address: 1,
					width: 8,
					group: '',
					sw: 'RW',
					hw: 'RW',
					fields: [
						{
							id: 'state',
							name: 'state',
							title: 'State',
							desc: '',
							msb: 0,
							lsb: 0,
							reset: 0,
							sw: 'RW',
							hw: 'RW',
							enumName: 'mode_e',
							values: [{ id: 'state-off', name: 'OFF', value: 0, desc: '' }],
							color: '',
						},
					],
				},
			],
		};

		const result = await runWithDesktop(
			saveDocument({
				document,
				currentPath: '/tmp/top.rdl',
				saveAs: false,
				suggestedPath: 'top.rdl',
			}),
			desktopMock({
				saveRdlFile: (path, content) =>
					Effect.sync(() => {
						writes.push(`${path}:${content}`);
					}),
			}),
		);

		expect(result).toEqual({ path: '/tmp/top.rdl', saved: true });
		expect(writes).toHaveLength(1);
		expect(writes[0].match(/enum mode_e/g)).toHaveLength(2);
	});

	it('attaches parser source metadata to opened documents', async () => {
		const result = await runWithDesktop(
			openDocument(),
			desktopMock({
				openRdlFile: Effect.succeed({
					path: '/tmp/imported.rdl',
					document: createBlankDocument(),
					source: {
						rootPath: '/tmp/imported.rdl',
						text: 'addrmap imported {};',
						readOnly: true,
						readOnlyReason: 'Source-safe edit ranges are not available yet.',
					},
				}),
			}),
		);

		expect(result?.document.source).toMatchObject({
			rootPath: '/tmp/imported.rdl',
			text: 'addrmap imported {};',
			readOnly: false,
		});
	});

	it('infers enum reset selections for parser-opened numeric resets', async () => {
		const result = await runWithDesktop(
			openDocument(),
			desktopMock({
				openRdlFile: Effect.succeed({
					path: '/tmp/imported.rdl',
					document: {
						...createBlankDocument(),
						registers: [
							{
								id: 'control',
								name: 'control',
								title: 'Control',
								desc: '',
								address: 0,
								width: 8,
								group: '',
								sw: 'RW',
								hw: 'RW',
								fields: [
									{
										...createDefaultField('control-mode'),
										name: 'mode',
										reset: 0,
										enumName: 'mode_e',
										values: [
											{ id: 'control-mode-auto', name: 'AUTO', value: 0, desc: '' },
											{ id: 'control-mode-on', name: 'ON', value: 1, desc: '' },
										],
									},
								],
							},
						],
					},
				}),
			}),
		);

		expect(result?.document.registers[0].fields[0].resetEnumValueId).toBe('control-mode-auto');
	});

	it('opens documents with duplicate identifiers so users can fix them', async () => {
		const document: RdlDocument = {
			...createBlankDocument(),
			registers: [
				{
					id: 'control-a',
					name: 'control',
					title: 'Control A',
					desc: '',
					address: 0,
					width: 8,
					group: '',
					sw: 'RW',
					hw: 'RW',
					fields: [],
				},
				{
					id: 'control-b',
					name: 'control',
					title: 'Control B',
					desc: '',
					address: 1,
					width: 8,
					group: 'Nested',
					sw: 'RW',
					hw: 'RW',
					fields: [],
				},
			],
		};

		const result = await runWithDesktop(
			openDocument(),
			desktopMock({
				openRdlFile: Effect.succeed({
					path: '/tmp/duplicates.rdl',
					document,
				}),
			}),
		);

		expect(result?.path).toBe('/tmp/duplicates.rdl');
		expect(result?.document.registers.map((register) => register.name)).toEqual([
			'control',
			'control',
		]);
	});

	it('saves parser-backed read-only documents without normalizing the source text', async () => {
		const saved: string[] = [];
		const document = {
			...createBlankDocument(),
			source: {
				rootPath: '/tmp/source.rdl',
				text: 'addrmap source { reg { field {} value[0:0]; } control @ 0x0; };',
				readOnly: true,
				readOnlyReason: 'Source-safe edit ranges are not available yet.',
			},
		};

		const result = await runWithDesktop(
			saveDocument({
				document,
				currentPath: '/tmp/source.rdl',
				saveAs: false,
				suggestedPath: 'source.rdl',
			}),
			desktopMock({
				saveRdlFile: (path, content) =>
					Effect.sync(() => {
						saved.push(`${path}:${content}`);
					}),
			}),
		);

		expect(result).toEqual({ path: '/tmp/source.rdl', saved: true });
		expect(saved).toEqual([
			'/tmp/source.rdl:addrmap source { reg { field {} value[0:0]; } control @ 0x0; };',
		]);
	});

	it('saves parser-backed editable documents by patching source-safe ranges', async () => {
		const saved: string[] = [];
		const sourceText =
			'addrmap source { reg { name = "Control"; field { name = "Enable"; reset = 0; } enable[0:0]; } control @ 0x0; };';
		const document = prepareSourceBackedDocument({
			deviceName: 'source',
			blockName: 'source',
			addrmapName: 'source',
			title: 'source',
			desc: '',
			hierarchyGroups: [],
			registers: [
				{
					id: 'control',
					name: 'control',
					title: 'Control',
					desc: '',
					address: 0,
					width: 8,
					group: '',
					sw: 'RW',
					hw: 'RW',
					fields: [
						{
							id: 'control-enable',
							name: 'enable',
							title: 'Enable',
							desc: '',
							msb: 0,
							lsb: 0,
							reset: 0,
							sw: 'RW',
							hw: 'RW',
							enumName: '',
							values: [],
							color: '',
						},
					],
				},
			],
			source: {
				rootPath: '/tmp/source.rdl',
				text: sourceText,
				readOnly: true,
				readOnlyReason: 'Source-safe edit ranges are not available yet.',
			},
		});
		const register = document.registers[0];
		const field = register.fields[0];
		const edited: RdlDocument = {
			...document,
			addrmapName: 'renamed_source',
			registers: [
				{
					...register,
					title: 'Control Next',
					address: 4,
					fields: [{ ...field, reset: 1 }],
				},
			],
		};

		const result = await runWithDesktop(
			saveDocument({
				document: edited,
				currentPath: '/tmp/source.rdl',
				saveAs: false,
				suggestedPath: 'source.rdl',
			}),
			desktopMock({
				saveRdlFile: (path, content) =>
					Effect.sync(() => {
						saved.push(`${path}:${content}`);
					}),
			}),
		);

		expect(result).toEqual({ path: '/tmp/source.rdl', saved: true });
		expect(saved[0]).toContain('addrmap renamed_source');
		expect(saved[0]).toContain('name = "Control Next";');
		expect(saved[0]).toContain('reset = 1;');
		expect(saved[0]).toContain('} control @ 0x4;');
	});
});
