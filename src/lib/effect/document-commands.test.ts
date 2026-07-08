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
		saveRdlFileAs: () => Effect.fail(new DesktopUnavailable({ operation: 'saveRdlFileAs' })),
		setDocumentEdited: () => Effect.void,
		setWindowTitle: () => Effect.void,
		quitApplication: Effect.void,
		...overrides,
	};
}

describe('document command effects', () => {
	it('validates, exports, and saves new documents with Save As', async () => {
		const saved: string[] = [];
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
						saved.push(`${suggestedPath}:${content}`);
						return { path: '/tmp/untitled_addrmap.rdl' };
					}),
			}),
		);

		expect(result).toEqual({ path: '/tmp/untitled_addrmap.rdl', saved: true });
		expect(saved[0]).toContain('untitled_addrmap.rdl:property doc_group');
		expect(saved[0]).toContain('addrmap untitled_addrmap');
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

	it('rejects duplicate register identifiers before saving', async () => {
		let saveCalls = 0;
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
			Effect.either(
				saveDocument({
					document,
					currentPath: '/tmp/top.rdl',
					saveAs: false,
					suggestedPath: 'top.rdl',
				}),
			),
			desktopMock({
				saveRdlFile: () =>
					Effect.sync(() => {
						saveCalls += 1;
					}),
			}),
		);

		expect(result._tag).toBe('Left');
		if (result._tag === 'Left') {
			expect(result.left).toMatchObject({
				_tag: 'DocumentValidationFailed',
				message: 'Duplicate register identifier "control" in addrmap "top".',
			});
		}
		expect(saveCalls).toBe(0);
	});

	it('rejects duplicate enum identifiers before saving', async () => {
		let saveCalls = 0;
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
			Effect.either(
				saveDocument({
					document,
					currentPath: '/tmp/top.rdl',
					saveAs: false,
					suggestedPath: 'top.rdl',
				}),
			),
			desktopMock({
				saveRdlFile: () =>
					Effect.sync(() => {
						saveCalls += 1;
					}),
			}),
		);

		expect(result._tag).toBe('Left');
		if (result._tag === 'Left') {
			expect(result.left).toMatchObject({
				_tag: 'DocumentValidationFailed',
				message:
					'Duplicate enum identifier "mode_e" also used in registers "control" and "status".',
			});
		}
		expect(saveCalls).toBe(0);
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
