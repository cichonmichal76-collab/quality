import type { QcChecklistRead, QcStepRead, WorkstationRead } from "./api";
import { labelForCode } from "./dashboard";

export interface QcReferenceArea {
  id: string;
  label: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function formatChecklistLabel(checklist: QcChecklistRead): string {
  return `${checklist.name} - ${labelForCode(checklist.process_stage)} - v${checklist.version}`;
}

export function formatWorkstationLabel(workstation: WorkstationRead): string {
  const area = workstation.area ? `${workstation.area} - ` : "";
  return `${area}${workstation.name} (${workstation.workstation_id})`;
}

export function formatTolerance(step: QcStepRead): string {
  if (step.tolerance_min !== null && step.tolerance_max !== null) {
    return `Tolerancja: ${step.tolerance_min} - ${step.tolerance_max}${step.unit ? ` ${step.unit}` : ""}`;
  }
  if (step.tolerance_min !== null) {
    return `Minimum: ${step.tolerance_min}${step.unit ? ` ${step.unit}` : ""}`;
  }
  if (step.tolerance_max !== null) {
    return `Maksimum: ${step.tolerance_max}${step.unit ? ` ${step.unit}` : ""}`;
  }
  return "Bez tolerancji liczbowej";
}

export function buildStationOverlayAreas(steps: QcStepRead[]): QcReferenceArea[] {
  return steps.flatMap((step, index) => {
    if (
      step.region_x == null ||
      step.region_y == null ||
      step.region_width == null ||
      step.region_height == null
    ) {
      return [];
    }
    return [
      {
        id: step.id,
        label: `K${index + 1}`,
        title: step.title,
        x: step.region_x,
        y: step.region_y,
        width: step.region_width,
        height: step.region_height,
      },
    ];
  });
}
