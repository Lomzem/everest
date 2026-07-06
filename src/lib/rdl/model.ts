export type Access = 'RW' | 'RO' | 'WO' | 'R' | 'W';
export type ValueMode = 'hex' | 'dec' | 'bin';

export interface EnumValue {
	id: string;
	name: string;
	value: number;
	desc: string;
}

export interface Field {
	id: string;
	name: string;
	title: string;
	desc: string;
	msb: number;
	lsb: number;
	reset: number;
	resetEnumValueId?: string;
	sw: Access;
	hw: Access;
	enumName?: string;
	values: EnumValue[];
	color: string;
}

export interface Register {
	id: string;
	name: string;
	title: string;
	desc: string;
	address: number;
	width: number;
	group: string;
	sw: Access;
	hw: Access;
	fields: Field[];
}

export interface HierarchyGroup {
	id: string;
	label: string;
	path: string;
}

export interface RdlSourceDocument {
	rootPath: string;
	text: string;
	readOnly: boolean;
	readOnlyReason: string;
	editRanges?: RdlSourceEditRanges;
}

export interface RdlDocument {
	deviceName: string;
	blockName: string;
	addrmapName: string;
	title: string;
	desc: string;
	hierarchyGroups: HierarchyGroup[];
	registers: Register[];
	source?: RdlSourceDocument;
}

export interface SourceRange {
	start: number;
	end: number;
}

export interface SourceToken<T> {
	range: SourceRange;
	value: T;
}

export interface ResetSourceValue {
	value: number;
	enumName?: string;
	enumValueName?: string;
}

export interface RdlSourceEditRanges {
	addrmapName?: SourceToken<string>;
	addrmapBodyEnd?: number;
	addrmapIndent?: string;
	registers: Record<string, RegisterSourceEditRanges>;
}

export interface RegisterSourceEditRanges {
	fullRange?: SourceRange;
	bodyEnd?: number;
	bodyIndent?: string;
	name?: SourceToken<string>;
	title?: SourceToken<string>;
	desc?: SourceToken<string>;
	address?: SourceToken<number>;
	group?: SourceToken<string>;
	sw?: SourceToken<Access>;
	hw?: SourceToken<Access>;
	fields: Record<string, FieldSourceEditRanges>;
}

export interface FieldSourceEditRanges {
	fullRange?: SourceRange;
	bodyEnd?: number;
	bodyIndent?: string;
	enumRange?: SourceRange;
	enumBodyEnd?: number;
	enumBodyIndent?: string;
	name?: SourceToken<string>;
	title?: SourceToken<string>;
	desc?: SourceToken<string>;
	bitRange?: SourceToken<{ msb: number; lsb: number }>;
	reset?: SourceToken<ResetSourceValue>;
	sw?: SourceToken<Access>;
	hw?: SourceToken<Access>;
	enumName?: SourceToken<string>;
	values: Record<string, EnumValueSourceEditRanges>;
}

export interface EnumValueSourceEditRanges {
	fullRange?: SourceRange;
	name?: SourceToken<string>;
	value?: SourceToken<number>;
	desc?: SourceToken<string>;
}

export const accessOptions: Access[] = ['RW', 'RO', 'WO', 'R', 'W'];

export const bitColors = [
	'border-chart-1 bg-chart-1/15 text-foreground',
	'border-chart-2 bg-chart-2/15 text-foreground',
	'border-chart-3 bg-chart-3/15 text-foreground',
	'border-chart-4 bg-chart-4/15 text-foreground',
	'border-chart-5 bg-chart-5/15 text-foreground',
];

export function normalizeBitColor(color: string) {
	const paletteIndex = bitColors.indexOf(color);
	return paletteIndex === -1 ? bitColors[0] : bitColors[paletteIndex];
}

export function createDefaultField(id = 'value-field'): Field {
	return {
		id,
		name: 'value',
		title: 'Value',
		desc: 'Describe the field behavior.',
		msb: 7,
		lsb: 0,
		reset: 0,
		resetEnumValueId: undefined,
		sw: 'RW',
		hw: 'RW',
		enumName: '',
		values: [],
		color: bitColors[0],
	};
}

export function createBlankDocument(): RdlDocument {
	return {
		deviceName: 'untitled_addrmap',
		blockName: 'untitled_addrmap',
		addrmapName: 'untitled_addrmap',
		title: 'Untitled RDL',
		desc: '',
		hierarchyGroups: [],
		registers: [],
	};
}

export function createMockDocument(): RdlDocument {
	return {
		deviceName: 'top_sys',
		blockName: 'HDMI_Input',
		addrmapName: 'top_sys_addrmap',
		title: 'RDL Studio Mock',
		desc: 'Mock register editor document.',
		hierarchyGroups: [{ id: 'control', label: 'Control Registers', path: 'Control Registers' }],
		registers: [
			{
				id: 'color-space',
				name: 'hdmi_input_control_color_space_color_range_bit_depth',
				title: 'Color Space, Color Range, Bit Depth',
				desc: 'Selects HDMI input color space handling, range conversion, and bit depth behavior.',
				address: 0x0b,
				width: 8,
				group: 'Control Registers/HDMI Input Control',
				sw: 'RW',
				hw: 'RW',
				fields: [
					{
						id: 'audio-src',
						name: 'audio_src',
						title: 'Audio SRC',
						desc: 'Audio SRC enable.',
						msb: 4,
						lsb: 4,
						reset: 1,
						sw: 'RW',
						hw: 'RW',
						enumName: 'hdmi_input_control_audio_src_e',
						values: [
							{ id: 'audio-src-off', name: 'OFF', value: 0, desc: 'Off' },
							{ id: 'audio-src-on', name: 'ON', value: 1, desc: 'On' },
						],
						color: bitColors[4],
					},
					{
						id: 'non-pcm',
						name: 'non_pcm_audio_proc',
						title: 'Non-PCM Audio Proc',
						desc: 'Non-PCM audio processing mode.',
						msb: 3,
						lsb: 3,
						reset: 0,
						sw: 'RW',
						hw: 'RW',
						enumName: 'non_pcm_audio_proc_e',
						values: [
							{ id: 'non-pcm-auto', name: 'AUTO', value: 0, desc: 'Auto' },
							{ id: 'non-pcm-off', name: 'OFF', value: 1, desc: 'Off' },
						],
						color: bitColors[3],
					},
					{
						id: 'unsupported',
						name: 'unsupported_non_pcm_audio',
						title: 'Unsupported Non-PCM Audio',
						desc: 'Action for unsupported non-PCM audio.',
						msb: 2,
						lsb: 2,
						reset: 0,
						sw: 'RW',
						hw: 'RW',
						enumName: 'hdmi_input_control_unsupported_non_pcm_audio_e',
						values: [
							{ id: 'unsupported-mute', name: 'MUTE', value: 0, desc: 'Mute' },
							{ id: 'unsupported-pass', name: 'PASS', value: 1, desc: 'Pass' },
						],
						color: bitColors[2],
					},
					{
						id: 'rgb-range',
						name: 'rgb_range',
						title: 'RGB Range',
						desc: 'The color range for input video.',
						msb: 1,
						lsb: 0,
						reset: 0,
						sw: 'RW',
						hw: 'RW',
						enumName: 'hdmi_input_control_rgb_range_e',
						values: [
							{ id: 'rgb-range-auto', name: 'AUTO', value: 0, desc: 'Auto' },
							{ id: 'rgb-range-smpte', name: 'SMPTE', value: 1, desc: 'SMPTE range' },
							{ id: 'rgb-range-full', name: 'FULL', value: 2, desc: 'Full' },
						],
						color: bitColors[0],
					},
				],
			},
			{
				id: 'frame-rate-format',
				name: 'scaler_control_frame_rate_format',
				title: 'Frame Rate, Format',
				desc: 'Controls the frame rate and preferred video format for the scaler output.',
				address: 0x10,
				width: 8,
				group: 'Control Registers/HDMI Input Control',
				sw: 'RW',
				hw: 'RW',
				fields: [
					{
						id: 'frame-rate',
						name: 'frame_rate',
						title: 'Frame Rate',
						desc: 'Defines the supported frame rates for the scaler output.',
						msb: 7,
						lsb: 4,
						reset: 0,
						sw: 'RW',
						hw: 'R',
						enumName: 'scaler_control_frame_rate_e',
						values: [
							{
								id: 'frame-rate-auto',
								name: 'AUTO',
								value: 0,
								desc: 'Automatically detect frame rate based on input clock.',
							},
							{
								id: 'frame-rate-fps-23-98',
								name: 'FPS_23_98',
								value: 1,
								desc: 'Cinematic standard 23.976 frames per second.',
							},
							{
								id: 'frame-rate-fps-24',
								name: 'FPS_24',
								value: 2,
								desc: 'Standard 24 frames per second.',
							},
							{
								id: 'frame-rate-fps-30',
								name: 'FPS_30',
								value: 4,
								desc: 'NTSC standard 29.97/30 frames per second.',
							},
						],
						color: bitColors[4],
					},
					{
						id: 'preferred-video-format',
						name: 'preferred_video_format',
						title: 'Preferred Video Format',
						desc: 'Specifies the preferred video resolution and scanning format.',
						msb: 3,
						lsb: 0,
						reset: 0,
						sw: 'RW',
						hw: 'RW',
						enumName: 'scaler_control_preferred_video_format_e',
						values: [
							{
								id: 'video-format-auto',
								name: 'AUTO',
								value: 0,
								desc: 'Use the sink preferred timing.',
							},
							{
								id: 'video-format-720p60',
								name: 'V720P60',
								value: 1,
								desc: '1280x720 progressive at 60 Hz.',
							},
							{
								id: 'video-format-1080p60',
								name: 'V1080P60',
								value: 2,
								desc: '1920x1080 progressive at 60 Hz.',
							},
							{
								id: 'video-format-2160p30',
								name: 'V2160P30',
								value: 3,
								desc: '3840x2160 progressive at 30 Hz.',
							},
						],
						color: bitColors[0],
					},
				],
			},
			{
				id: 'interrupts',
				name: 'hdmi_input_interrupt_status',
				title: 'Interrupt Status',
				desc: 'Sticky status bits for video lock, audio lock, and protocol errors.',
				address: 0x18,
				width: 8,
				group: 'Status Registers/HDMI Input Status',
				sw: 'RW',
				hw: 'RW',
				fields: [
					{
						id: 'video-lock',
						name: 'video_lock_irq',
						title: 'Video Lock IRQ',
						desc: 'Video lock changed.',
						msb: 0,
						lsb: 0,
						reset: 0,
						sw: 'RW',
						hw: 'RW',
						values: [],
						color: bitColors[1],
					},
					{
						id: 'audio-lock',
						name: 'audio_lock_irq',
						title: 'Audio Lock IRQ',
						desc: 'Audio lock changed.',
						msb: 1,
						lsb: 1,
						reset: 0,
						sw: 'RW',
						hw: 'RW',
						values: [],
						color: bitColors[2],
					},
				],
			},
		],
	};
}
