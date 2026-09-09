/** Source offsets use UTF-16 indices, as used by JavaScript string.slice. */
export interface SourceRange {
	start: number;
	end: number;
}
export type ComponentKind = 'addrmap' | 'regfile' | 'reg' | 'field' | 'mem' | 'signal';
export interface Diagnostic {
	severity: 'error' | 'warning';
	code: string;
	message: string;
	line: number;
	column: number;
	range: SourceRange;
}
export type RdlValue = bigint | string | boolean | RdlValue[] | { [key: string]: RdlValue };
export interface PropertyValue {
	unassigned?: boolean;
	name: string;
	value: RdlValue;
	text: string;
	range?: SourceRange;
	statementRange?: SourceRange;
	inherited: boolean;
	editable: boolean;
	type: string;
}
export interface RdlNode {
	id: string;
	name: string;
	kind: ComponentKind;
	typeName?: string;
	parentId?: string;
	address?: bigint;
	offset?: bigint;
	size?: bigint;
	width?: number;
	lsb?: number;
	msb?: number;
	dimensions: number[];
	properties: Record<string, PropertyValue>;
	children: RdlNode[];
	range: SourceRange;
	nameRange: SourceRange;
	bodyRange: SourceRange;
	addressRange?: SourceRange;
	bitRange?: SourceRange;
	editable: boolean;
}
export interface PropertyDefinition {
	name: string;
	type: string;
	components: string[];
	defaultValue?: RdlValue;
	defaultText?: string;
	constraint?: string;
	range: SourceRange;
	nameRange: SourceRange;
	editable: boolean;
}
export interface EnumMember {
	name: string;
	value: bigint;
	range: SourceRange;
	nameRange: SourceRange;
	valueRange?: SourceRange;
	description?: string;
}
export interface EnumDefinition {
	scopeRange?: SourceRange;
	name: string;
	members: EnumMember[];
	range: SourceRange;
	nameRange: SourceRange;
	bodyRange: SourceRange;
	editable: boolean;
}
export interface Compilation {
	source: string;
	roots: RdlNode[];
	nodes: RdlNode[];
	diagnostics: Diagnostic[];
	properties: PropertyDefinition[];
	enums: EnumDefinition[];
	structs?: { name: string; scopeRange?: SourceRange; members: { name: string; type: string }[] }[];
	valid: boolean;
}
export interface PropertyInput {
	name: string;
	type: string;
	components: string[];
	defaultText?: string;
	constraint?: string;
}
export interface EnumInput {
	name: string;
	members: { name: string; value: string; description?: string }[];
}
export type EditCommand =
	| { type: 'set-property'; nodeId: string; property: string; value: string }
	| { type: 'remove-property'; nodeId: string; property: string }
	| { type: 'rename'; nodeId: string; name: string }
	| { type: 'set-address'; nodeId: string; value: string }
	| { type: 'set-bits'; nodeId: string; msb: number; lsb: number }
	| { type: 'add-component'; parentId: string; kind: ComponentKind; name: string }
	| { type: 'delete-component'; nodeId: string }
	| { type: 'upsert-property-definition'; previousName?: string; definition: PropertyInput }
	| { type: 'delete-property-definition'; name: string }
	| { type: 'upsert-enum'; previousStart?: number; previousName?: string; definition: EnumInput }
	| { type: 'delete-enum'; name: string; start?: number };
