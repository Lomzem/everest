import type { ComponentKind } from './types';
export interface BuiltinProperty {
	type: string;
	components: ComponentKind[];
	defaultText?: string;
}
const all: ComponentKind[] = ['addrmap', 'regfile', 'reg', 'field', 'mem', 'signal'];
export const builtinProperties: Record<string, BuiltinProperty> = Object.create(null);
function group(names: string, type: string, components: ComponentKind[], defaultText?: string) {
	for (const name of names.split(' ')) builtinProperties[name] = { type, components, defaultText };
}
group('name desc', 'string', all);
group('donttest dontcompare', 'boolean', ['addrmap', 'regfile', 'reg', 'field', 'mem']);
group('ispresent', 'boolean', all, 'true');
group('regwidth', 'number', ['reg'], '32');
group('accesswidth', 'number', ['reg']);
group('fieldwidth', 'number', ['field'], '1');
group('signalwidth', 'number', ['signal'], '1');
group('sw', 'accesstype', ['field', 'mem'], 'rw');
group('hw', 'accesstype', ['field'], 'rw');
group('reset', 'number', ['field']);
group('resetsignal', 'signal', ['field']);
group('encode', 'enum', ['field']);
group('onread', 'onreadtype', ['field']);
group('onwrite', 'onwritetype', ['field']);
group('precedence', 'precedencetype', ['field'], 'sw');
group(
	'rclr rset woclr woset swwe swwel we wel singlepulse sticky stickybit intr halt intrenable intrmask haltenable haltmask counter incr decr hwset hwclr hwenable hwmask swmod swacc overflow underflow threshold saturate shared caring',
	'boolean',
	['field']
);
group('next', 'ref', ['field']);
group('anded ored xored', 'boolean', ['field']);
group(
	'incrvalue decrvalue incrwidth decrwidth incrthreshold decrthreshold incrsaturate decrsaturate',
	'number',
	['field']
);
group('alignment', 'number', ['addrmap', 'regfile']);
group('addressing', 'addressingtype', ['addrmap'], 'regalign');
group('msb0 lsb0', 'boolean', ['addrmap']);
group('bigendian littleendian', 'boolean', ['addrmap']);
group('shared', 'boolean', ['reg']);
group('errextbus', 'boolean', ['addrmap']);
group('mementries memwidth', 'number', ['mem']);
group('cpuif_reset field_reset activehigh activelow sync async', 'boolean', ['signal']);
group('hdl_path hdl_path_slice', 'string', all);
group('bridge', 'boolean', ['addrmap']);
