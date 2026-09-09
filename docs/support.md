# SystemRDL support

Everest edits one self-contained SystemRDL source file in the browser. This implementation is a TypeScript compiler front end and a source editor. It does not generate RTL and does not claim complete SystemRDL 2.0 compliance.

## Compiler stages

Effect coordinates preprocessing, parsing, elaboration, and validated source edits. The document worker keeps compilation off the UI thread. Pure lexer/parser/evaluator loops work on immutable input and retain UTF-16 source spans. Numbers use BigInt, including address arithmetic. Numeric expressions retain intermediate widths, including concatenation, replication, casts, and nested arithmetic.

The parser reads named and anonymous components, instances, enum and struct declarations, parameters, property assignments, and user-defined property declarations. Elaboration produces a component tree with addresses, sizes, field ranges, evaluated properties, and source provenance. Macro-generated components and values are read-only.

## Supported input

- Address maps, register files, registers, fields, memories, and signals.
- Named component reuse, parameter defaults, and named parameter overrides.
- Explicit addresses, automatic address layout, array dimensions, explicit strides, instance alignment, and compact/regalign/fullalign modes.
- Explicit field ranges and implicit field packing, including msb0 maps. The model represents bit ranges by their numerical low and high positions.
- Same-file object and function macros, nested macro calls, define/undef, and ifdef/ifndef/elsif/else/endif. Macro changes take effect in source order. Comments and strings do not activate preprocessing directives.
- Integer, boolean, string, enum, array, and struct expressions; arithmetic, logical, comparison, bitwise, concatenation, replication, and supported numeric casts.
- Enum member declarations and source scope information. Struct inheritance is exposed as flattened members for typed visual controls.
- User-defined property declarations, component restrictions, scalar and aggregate types, defaults, bindings without values, and componentwidth constraints. A default does not attach the property to every component. A bare binding uses the declaration default, or remains unassigned.
- Built-in property values listed in `src/lib/rdl/properties.ts`. Common width, access, reset, address, reference, and overlap checks run before a source edit is accepted.
- Instance property assignments are applied before layout and reset-width validation.

## Explicit limits

- External includes are errors whenever the input contains an include directive, including an inactive conditional branch. Embedded Perl is rejected when encountered in active input. Markers inside comments or strings are ignored.
- Macro parameter defaults, token concatenation, and macro quoting are not supported and produce errors.
- Alias register syntax is recognized but rejected because alias hardware-property rules are not yet implemented.
- Verification constraints are preserved. A warning states that they are not evaluated. Everest is not a constraint solver.
- Numeric expressions that require unresolved instance-property references produce errors. References to array elements with per-element property overrides are not elaborated.
- Array instances are represented as one component with dimensions and a total byte span. The visual editor does not expand each array element into a separate component.
- The compiler does not implement every interaction between hardware field properties, every implicit property, or RTL-generation rules. A clean diagnostic list is not a formal language-conformance certificate.
- Enum and struct casts beyond the supported numeric casts are rejected. Parameter values lose declared bit-type width metadata when resolved; use explicit width casts when width is material to a parameter expression.
- Input is limited to 8 MB, 100,000 component nodes, 65,536-bit values, and bounded macro expansion. Errors preserve the source document.

## Source changes

The writer applies source-span patches and compiles the result before it returns a change. Literal edits retain nearby comments, spacing, newline style, and unrelated number formats. Declaration edits patch changed attributes or enum members. Undo is managed by the document service.

The editor preserves constructs that do not have dedicated visual controls. A generated value cannot be edited directly. Removing one instance from a declaration that contains several instances is rejected to prevent deletion of its siblings. Renaming a referenced symbol can fail validation; automatic reference rewriting is not implemented.

The Changes view compares pending source with the last successful direct save. In the download fallback it compares with the opened source, because a browser download request does not confirm a disk write.

## Verification

Synthetic unit tests cover parser and evaluator behavior, user-defined properties, scope metadata, address and bit layout, exact text edits, source-preserving enum/property changes, and rejected edits. Browser tests cover the complete visual workflow. Private example files are used only for local smoke checks; their names and content are not included in tests or public artifacts.
