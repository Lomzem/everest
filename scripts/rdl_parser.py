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


def parse(path):
    rdlc = RDLCompiler()
    rdlc.compile_file(path)
    root = rdlc.elaborate()
    top = next((child for child in root.children() if isinstance(child, AddrmapNode)), root)
    registers = []
    group_ids_by_label = {}
    hierarchy_groups = []

    for reg in top.descendants():
        if not isinstance(reg, RegNode):
            continue

        fields = []
        reg_fields = reg.fields()
        reg_sw = access(get_prop(reg_fields[0], "sw", "rw")) if reg_fields else "RW"
        reg_hw = access(get_prop(reg_fields[0], "hw", "rw")) if reg_fields else "RW"
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
    text = path.read_text(encoding="utf8")
    result = {
        "path": str(path),
        "document": parse(str(path)),
        "source": {
            "rootPath": str(path),
            "text": text,
            "readOnly": True,
            "readOnlyReason": "This file was opened losslessly. Source-safe edit ranges are not available yet, so the parsed view is read-only.",
        },
    }
    print(json.dumps(result))


if __name__ == "__main__":
    main()
