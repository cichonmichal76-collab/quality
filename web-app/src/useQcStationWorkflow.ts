import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import {
  addQcStepResult,
  completeQcRun,
  createQcRun,
  getProductionItemByBarcode,
  reserveQcItem,
  releaseQcItemForRework,
  releaseQcItemReservation,
  type LoadState,
  type ProductionItemRead,
  type QcChecklistRead,
  type QcRunRead,
  type QcStepRead,
} from "./api";
import {
  buildReservedByOtherOperatorMessage,
  createClientQcRunId,
  createDefaultStepDraft,
  getErrorMessage,
  isProductionItemReservedByOtherOperator,
  normalizeOptionalString,
  prepareStepPayload,
  resolveChecklistCodeForItem,
  type QcStationAuthState,
  type StepDraft,
  type StepDraftMap,
} from "./QcStationShared";

interface UseQcStationWorkflowArgs {
  apiBaseUrl: string;
  authState: QcStationAuthState | null;
  activeChecklists: QcChecklistRead[];
  selectedChecklistCode: string;
  setSelectedChecklistCode: (value: string) => void;
  selectedChecklist: QcChecklistRead | null;
  steps: QcStepRead[];
  stepDrafts: StepDraftMap;
  setStepDrafts: React.Dispatch<React.SetStateAction<StepDraftMap>>;
  reloadWaitingItems: () => void;
}

export function useQcStationWorkflow({
  apiBaseUrl,
  authState,
  activeChecklists,
  selectedChecklistCode,
  setSelectedChecklistCode,
  selectedChecklist,
  steps,
  stepDrafts,
  setStepDrafts,
  reloadWaitingItems,
}: UseQcStationWorkflowArgs) {
  const [barcodeValue, setBarcodeValue] = useState("");
  const [lookupState, setLookupState] = useState<LoadState>("idle");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ProductionItemRead | null>(null);
  const [reservationState, setReservationState] = useState<LoadState>("idle");
  const [reservationError, setReservationError] = useState<string | null>(null);
  const [reservationSuccess, setReservationSuccess] = useState<string | null>(null);
  const [reworkAction, setReworkAction] = useState("");
  const [reworkActionState, setReworkActionState] = useState<LoadState>("idle");
  const [reworkActionError, setReworkActionError] = useState<string | null>(null);
  const [reworkActionSuccess, setReworkActionSuccess] = useState<string | null>(null);
  const [failureReason, setFailureReason] = useState("");
  const [failureComment, setFailureComment] = useState("");
  const [failureDisposition, setFailureDisposition] = useState<
    "OPEN_CRITICAL_NCR" | "REWORK_REQUIRED" | "BLOCKED"
  >("OPEN_CRITICAL_NCR");
  const [submitState, setSubmitState] = useState<LoadState>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [completedRun, setCompletedRun] = useState<QcRunRead | null>(null);

  const resetRunOutcomeState = () => {
    setSubmitState("idle");
    setSubmitError(null);
    setSubmitSuccess(null);
    setCompletedRun(null);
    setFailureReason("");
    setFailureComment("");
    setFailureDisposition("OPEN_CRITICAL_NCR");
  };

  const resetReservationFeedbackState = () => {
    setReservationState("idle");
    setReservationError(null);
    setReservationSuccess(null);
  };

  const resetReworkState = () => {
    setReworkAction("");
    setReworkActionState("idle");
    setReworkActionError(null);
    setReworkActionSuccess(null);
  };

  const resetSelectedItemWorkflowState = () => {
    setLookupState("idle");
    setLookupError(null);
    resetRunOutcomeState();
    resetReworkState();
    resetReservationFeedbackState();
    setSelectedItem(null);
    setBarcodeValue("");
  };

  useEffect(() => {
    setLookupError(null);
    resetRunOutcomeState();
    resetReworkState();
  }, [authState, selectedChecklistCode, selectedItem?.barcode_value]);

  const selectItemForInspection = (item: ProductionItemRead) => {
    const preferredChecklistCode = resolveChecklistCodeForItem(
      item,
      activeChecklists,
      selectedChecklistCode,
    );

    if (preferredChecklistCode && preferredChecklistCode !== selectedChecklistCode) {
      setSelectedChecklistCode(preferredChecklistCode);
    }
    setSelectedItem(item);
    setBarcodeValue(item.barcode_value);
    setLookupState("loaded");
    setLookupError(null);
    resetRunOutcomeState();
    resetReworkState();
    resetReservationFeedbackState();
  };

  const handleLookupSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedApiBaseUrl = apiBaseUrl.trim();
    const trimmedBarcodeValue = barcodeValue.trim();

    setLookupError(null);
    setSubmitError(null);
    setSubmitSuccess(null);
    setCompletedRun(null);
    setReworkActionError(null);
    setReworkActionSuccess(null);
    setReservationError(null);
    setReservationSuccess(null);

    if (!trimmedApiBaseUrl) {
      setLookupState("error");
      setLookupError("Podaj adres API przed skanem.");
      return;
    }

    if (!authState) {
      setLookupState("error");
      setLookupError("Najpierw zaloguj operatora na stanowisku QC.");
      return;
    }

    if (!trimmedBarcodeValue) {
      setLookupState("error");
      setLookupError("Zeskanuj albo wpisz barcode komponentu.");
      return;
    }

    setLookupState("loading");

    try {
      const item = await getProductionItemByBarcode(trimmedApiBaseUrl, trimmedBarcodeValue);
      if (isProductionItemReservedByOtherOperator(item, authState.operatorId)) {
        setSelectedItem(null);
        setLookupState("error");
        setLookupError(buildReservedByOtherOperatorMessage(item));
        return;
      }
      selectItemForInspection(item);
    } catch (error) {
      setSelectedItem(null);
      setLookupState("error");
      setLookupError(
        getErrorMessage(error, "Nie znaleziono komponentu dla podanego barcode."),
      );
    }
  };

  const handlePickWaitingItem = (item: ProductionItemRead) => {
    if (!authState) {
      return;
    }
    if (isProductionItemReservedByOtherOperator(item, authState.operatorId)) {
      setLookupState("error");
      setLookupError(buildReservedByOtherOperatorMessage(item));
      return;
    }
    selectItemForInspection(item);
  };

  const handleReserveSelectedItem = async () => {
    const trimmedApiBaseUrl = apiBaseUrl.trim();
    if (!trimmedApiBaseUrl || !authState || !selectedItem) {
      return;
    }

    setReservationState("loading");
    setReservationError(null);
    setReservationSuccess(null);

    try {
      const reservedItem = await reserveQcItem(trimmedApiBaseUrl, selectedItem.item_serial_number, {
        work_session_id: authState.workSessionId,
        operator_id: authState.operatorId,
      });
      setSelectedItem(reservedItem);
      reloadWaitingItems();
      setReservationState("loaded");
      setReservationSuccess(
        `Detal ${reservedItem.item_serial_number} zostal zarezerwowany na stanowisku ${authState.workstationName}.`,
      );
    } catch (error) {
      setReservationState("error");
      setReservationError(
        getErrorMessage(error, "Nie udalo sie zarezerwowac detalu do kontroli."),
      );
    }
  };

  const handleReleaseSelectedItemReservation = async () => {
    const trimmedApiBaseUrl = apiBaseUrl.trim();
    if (!trimmedApiBaseUrl || !authState || !selectedItem) {
      return;
    }

    setReservationState("loading");
    setReservationError(null);
    setReservationSuccess(null);

    try {
      const releasedItem = await releaseQcItemReservation(
        trimmedApiBaseUrl,
        selectedItem.item_serial_number,
        {
          work_session_id: authState.workSessionId,
          operator_id: authState.operatorId,
        },
      );
      setSelectedItem(releasedItem);
      reloadWaitingItems();
      setReservationState("loaded");
      setReservationSuccess(`Zwolniono rezerwacje detalu ${releasedItem.item_serial_number}.`);
    } catch (error) {
      setReservationState("error");
      setReservationError(
        getErrorMessage(error, "Nie udalo sie zwolnic rezerwacji detalu."),
      );
    }
  };

  const handleReleaseForRework = async (openCriticalNcrsCount = 0) => {
    const trimmedApiBaseUrl = apiBaseUrl.trim();
    const normalizedReworkAction = normalizeOptionalString(reworkAction);

    setReworkActionError(null);
    setReworkActionSuccess(null);

    if (!trimmedApiBaseUrl) {
      setReworkActionState("error");
      setReworkActionError("Podaj adres API przed obsluga NCR albo reworku.");
      return false;
    }

    if (!authState) {
      setReworkActionState("error");
      setReworkActionError("Najpierw zaloguj operatora na stanowisku.");
      return false;
    }

    if (!selectedItem) {
      setReworkActionState("error");
      setReworkActionError("Najpierw wybierz detal do obslugi NCR albo reworku.");
      return false;
    }

    if (!normalizedReworkAction) {
      setReworkActionState("error");
      setReworkActionError("Wpisz akcje korygujaca przed przywroceniem detalu do reworku.");
      return false;
    }

    setReworkActionState("loading");

    try {
      const refreshedItem = await releaseQcItemForRework(
        trimmedApiBaseUrl,
        selectedItem.item_serial_number,
        {
          work_session_id: authState.workSessionId,
          operator_id: authState.operatorId,
          corrective_action: normalizedReworkAction,
        },
      );
      setSelectedItem(refreshedItem);
      reloadWaitingItems();
      setReworkActionState("loaded");
      setReworkActionSuccess(
        openCriticalNcrsCount > 0
          ? `Zamknieto ${openCriticalNcrsCount} krytyczne NCR. Detal ${refreshedItem.item_serial_number} zostal przywrocony do statusu ${refreshedItem.current_status}.`
          : `Detal ${refreshedItem.item_serial_number} zostal przywrocony do statusu ${refreshedItem.current_status}.`,
      );
      return true;
    } catch (error) {
      setReworkActionState("error");
      setReworkActionError(
        getErrorMessage(error, "Nie udalo sie przygotowac detalu do reworku."),
      );
      return false;
    }
  };

  const handleStepDraftChange = (
    stepId: string,
    field: keyof StepDraft,
    value: string,
  ) => {
    setStepDrafts((currentDrafts) => ({
      ...currentDrafts,
      [stepId]: {
        ...(currentDrafts[stepId] ?? createDefaultStepDraft()),
        [field]: value,
      },
    }));
  };

  const handleSubmitRun = async () => {
    const trimmedApiBaseUrl = apiBaseUrl.trim();

    setSubmitError(null);
    setSubmitSuccess(null);
    setCompletedRun(null);
    setReworkActionError(null);
    setReworkActionSuccess(null);

    if (!trimmedApiBaseUrl) {
      setSubmitState("error");
      setSubmitError("Podaj adres API przed zapisem kontroli.");
      return;
    }

    if (!authState) {
      setSubmitState("error");
      setSubmitError("Najpierw zaloguj operatora na stanowisku.");
      return;
    }

    if (!selectedItem) {
      setSubmitState("error");
      setSubmitError("Najpierw zeskanuj komponent do kontroli.");
      return;
    }

    if (isProductionItemReservedByOtherOperator(selectedItem, authState.operatorId)) {
      setSubmitState("error");
      setSubmitError(buildReservedByOtherOperatorMessage(selectedItem));
      return;
    }

    if (!selectedChecklist) {
      setSubmitState("error");
      setSubmitError("Wybierz checkliste QC.");
      return;
    }

    if (steps.length === 0) {
      setSubmitState("error");
      setSubmitError("Wybrana checklista nie ma zadnych krokow do zapisania.");
      return;
    }

    const preparedSteps = [];
    for (const step of steps) {
      const preparedStep = prepareStepPayload(step, stepDrafts[step.id]);
      if ("error" in preparedStep) {
        setSubmitState("error");
        setSubmitError(preparedStep.error);
        return;
      }
      preparedSteps.push({ step, payload: preparedStep.payload });
    }

    const finalResult = preparedSteps.some(
      (preparedStep) => preparedStep.payload.status === "FAIL",
    )
      ? "FAIL"
      : "PASS";
    const normalizedFailureReason = normalizeOptionalString(failureReason);
    const normalizedFailureComment = normalizeOptionalString(failureComment);

    if (finalResult === "FAIL") {
      if (!normalizedFailureReason) {
        setSubmitState("error");
        setSubmitError("Dla wyniku FAIL wybierz powod niezgodnosci.");
        return;
      }
      if (!normalizedFailureComment) {
        setSubmitState("error");
        setSubmitError("Dla wyniku FAIL wpisz komentarz operatora.");
        return;
      }
    }

    setSubmitState("loading");

    try {
      const reservedItem =
        selectedItem.qc_reserved_by_operator_id === authState.operatorId
          ? selectedItem
          : await reserveQcItem(trimmedApiBaseUrl, selectedItem.item_serial_number, {
              work_session_id: authState.workSessionId,
              operator_id: authState.operatorId,
            });
      setSelectedItem(reservedItem);
      reloadWaitingItems();

      const runId = createClientQcRunId();
      await createQcRun(trimmedApiBaseUrl, {
        run_id: runId,
        item_serial_number: reservedItem.item_serial_number,
        barcode_value: reservedItem.barcode_value,
        checklist_id: selectedChecklist.id,
        process_stage: selectedChecklist.process_stage,
        operator_id: authState.operatorId,
        work_session_id: authState.workSessionId,
      });

      for (const preparedStep of preparedSteps) {
        await addQcStepResult(
          trimmedApiBaseUrl,
          runId,
          preparedStep.step.id,
          preparedStep.payload,
        );
      }

      const completed = await completeQcRun(trimmedApiBaseUrl, runId, {
        result: finalResult,
        failure_reason: normalizedFailureReason ?? undefined,
        failure_comment: normalizedFailureComment ?? undefined,
        failure_disposition: failureDisposition,
      });
      const refreshedItem = await getProductionItemByBarcode(
        trimmedApiBaseUrl,
        reservedItem.barcode_value,
      );

      setSelectedItem(refreshedItem);
      reloadWaitingItems();
      setCompletedRun(completed);
      setSubmitState("loaded");
      setSubmitSuccess(
        completed.result === "PASS"
          ? `Kontrola zakonczona PASS. Komponent ${refreshedItem.item_serial_number} ma teraz status ${refreshedItem.current_status}.`
          : `Kontrola zakonczona FAIL. Komponent ${refreshedItem.item_serial_number} ma teraz status ${refreshedItem.current_status}.`,
      );
    } catch (error) {
      setSubmitState("error");
      setSubmitError(
        getErrorMessage(error, "Nie udalo sie zapisac wynikow kontroli QC."),
      );
    }
  };

  return {
    barcodeValue,
    setBarcodeValue,
    lookupState,
    lookupError,
    selectedItem,
    reservationState,
    reservationError,
    reservationSuccess,
    reworkAction,
    setReworkAction,
    reworkActionState,
    reworkActionError,
    reworkActionSuccess,
    failureReason,
    setFailureReason,
    failureComment,
    setFailureComment,
    failureDisposition,
    setFailureDisposition,
    submitState,
    submitError,
    submitSuccess,
    completedRun,
    resetRunOutcomeState,
    resetReservationFeedbackState,
    resetReworkState,
    resetSelectedItemWorkflowState,
    handleLookupSubmit,
    handlePickWaitingItem,
    handleReserveSelectedItem,
    handleReleaseSelectedItemReservation,
    handleReleaseForRework,
    handleStepDraftChange,
    handleSubmitRun,
  };
}
