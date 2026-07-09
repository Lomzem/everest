import json
import re
import sys
from pathlib import Path

from systemrdl import RDLCompiler
from systemrdl.node import AddrmapNode, RegNode

BIT_COLORS = [
    "border-chart-1 bg-chart-1/15 text-foreground",
    "border-chart-2 bg-chart-2/15 text-foreground",
    "border-chart-3 bg-chart-3/15 text-foreground",
    "border-chart-4 bg-chart-4/15 text-foreground",
    "border-chart-5 bg-chart-5/15 text-foreground",
]


def get_prop(node, name, default=None):
    try:
        value = node.get_property(name)
        return default if value is None else value
    except Exception:
        return default


def access(value):
    name = getattr(value, "name", str(value).split(".")[-1]).lower()
    if name == "rw":
        return "RW"
    if name in ("w", "wo"):
        return "W"
    if name == "ro":
        return "RO"
    return "R"


def stable_id(*parts):
    text = "-".join(str(part) for part in parts if part)
    text = re.sub(r"[^A-Za-z0-9]+", "-", text).strip("-").lower()
    return text or "item"


def enum_values(enum_type, field_id):
    if not enum_type:
        return []

    values = []
    for member_name, member in enum_type.members.items():
        values.append(
            {
                "id": stable_id(field_id, member_name),
                "name": member.name,
                "value": int(member.value),
                "desc": member.rdl_desc or "",
            }
        )
    return values


def first_group_segment(group_path):
    return group_path.split("/", 1)[0] if group_path else ""


def is_identifier_start(char):
    return char == "_" or char.isalpha()


def is_identifier_part(char):
    return char == "_" or char.isalnum()


def skip_string(text, index, end):
    index += 1
    while index < end:
        char = text[index]
        if char == "\\":
            index += 2
            continue
        if char == '"':
            return index + 1
        index += 1
    return index


def skip_comment(text, index, end):
    if text.startswith("//", index):
        newline = text.find("\n", index + 2, end)
        return end if newline == -1 else newline + 1
    if text.startswith("/*", index):
        close = text.find("*/", index + 2, end)
        return end if close == -1 else close + 2
    return index


def skip_trivia(text, index, end):
    while index < end:
        if text[index].isspace():
            index += 1
            continue
        next_index = skip_comment(text, index, end)
        if next_index != index:
            index = next_index
            continue
        return index
    return index


def read_identifier(text, index, end):
    if index >= end or not is_identifier_start(text[index]):
        return None
    start = index
    index += 1
    while index < end and is_identifier_part(text[index]):
        index += 1
    return text[start:index], start, index


def find_matching_brace(text, open_brace, end):
    depth = 1
    index = open_brace + 1
    while index < end:
        char = text[index]
        if char == '"':
            index = skip_string(text, index, end)
            continue
        next_index = skip_comment(text, index, end)
        if next_index != index:
            index = next_index
            continue
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return index
        index += 1
    return None


def register_body_defaults(text, body_start, body_end):
    defaults = {}
    depth = 0
    index = body_start

    while index < body_end:
        char = text[index]
        if char == '"':
            index = skip_string(text, index, body_end)
            continue
        next_index = skip_comment(text, index, body_end)
        if next_index != index:
            index = next_index
            continue
        if char == "{":
            depth += 1
            index += 1
            continue
        if char == "}":
            depth = max(0, depth - 1)
            index += 1
            continue

        identifier = read_identifier(text, index, body_end)
        if depth != 0 or identifier is None or identifier[0] != "default":
            index = identifier[2] if identifier else index + 1
            continue

        prop = read_identifier(text, skip_trivia(text, identifier[2], body_end), body_end)
        if prop is None or prop[0] not in ("sw", "hw"):
            index = identifier[2]
            continue

        equals = skip_trivia(text, prop[2], body_end)
        if equals >= body_end or text[equals] != "=":
            index = prop[2]
            continue

        value = read_identifier(text, skip_trivia(text, equals + 1, body_end), body_end)
        if value is None:
            index = equals + 1
            continue

        defaults[prop[0]] = access(value[0])
        index = value[2]

    return defaults


def canonical_register_defaults(text):
    defaults_by_register = {}
    end = len(text)
    index = 0

    while index < end:
        char = text[index]
        if char == '"':
            index = skip_string(text, index, end)
            continue
        next_index = skip_comment(text, index, end)
        if next_index != index:
            index = next_index
            continue

        identifier = read_identifier(text, index, end)
        if identifier is None:
            index += 1
            continue
        if identifier[0] != "reg":
            index = identifier[2]
            continue

        open_brace = skip_trivia(text, identifier[2], end)
        if open_brace >= end or text[open_brace] != "{":
            index = identifier[2]
            continue

        close_brace = find_matching_brace(text, open_brace, end)
        if close_brace is None:
            break

        instance = read_identifier(text, skip_trivia(text, close_brace + 1, end), end)
        if instance is not None:
            defaults_by_register[instance[0]] = register_body_defaults(
                text,
                open_brace + 1,
                close_brace,
            )

        index = close_brace + 1

    return defaults_by_register


def parse(path, text):
    rdlc = RDLCompiler()
    rdlc.compile_file(path)
    root = rdlc.elaborate()
    top = next((child for child in root.children() if isinstance(child, AddrmapNode)), root)
    register_defaults = canonical_register_defaults(text)
    registers = []
    group_ids_by_label = {}
    hierarchy_groups = []

    for reg in top.descendants():
        if not isinstance(reg, RegNode):
            continue

        fields = []
        reg_fields = reg.fields()
        source_defaults = register_defaults.get(reg.inst_name, {})
        reg_sw = source_defaults.get("sw") or (
            access(get_prop(reg_fields[0], "sw", "rw")) if reg_fields else "RW"
        )
        reg_hw = source_defaults.get("hw") or (
            access(get_prop(reg_fields[0], "hw", "rw")) if reg_fields else "RW"
        )
        group_path = str(get_prop(reg, "doc_group", ""))
        group_label = first_group_segment(group_path)

        if group_label and group_label not in group_ids_by_label:
            group_id = stable_id("group", len(hierarchy_groups), group_label)
            group_ids_by_label[group_label] = group_id
            hierarchy_groups.append(
                {
                    "id": group_id,
                    "label": group_label,
                    "path": group_label,
                }
            )

        for index, field in enumerate(reg_fields):
            field_id = stable_id(reg.inst_name, field.inst_name)
            enum_type = get_prop(field, "encode")
            reset = get_prop(field, "reset", 0)
            fields.append(
                {
                    "id": field_id,
                    "name": field.inst_name,
                    "title": str(get_prop(field, "name", field.inst_name)),
                    "desc": str(get_prop(field, "desc", "")),
                    "msb": int(field.high),
                    "lsb": int(field.low),
                    "reset": int(reset) if reset is not None else 0,
                    "sw": access(get_prop(field, "sw", reg_sw)),
                    "hw": access(get_prop(field, "hw", reg_hw)),
                    "enumName": enum_type.__name__ if enum_type else "",
                    "values": enum_values(enum_type, field_id),
                    "color": BIT_COLORS[index % len(BIT_COLORS)],
                }
            )

        registers.append(
            {
                "id": stable_id(reg.inst_name),
                "name": reg.inst_name,
                "title": str(get_prop(reg, "name", reg.inst_name)),
                "desc": str(get_prop(reg, "desc", "")),
                "address": int(reg.absolute_address),
                "width": int(get_prop(reg, "regwidth", 8)),
                "group": group_path,
                "sw": reg_sw,
                "hw": reg_hw,
                "fields": fields,
            }
        )

    top_name = getattr(top, "inst_name", None) or Path(path).stem
    return {
        "deviceName": top_name,
        "blockName": top_name,
        "addrmapName": top_name,
        "title": str(get_prop(top, "name", top_name)),
        "desc": str(get_prop(top, "desc", "")),
        "hierarchyGroups": hierarchy_groups,
        "registers": registers,
    }


def main():
    path = Path(sys.argv[1]).resolve()
    text = path.read_text(encoding="utf-8")
    result = {
        "path": str(path),
        "document": parse(str(path), text),
    }
    print(json.dumps(result))


if __name__ == "__main__":
    main()
