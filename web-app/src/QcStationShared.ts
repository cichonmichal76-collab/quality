import type {
  NonconformityRead,
  OperatorRead,
  ProductionItemRead,
  QcChecklistRead,
  QcRunRead,
  QcStepRead,
  WorkstationRead,
} from "./api";
import { labelForCode } from "./dashboard";

export interface QcStationAuthState {
  workSessionId: string;
  operatorId: string;
  operatorName: string;
  operatorRole: string;
  operatorLoginName: string;
  workstationId: string;
  workstationName: string;
  machineId: string | null;
  loginMethod: "PASSWORD" | "RFID";
}

export type LoginMethod = "PASSWORD" | "RFID";

export interface StepDraft {
  status: "PASS" | "FAIL";
  measurementValue: string;
  observedValue: string;
  comment: string;
}

export type StepDraftMap = Record<string, StepDraft>;

export interface StepPreview {
  kind: "success" | "error";
  message: string;
}

export type WaitingItemsFilter = "ALL" | "PRODUCED" | "REWORK_REQUIRED";
export type WaitingItemsReservationFilter =
  | "ALL"
  | "UNRESERVED"
  | "MINE"
  | "OTHER_RESERVED";
export type WaitingItemsSort = "OLDEST" | "NEWEST";
export type WaitingItemsPreset =
  | "PRODUCED"
  | "REWORK_REQUIRED"
  | "UNRESERVED"
  | "MINE"
  | "OTHER_RESERVED"
  | "RESET";
export type QcRunHistoryFilter = "ALL" | "FAIL" | "PASS" | "POST_LATEST_REWORK";
export type QcRunHistorySort = "NEWEST" | "OLDEST";
export type ClosedCriticalNcrSort = "NEWEST" | "OLDEST";
export type QcRunHistoryPreset =
  | "LATEST_FAIL"
  | "LATEST_PASS"
  | "POST_LATEST_REWORK"
  | "RESET";

export interface QcReferenceArea {
  id: string;
  label: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WaitingItemsReservationSummary {
  all: number;
  unreserved: number;
  mine: number;
  otherReserved: number;
}

export interface WaitingItemsPresetState {
  filter: WaitingItemsFilter;
  reservationFilter: WaitingItemsReservationFilter;
  sort: WaitingItemsSort;
}

export interface QcRunHistoryPresetState {
  filter: QcRunHistoryFilter;
  sort: QcRunHistorySort;
  closedCriticalNcrSort: ClosedCriticalNcrSort;
}

export function buildInitialStepDrafts(steps: QcStepRead[]): StepDraftMap {
  return Object.fromEntries(
    steps.map((step) => [step.id, createDefaultStepDraft(step.requires_measurement)]),
  );
}

export function createDefaultStepDraft(_requiresMeasurement = false): StepDraft {
  return {
    status: "PASS",
    measurementValue: "",
    observedValue: "",
    comment: "",
  };
}

export function prepareStepPayload(
  step: QcStepRead,
  draft: StepDraft | undefined,
):
  | {
      payload: {
        status: "PASS" | "FAIL";
        measurement_value?: number;
        observed_value?: string;
        comment?: string;
      };
    }
  | { error: string } {
  const safeDraft = draft ?? createDefaultStepDraft(step.requires_measurement);
  const normalizedComment = normalizeOptionalString(safeDraft.comment);
  const observedValue = normalizeOptionalString(safeDraft.observedValue);
  const evaluationMode = normalizeStepEvaluationMode(step);

  if (evaluationMode === "TEXT_MATCH") {
    if (!observedValue) {
      return {
        error: `Krok "${step.title}" wymaga wpisania obserwowanego wyniku.`,
      };
    }
    return {
      payload: {
        status: "PASS",
        observed_value: observedValue,
        ...(normalizedComment ? { comment: normalizedComment } : {}),
      },
    };
  }

  if (evaluationMode === "NUMERIC_RANGE" || step.requires_measurement) {
    if (safeDraft.status === "FAIL") {
      return {
        payload: {
          status: "FAIL",
          ...(normalizedComment ? { comment: normalizedComment } : {}),
        },
      };
    }

    const trimmedMeasurement = safeDraft.measurementValue.trim().replace(",", ".");
    if (!trimmedMeasurement) {
      return {
        error: `Krok "${step.title}" wymaga pomiaru albo recznego FAIL.`,
      };
    }

    const measurementValue = Number(trimmedMeasurement);
    if (!Number.isFinite(measurementValue)) {
      return {
        error: `Pomiar dla kroku "${step.title}" nie jest poprawna liczba.`,
      };
    }

    return {
      payload: {
        status: "PASS",
        measurement_value: measurementValue,
        ...(normalizedComment ? { comment: normalizedComment } : {}),
      },
    };
  }

  return {
    payload: {
      status: safeDraft.status,
      ...(normalizedComment ? { comment: normalizedComment } : {}),
    },
  };
}

export function buildStepPreviews(
  steps: QcStepRead[],
  stepDrafts: StepDraftMap,
): Record<string, StepPreview> {
  const previews: Record<string, StepPreview> = {};

  for (const step of steps) {
    const evaluationMode = normalizeStepEvaluationMode(step);
    if (evaluationMode === "TEXT_MATCH") {
      const draft = stepDrafts[step.id];
      const observedValue = draft?.observedValue.trim();
      if (!observedValue || !step.expected_value) {
        continue;
      }
      const normalizedObservedValue = observedValue.toLowerCase();
      const normalizedExpectedValue = step.expected_value.trim().toLowerCase();

      previews[step.id] = {
        kind: normalizedObservedValue === normalizedExpectedValue ? "success" : "error",
        message:
          normalizedObservedValue === normalizedExpectedValue
            ? "Wynik zgadza sie z wartoscia oczekiwana."
            : "Wynik rozni sie od wartosci oczekiwanej.",
      };
      continue;
    }

    if (!(evaluationMode === "NUMERIC_RANGE" || step.requires_measurement)) {
      continue;
    }

    const draft = stepDrafts[step.id];
    if (!draft || draft.status === "FAIL") {
      continue;
    }

    const trimmedMeasurement = draft.measurementValue.trim().replace(",", ".");
    if (!trimmedMeasurement) {
      continue;
    }

    const measurementValue = Number(trimmedMeasurement);
    if (!Number.isFinite(measurementValue)) {
      previews[step.id] = {
        kind: "error",
        message: "Pomiar nie jest poprawna liczba.",
      };
      continue;
    }

    if (step.tolerance_min !== null && measurementValue < Number(step.tolerance_min)) {
      previews[step.id] = {
        kind: "error",
        message: `Poza tolerancja: ${measurementValue} < ${step.tolerance_min}.`,
      };
      continue;
    }

    if (step.tolerance_max !== null && measurementValue > Number(step.tolerance_max)) {
      previews[step.id] = {
        kind: "error",
        message: `Poza tolerancja: ${measurementValue} > ${step.tolerance_max}.`,
      };
      continue;
    }

    previews[step.id] = {
      kind: "success",
      message: "Pomiar miesci sie w tolerancji.",
    };
  }

  return previews;
}

export function deriveDraftRunResult(
  steps: QcStepRead[],
  stepDrafts: StepDraftMap,
): "PASS" | "FAIL" {
  for (const step of steps) {
    const draft = stepDrafts[step.id] ?? createDefaultStepDraft(step.requires_measurement);
    const evaluationMode = normalizeStepEvaluationMode(step);

    if (evaluationMode === "TEXT_MATCH") {
      const observedValue = normalizeOptionalString(draft.observedValue);
      const expectedValue = normalizeOptionalString(step.expected_value ?? "");
      if (
        observedValue &&
        expectedValue &&
        observedValue.toLowerCase() !== expectedValue.toLowerCase()
      ) {
        return "FAIL";
      }
      continue;
    }

    if (evaluationMode === "NUMERIC_RANGE" || step.requires_measurement) {
      if (draft.status === "FAIL") {
        return "FAIL";
      }

      const measurementValue = parseOptionalMeasurementValue(draft.measurementValue);
      if (measurementValue === null) {
        continue;
      }

      if (
        (step.tolerance_min !== null && measurementValue < Number(step.tolerance_min)) ||
        (step.tolerance_max !== null && measurementValue > Number(step.tolerance_max))
      ) {
        return "FAIL";
      }
      continue;
    }

    if (draft.status === "FAIL") {
      return "FAIL";
    }
  }

  return "PASS";
}

export function resolveChecklistCodeForItem(
  item: ProductionItemRead,
  activeChecklists: QcChecklistRead[],
  currentChecklistCode: string,
): string {
  const componentChecklists = activeChecklists.filter(
    (checklist) => checklist.process_stage === "COMPONENT_QC",
  );
  const currentChecklist =
    activeChecklists.find((checklist) => checklist.checklist_code === currentChecklistCode) ??
    null;
  const exactMatch =
    componentChecklists.find((checklist) => checklist.component_type === item.item_type) ??
    null;
  if (exactMatch) {
    return exactMatch.checklist_code;
  }
  if (
    currentChecklist &&
    (currentChecklist.component_type === item.item_type ||
      currentChecklist.component_type === null)
  ) {
    return currentChecklist.checklist_code;
  }
  const genericMatch =
    componentChecklists.find((checklist) => checklist.component_type === null) ?? null;
  if (genericMatch) {
    return genericMatch.checklist_code;
  }
  return currentChecklist?.checklist_code ?? activeChecklists[0]?.checklist_code ?? "";
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

export function normalizeStepEvaluationMode(
  step: QcStepRead,
): "MANUAL" | "NUMERIC_RANGE" | "TEXT_MATCH" {
  const normalizedMode = step.evaluation_mode?.toUpperCase();
  if (normalizedMode === "NUMERIC_RANGE" || normalizedMode === "TEXT_MATCH") {
    return normalizedMode;
  }
  return step.requires_measurement ? "NUMERIC_RANGE" : "MANUAL";
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

export function parseOptionalMeasurementValue(value: string): number | null {
  const normalizedValue = value.trim().replace(",", ".");
  if (!normalizedValue) {
    return null;
  }
  const measurementValue = Number(normalizedValue);
  return Number.isFinite(measurementValue) ? measurementValue : null;
}

export function normalizeOptionalString(value: string): string | null {
  const normalizedValue = value.trim();
  return normalizedValue === "" ? null : normalizedValue;
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

export function filterAndSortQcRunHistory(
  runs: QcRunRead[],
  closedCriticalNcrs: NonconformityRead[],
  filter: QcRunHistoryFilter,
  sort: QcRunHistorySort,
): QcRunRead[] {
  const latestClosedCriticalNcrTimestamp = getLatestClosedCriticalNcrTimestamp(
    closedCriticalNcrs,
  );
  const filteredRuns = runs.filter((run) => {
    if (filter === "FAIL") {
      return run.result === "FAIL";
    }
    if (filter === "PASS") {
      return run.result === "PASS";
    }
    if (filter === "POST_LATEST_REWORK") {
      if (latestClosedCriticalNcrTimestamp === null) {
        return false;
      }
      const runTimestamp = Date.parse(run.started_at ?? run.ended_at ?? "");
      if (!Number.isFinite(runTimestamp)) {
        return false;
      }
      return runTimestamp >= latestClosedCriticalNcrTimestamp;
    }
    return true;
  });

  return [...filteredRuns].sort((left, right) => {
    const leftTimestamp = Date.parse(left.ended_at ?? left.started_at ?? "");
    const rightTimestamp = Date.parse(right.ended_at ?? right.started_at ?? "");
    const normalizedLeftTimestamp = Number.isFinite(leftTimestamp) ? leftTimestamp : 0;
    const normalizedRightTimestamp = Number.isFinite(rightTimestamp) ? rightTimestamp : 0;
    if (normalizedLeftTimestamp !== normalizedRightTimestamp) {
      return sort === "NEWEST"
        ? normalizedRightTimestamp - normalizedLeftTimestamp
        : normalizedLeftTimestamp - normalizedRightTimestamp;
    }
    return sort === "NEWEST"
      ? right.run_id.localeCompare(left.run_id, "pl")
      : left.run_id.localeCompare(right.run_id, "pl");
  });
}

export function filterAndSortWaitingItems(
  items: ProductionItemRead[],
  filter: WaitingItemsFilter,
  reservationFilter: WaitingItemsReservationFilter,
  sort: WaitingItemsSort,
  operatorId: string | null,
): ProductionItemRead[] {
  const filteredItems = items.filter((item) => {
    if (filter !== "ALL" && item.current_status !== filter) {
      return false;
    }
    if (reservationFilter === "ALL") {
      return true;
    }
    if (reservationFilter === "UNRESERVED") {
      return !item.qc_reserved_by_operator_id;
    }
    if (reservationFilter === "MINE") {
      return !!operatorId && item.qc_reserved_by_operator_id === operatorId;
    }
    return !!item.qc_reserved_by_operator_id && item.qc_reserved_by_operator_id !== operatorId;
  });

  return [...filteredItems].sort((left, right) => {
    const leftTimestamp = Date.parse(left.produced_at ?? left.created_at);
    const rightTimestamp = Date.parse(right.produced_at ?? right.created_at);
    const normalizedLeftTimestamp = Number.isFinite(leftTimestamp) ? leftTimestamp : 0;
    const normalizedRightTimestamp = Number.isFinite(rightTimestamp) ? rightTimestamp : 0;
    if (normalizedLeftTimestamp !== normalizedRightTimestamp) {
      return sort === "NEWEST"
        ? normalizedRightTimestamp - normalizedLeftTimestamp
        : normalizedLeftTimestamp - normalizedRightTimestamp;
    }
    return sort === "NEWEST"
      ? right.item_serial_number.localeCompare(left.item_serial_number, "pl")
      : left.item_serial_number.localeCompare(right.item_serial_number, "pl");
  });
}

export function summarizeWaitingItemsReservations(
  items: ProductionItemRead[],
  operatorId: string | null,
): WaitingItemsReservationSummary {
  return items.reduce(
    (summary, item) => {
      summary.all += 1;
      if (!item.qc_reserved_by_operator_id) {
        summary.unreserved += 1;
        return summary;
      }
      if (operatorId && item.qc_reserved_by_operator_id === operatorId) {
        summary.mine += 1;
        return summary;
      }
      summary.otherReserved += 1;
      return summary;
    },
    { all: 0, unreserved: 0, mine: 0, otherReserved: 0 },
  );
}

export function resolveWaitingItemsPreset(
  preset: WaitingItemsPreset,
): WaitingItemsPresetState {
  if (preset === "PRODUCED") {
    return {
      filter: "PRODUCED",
      reservationFilter: "ALL",
      sort: "OLDEST",
    };
  }

  if (preset === "REWORK_REQUIRED") {
    return {
      filter: "REWORK_REQUIRED",
      reservationFilter: "ALL",
      sort: "OLDEST",
    };
  }

  if (preset === "UNRESERVED") {
    return {
      filter: "ALL",
      reservationFilter: "UNRESERVED",
      sort: "OLDEST",
    };
  }

  if (preset === "MINE") {
    return {
      filter: "ALL",
      reservationFilter: "MINE",
      sort: "OLDEST",
    };
  }

  if (preset === "OTHER_RESERVED") {
    return {
      filter: "ALL",
      reservationFilter: "OTHER_RESERVED",
      sort: "OLDEST",
    };
  }

  return {
    filter: "ALL",
    reservationFilter: "ALL",
    sort: "OLDEST",
  };
}

export function isProductionItemReservedByOtherOperator(
  item: ProductionItemRead,
  operatorId: string,
): boolean {
  return !!item.qc_reserved_by_operator_id && item.qc_reserved_by_operator_id !== operatorId;
}

export function formatWaitingItemReservationLabel(item: ProductionItemRead): string {
  const operatorLabel = item.qc_reserved_by_operator_id ?? "nieznany operator";
  if (item.qc_reserved_by_workstation_id) {
    return `${operatorLabel} @ ${item.qc_reserved_by_workstation_id}`;
  }
  return operatorLabel;
}

export function buildReservedByOtherOperatorMessage(item: ProductionItemRead): string {
  return `Komponent jest zarezerwowany przez operatora ${formatWaitingItemReservationLabel(item)}.`;
}

export function getLatestClosedCriticalNcrTimestamp(
  ncrs: NonconformityRead[],
): number | null {
  let latestTimestamp: number | null = null;
  for (const ncr of ncrs) {
    const closedTimestamp = Date.parse(ncr.closed_at ?? "");
    if (!Number.isFinite(closedTimestamp)) {
      continue;
    }
    if (latestTimestamp === null || closedTimestamp > latestTimestamp) {
      latestTimestamp = closedTimestamp;
    }
  }
  return latestTimestamp;
}

export function sortClosedCriticalNcrs(
  ncrs: NonconformityRead[],
  sort: ClosedCriticalNcrSort,
): NonconformityRead[] {
  return [...ncrs].sort((left, right) => {
    const leftTimestamp = Date.parse(left.closed_at ?? left.detected_at);
    const rightTimestamp = Date.parse(right.closed_at ?? right.detected_at);
    const normalizedLeftTimestamp = Number.isFinite(leftTimestamp) ? leftTimestamp : 0;
    const normalizedRightTimestamp = Number.isFinite(rightTimestamp) ? rightTimestamp : 0;
    if (normalizedLeftTimestamp !== normalizedRightTimestamp) {
      return sort === "NEWEST"
        ? normalizedRightTimestamp - normalizedLeftTimestamp
        : normalizedLeftTimestamp - normalizedRightTimestamp;
    }
    return sort === "NEWEST"
      ? right.ncr_id.localeCompare(left.ncr_id, "pl")
      : left.ncr_id.localeCompare(right.ncr_id, "pl");
  });
}

export function resolveQcRunHistoryPreset(
  preset: QcRunHistoryPreset,
): QcRunHistoryPresetState {
  if (preset === "LATEST_FAIL") {
    return {
      filter: "FAIL",
      sort: "NEWEST",
      closedCriticalNcrSort: "NEWEST",
    };
  }

  if (preset === "LATEST_PASS") {
    return {
      filter: "PASS",
      sort: "NEWEST",
      closedCriticalNcrSort: "NEWEST",
    };
  }

  if (preset === "POST_LATEST_REWORK") {
    return {
      filter: "POST_LATEST_REWORK",
      sort: "NEWEST",
      closedCriticalNcrSort: "NEWEST",
    };
  }

  return {
    filter: "ALL",
    sort: "NEWEST",
    closedCriticalNcrSort: "NEWEST",
  };
}

export function createClientQcRunId(): string {
  return `QC-WEB-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export function findOperatorByLogin(
  operators: OperatorRead[],
  loginName: string,
): OperatorRead | null {
  const normalizedLogin = loginName.trim().toLowerCase();
  return (
    operators.find((operator) => {
      const candidate = (operator.login_name ?? operator.operator_id).trim().toLowerCase();
      return candidate === normalizedLogin;
    }) ?? null
  );
}

export function readStoredAuthState(storageKey: string): QcStationAuthState | null {
  const rawValue = localStorage.getItem(storageKey);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<QcStationAuthState>;
    if (
      !parsed.workSessionId ||
      !parsed.operatorId ||
      !parsed.operatorName ||
      !parsed.operatorRole ||
      !parsed.operatorLoginName ||
      !parsed.workstationId ||
      !parsed.workstationName ||
      !parsed.loginMethod
    ) {
      return null;
    }

    return {
      workSessionId: parsed.workSessionId,
      operatorId: parsed.operatorId,
      operatorName: parsed.operatorName,
      operatorRole: parsed.operatorRole,
      operatorLoginName: parsed.operatorLoginName,
      workstationId: parsed.workstationId,
      workstationName: parsed.workstationName,
      machineId: parsed.machineId ?? null,
      loginMethod: parsed.loginMethod,
    };
  } catch {
    return null;
  }
}
