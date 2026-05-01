from dataclasses import dataclass

from app.models import DeviceBomItem


@dataclass
class BomRequirementGroup:
    display_name: str
    component_type: str
    substitution_group: str | None
    allowed_component_types: list[str]
    quantity_required: int
    is_required: bool


@dataclass
class BomRequirementEvaluation:
    requirement: BomRequirementGroup
    installed_quantity: int
    status: str


def build_bom_requirement_groups(bom_items: list[DeviceBomItem]) -> list[BomRequirementGroup]:
    grouped: dict[str, BomRequirementGroup] = {}
    for item in bom_items:
        group_key = item.substitution_group or f"ITEM:{item.component_type}"
        if group_key not in grouped:
            grouped[group_key] = BomRequirementGroup(
                display_name=item.substitution_group or item.component_type,
                component_type=item.component_type,
                substitution_group=item.substitution_group,
                allowed_component_types=[item.component_type],
                quantity_required=item.quantity_required,
                is_required=item.is_required,
            )
            continue
        existing = grouped[group_key]
        if item.component_type not in existing.allowed_component_types:
            existing.allowed_component_types.append(item.component_type)
    return sorted(grouped.values(), key=lambda group: group.display_name)


def evaluate_bom_requirement_groups(
    bom_items: list[DeviceBomItem],
    installed_component_counts: dict[str, int],
) -> tuple[list[BomRequirementEvaluation], dict[str, int]]:
    remaining_counts = installed_component_counts.copy()
    evaluations: list[BomRequirementEvaluation] = []
    for requirement in build_bom_requirement_groups(bom_items):
        installed_quantity = sum(
            remaining_counts.pop(component_type, 0)
            for component_type in requirement.allowed_component_types
        )
        if installed_quantity > requirement.quantity_required:
            status = "OVER_INSTALLED"
        elif requirement.is_required and installed_quantity < requirement.quantity_required:
            status = "MISSING"
        elif requirement.is_required:
            status = "SATISFIED"
        elif installed_quantity > 0:
            status = "OPTIONAL_PRESENT"
        else:
            status = "OPTIONAL_MISSING"
        evaluations.append(
            BomRequirementEvaluation(
                requirement=requirement,
                installed_quantity=installed_quantity,
                status=status,
            )
        )
    return evaluations, remaining_counts
