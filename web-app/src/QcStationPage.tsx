import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import {
  addQcStepResult,
  completeQcRun,
  createQcRun,
  getProductionItemByBarcode,
  operatorLogin,
  releaseQcItemReservation,
  releaseQcItemForRework,
  reserveQcItem,
  rfidLogin,
} from "./api";
import { QcStationHistoryPanel } from "./QcStationHistoryPanel";
import { QcStationLoginScreen } from "./QcStationLoginScreen";
import { QcStationQueuePanel } from "./QcStationQueuePanel";
import { QcStationRunPanel } from "./QcStationRunPanel";
import { useQcStationChecklistSteps } from "./useQcStationChecklistSteps";
import { useQcStationContext } from "./useQcStationContext";
import { useQcStationHistory } from "./useQcStationHistory";
import { useQcStationWaitingItems } from "./useQcStationWaitingItems";
import {
  buildReservedByOtherOperatorMessage,
  buildStationOverlayAreas,
  buildStepPreviews,
  createClientQcRunId,
  createDefaultStepDraft,
  deriveDraftRunResult,
  filterAndSortQcRunHistory,
  filterAndSortWaitingItems,
  findOperatorByLogin,
  formatChecklistLabel,
  formatTolerance,
  formatWaitingItemReservationLabel,
  formatWorkstationLabel,
  getErrorMessage,
  isProductionItemReservedByOtherOperator,
  normalizeOptionalString,
  normalizeStepEvaluationMode,
  prepareStepPayload,
  resolveQcRunHistoryPreset,
  resolveChecklistCodeForItem,
  resolveWaitingItemsPreset,
  sortClosedCriticalNcrs,
  summarizeWaitingItemsReservations,
  type ClosedCriticalNcrSort,
  type QcRunHistoryFilter,
  type QcRunHistoryPreset,
  type QcRunHistorySort,
  type QcStationAuthState,
  type StepDraft,
  type StepDraftMap,
  type StepPreview,
  type WaitingItemsFilter,
  type WaitingItemsPreset,
  type WaitingItemsReservationFilter,
  type WaitingItemsSort,
} from "./QcStationShared";
import type {
  LoadState,
  OperatorRead,
  ProductionItemRead,
  QcRunRead,
} from "./api";
import { labelForCode } from "./dashboard";

const QUALITY_ACTION_ALLOWED_ROLES = new Set([
  "ADMIN",
  "QUALITY_INSPECTOR",
  "QUALITY_MANAGER",
]);
const QC_FAILURE_REASON_OPTIONS = [
  { value: "DIMENSION_OUT_OF_RANGE", label: "Wymiar poza tolerancja" },
  { value: "VISUAL_DEFECT", label: "Wada wizualna" },
  { value: "MARKING_MISMATCH", label: "Niezgodne oznaczenie" },
  { value: "ASSEMBLY_DAMAGE", label: "Uszkodzenie po montazu" },
  { value: "OTHER", label: "Inny powod" },
] as const;
const QC_FAILURE_DISPOSITION_OPTIONS = [
  {
    value: "OPEN_CRITICAL_NCR",
    label: "Otworz krytyczne NCR",
    hint: "Detal zostanie oznaczony jako QC_FAILED i otworzy krytyczne NCR.",
  },
  {
    value: "REWORK_REQUIRED",
    label: "Przekaz do rework",
    hint: "Detal wraca do kolejki QC jako REWORK_REQUIRED bez otwierania NCR.",
  },
  {
    value: "BLOCKED",
    label: "Zablokuj detal",
    hint: "Detal zostanie zablokowany bez otwierania NCR.",
  },
] as const;

type LoginMethod = "PASSWORD" | "RFID";

export function QcStationPage() {
  const {
    apiBaseUrl,
    setApiBaseUrl,
    operators,
    contextState,
    contextError,
    authState,
    setAuthState,
    selectedChecklistCode,
    setSelectedChecklistCode,
    manualLoginName,
    setManualLoginName,
    selectedWorkstationId,
    setSelectedWorkstationId,
    activeWorkstations,
    activeChecklists,
    selectedChecklist,
    selectedWorkstation,
  } = useQcStationContext();
  const [manualPassword, setManualPassword] = useState("");
  const [rfidUidHash, setRfidUidHash] = useState("");
  const [authSubmitState, setAuthSubmitState] = useState<LoadState>("idle");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [barcodeValue, setBarcodeValue] = useState("");
  const [lookupState, setLookupState] = useState<LoadState>("idle");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ProductionItemRead | null>(null);
  const [waitingItemsFilter, setWaitingItemsFilter] =
    useState<WaitingItemsFilter>("ALL");
  const [waitingItemsReservationFilter, setWaitingItemsReservationFilter] =
    useState<WaitingItemsReservationFilter>("ALL");
  const [waitingItemsSort, setWaitingItemsSort] =
    useState<WaitingItemsSort>("OLDEST");
  const [reservationState, setReservationState] = useState<LoadState>("idle");
  const [reservationError, setReservationError] = useState<string | null>(null);
  const [reservationSuccess, setReservationSuccess] = useState<string | null>(null);
  const [qcRunHistoryFilter, setQcRunHistoryFilter] =
    useState<QcRunHistoryFilter>("ALL");
  const [qcRunHistorySort, setQcRunHistorySort] =
    useState<QcRunHistorySort>("NEWEST");
  const [closedCriticalNcrSort, setClosedCriticalNcrSort] =
    useState<ClosedCriticalNcrSort>("NEWEST");
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
  const { stepsState, stepsError, steps, stepDrafts, setStepDrafts } =
    useQcStationChecklistSteps(apiBaseUrl, selectedChecklistCode, !!authState);
  const { waitingItemsState, waitingItemsError, waitingItems, reloadWaitingItems } =
    useQcStationWaitingItems(apiBaseUrl, !!authState);
  const {
    openCriticalNcrsState,
    openCriticalNcrsError,
    openCriticalNcrs,
    setOpenCriticalNcrs,
    closedCriticalNcrsState,
    closedCriticalNcrsError,
    closedCriticalNcrs,
    qcRunHistoryState,
    qcRunHistoryError,
    qcRunHistory,
    selectedHistoryRunId,
    setSelectedHistoryRunId,
    selectedHistoryRunDetails,
    qcRunDetailsState,
    qcRunDetailsError,
    resetHistoryState,
  } = useQcStationHistory(
    apiBaseUrl,
    !!authState,
    selectedItem?.item_serial_number ?? null,
    selectedItem?.current_status ?? null,
  );
  const stepPreviews = buildStepPreviews(steps, stepDrafts);
  const referenceOverlayAreas = buildStationOverlayAreas(steps);
  const predictedRunResult = deriveDraftRunResult(steps, stepDrafts);
  const shouldShowReworkPanel =
    !!selectedItem &&
    (openCriticalNcrs.length > 0 ||
      selectedItem.current_status === "QC_FAILED" ||
      selectedItem.current_status === "BLOCKED" ||
      selectedItem.current_status === "REWORK_REQUIRED");
  const canReleaseSelectedItemForRework =
    !!selectedItem &&
    (openCriticalNcrs.length > 0 ||
      selectedItem.current_status === "QC_FAILED" ||
      selectedItem.current_status === "BLOCKED");
  const selectedItemReservedByOtherOperator =
    !!authState && !!selectedItem && isProductionItemReservedByOtherOperator(selectedItem, authState.operatorId);
  const selectedItemReservedByCurrentOperator =
    !!authState &&
    !!selectedItem &&
    selectedItem.qc_reserved_by_operator_id === authState.operatorId;
  const filteredWaitingItems = filterAndSortWaitingItems(
    waitingItems,
    waitingItemsFilter,
    waitingItemsReservationFilter,
    waitingItemsSort,
    authState?.operatorId ?? null,
  );
  const waitingItemsReservationSummary = summarizeWaitingItemsReservations(
    waitingItems,
    authState?.operatorId ?? null,
  );
  const filteredQcRunHistory = filterAndSortQcRunHistory(
    qcRunHistory,
    closedCriticalNcrs,
    qcRunHistoryFilter,
    qcRunHistorySort,
  );
  const sortedClosedCriticalNcrs = sortClosedCriticalNcrs(
    closedCriticalNcrs,
    closedCriticalNcrSort,
  );

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

  const resetHistoryAndNcrState = () => {
    resetHistoryState();
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
    if (!authState) {
      return;
    }

    const matchingOperator = operators.find(
      (operator) => operator.operator_id === authState.operatorId,
    );
    if (
      matchingOperator &&
      !QUALITY_ACTION_ALLOWED_ROLES.has(matchingOperator.role)
    ) {
      setAuthState(null);
      setAuthError("Ten operator nie ma roli dopuszczonej do stanowiska kontroli jakosci.");
      return;
    }

    const matchingWorkstation = activeWorkstations.find(
      (workstation) => workstation.workstation_id === authState.workstationId,
    );
    if (!matchingWorkstation && activeWorkstations.length > 0) {
      setAuthState(null);
      setAuthError("Zapisane stanowisko nie jest juz aktywne. Zaloguj sie ponownie.");
    }
  }, [activeWorkstations, authState, operators]);

  useEffect(() => {
    if (filteredQcRunHistory.length === 0) {
      if (selectedHistoryRunId !== null) {
        setSelectedHistoryRunId(null);
      }
      return;
    }

    const hasSelectedRun = filteredQcRunHistory.some(
      (run) => run.run_id === selectedHistoryRunId,
    );
    if (!hasSelectedRun) {
      setSelectedHistoryRunId(filteredQcRunHistory[0]?.run_id ?? null);
    }
  }, [filteredQcRunHistory, selectedHistoryRunId]);

  useEffect(() => {
    setLookupError(null);
    resetRunOutcomeState();
    resetHistoryAndNcrState();
    resetReworkState();
  }, [authState, selectedChecklistCode, selectedItem?.barcode_value]);

  const handleManualLoginSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedApiBaseUrl = apiBaseUrl.trim();
    const trimmedLogin = manualLoginName.trim();
    const trimmedPassword = manualPassword.trim();

    setAuthError(null);
    setAuthMessage(null);

    if (!trimmedApiBaseUrl) {
      setAuthSubmitState("error");
      setAuthError("Podaj adres API przed logowaniem.");
      return;
    }

    if (!selectedWorkstationId) {
      setAuthSubmitState("error");
      setAuthError("Wybierz stanowisko kontroli jakosci.");
      return;
    }

    if (!trimmedLogin || !trimmedPassword) {
      setAuthSubmitState("error");
      setAuthError("Uzupelnij login i haslo operatora.");
      return;
    }

    const loginCandidate = findOperatorByLogin(operators, trimmedLogin);
    if (loginCandidate && !QUALITY_ACTION_ALLOWED_ROLES.has(loginCandidate.role)) {
      setAuthSubmitState("error");
      setAuthError("Ten operator nie ma uprawnien do systemu kontroli jakosci.");
      return;
    }

    setAuthSubmitState("loading");

    try {
      const session = await operatorLogin(trimmedApiBaseUrl, {
        login: trimmedLogin,
        password: trimmedPassword,
        workstation_id: selectedWorkstationId,
      });
      const operator =
        loginCandidate ??
        operators.find((candidate) => candidate.operator_id === session.operator_id) ??
        null;
      handleSuccessfulLogin({
        session,
        method: "PASSWORD",
        operator,
      });
      setManualPassword("");
      setAuthSubmitState("loaded");
      setAuthMessage("Logowanie operatora zakonczone. Sesja stanowiskowa jest aktywna.");
    } catch (error) {
      setAuthSubmitState("error");
      setAuthError(
        getErrorMessage(error, "Nie udalo sie zalogowac operatora na stanowisku QC."),
      );
    }
  };

  const handleRfidSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedApiBaseUrl = apiBaseUrl.trim();
    const trimmedRfidUidHash = rfidUidHash.trim();

    setAuthError(null);
    setAuthMessage(null);

    if (!trimmedApiBaseUrl) {
      setAuthSubmitState("error");
      setAuthError("Podaj adres API przed logowaniem RFID.");
      return;
    }

    if (!selectedWorkstationId) {
      setAuthSubmitState("error");
      setAuthError("Wybierz stanowisko przed przylozeniem karty RFID.");
      return;
    }

    if (!trimmedRfidUidHash) {
      setAuthSubmitState("error");
      setAuthError("Przyluz karte albo wpisz odczyt RFID.");
      return;
    }

    const operatorCandidate = operators.find(
      (operator) => operator.rfid_uid_hash === trimmedRfidUidHash,
    );
    if (
      operatorCandidate &&
      !QUALITY_ACTION_ALLOWED_ROLES.has(operatorCandidate.role)
    ) {
      setAuthSubmitState("error");
      setAuthError("Karta RFID nalezy do operatora bez dostepu do systemu QC.");
      return;
    }

    setAuthSubmitState("loading");

    try {
      const session = await rfidLogin(trimmedApiBaseUrl, {
        rfid_uid_hash: trimmedRfidUidHash,
        workstation_id: selectedWorkstationId,
      });
      const operator =
        operatorCandidate ??
        operators.find((candidate) => candidate.operator_id === session.operator_id) ??
        null;
      if (operator) {
        setManualLoginName(operator.login_name ?? operator.operator_id);
      }
      setManualPassword("********");
      handleSuccessfulLogin({
        session,
        method: "RFID",
        operator,
      });
      setRfidUidHash("");
      setAuthSubmitState("loaded");
      setAuthMessage("RFID rozpoznane. Pola logowania zostaly wypelnione automatycznie.");
    } catch (error) {
      setAuthSubmitState("error");
      setAuthError(
        getErrorMessage(error, "Nie udalo sie zalogowac przez RFID na stanowisku QC."),
      );
    }
  };

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

  const applyHistoryPreset = (preset: QcRunHistoryPreset) => {
    const nextState = resolveQcRunHistoryPreset(preset);
    setQcRunHistoryFilter(nextState.filter);
    setQcRunHistorySort(nextState.sort);
    setClosedCriticalNcrSort(nextState.closedCriticalNcrSort);
  };

  const applyWaitingItemsPreset = (preset: WaitingItemsPreset) => {
    const nextState = resolveWaitingItemsPreset(preset);
    setWaitingItemsFilter(nextState.filter);
    setWaitingItemsReservationFilter(nextState.reservationFilter);
    setWaitingItemsSort(nextState.sort);
  };

  const handleReleaseForRework = async () => {
    const trimmedApiBaseUrl = apiBaseUrl.trim();
    const normalizedReworkAction = normalizeOptionalString(reworkAction);

    setReworkActionError(null);
    setReworkActionSuccess(null);

    if (!trimmedApiBaseUrl) {
      setReworkActionState("error");
      setReworkActionError("Podaj adres API przed obsluga NCR albo reworku.");
      return;
    }

    if (!authState) {
      setReworkActionState("error");
      setReworkActionError("Najpierw zaloguj operatora na stanowisku.");
      return;
    }

    if (!selectedItem) {
      setReworkActionState("error");
      setReworkActionError("Najpierw wybierz detal do obslugi NCR albo reworku.");
      return;
    }

    if (!normalizedReworkAction) {
      setReworkActionState("error");
      setReworkActionError("Wpisz akcje korygujaca przed przywroceniem detalu do reworku.");
      return;
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
      setOpenCriticalNcrs([]);
      setReworkActionState("loaded");
      setReworkActionSuccess(
        openCriticalNcrs.length > 0
          ? `Zamknieto ${openCriticalNcrs.length} krytyczne NCR i przywrocono detal ${refreshedItem.item_serial_number} do statusu ${refreshedItem.current_status}.`
          : `Detal ${refreshedItem.item_serial_number} zostal przywrocony do statusu ${refreshedItem.current_status}.`,
      );
    } catch (error) {
      setReworkActionState("error");
      setReworkActionError(
        getErrorMessage(error, "Nie udalo sie przygotowac detalu do reworku."),
      );
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

  const handleLogout = () => {
    if (authState) {
      setManualLoginName(authState.operatorLoginName);
    }
    setManualPassword("");
    setRfidUidHash("");
    resetSelectedItemWorkflowState();
    resetHistoryAndNcrState();
    setAuthState(null);
    setAuthMessage("Sesja stanowiskowa zostala wylogowana lokalnie.");
  };

  const handleSuccessfulLogin = ({
    session,
    method,
    operator,
  }: {
    session: {
      work_session_id: string;
      operator_id: string;
      workstation_id: string;
      machine_id: string | null;
    };
    method: LoginMethod;
    operator: OperatorRead | null;
  }) => {
    const workstation =
      activeWorkstations.find(
        (candidate) => candidate.workstation_id === session.workstation_id,
      ) ?? selectedWorkstation;
    const operatorLoginName =
      operator?.login_name ?? operator?.operator_id ?? manualLoginName.trim() ?? session.operator_id;

    setAuthState({
      workSessionId: session.work_session_id,
      operatorId: session.operator_id,
      operatorName: operator?.full_name ?? session.operator_id,
      operatorRole: operator?.role ?? "QUALITY_INSPECTOR",
      operatorLoginName,
      workstationId: session.workstation_id,
      workstationName: workstation?.name ?? session.workstation_id,
      machineId: session.machine_id,
      loginMethod: method,
    });
    setManualLoginName(operatorLoginName);
    setSelectedWorkstationId(session.workstation_id);
    resetSelectedItemWorkflowState();
  };

  return (
    <main className="app-shell qc-station-shell">
      <section className="hero qc-station-hero">
        <div className="hero-copy">
          <p className="eyebrow">System kontroli jakosci</p>
          <h1>Ekran startowy i stanowisko pomiarowe dla kontroli komponentu.</h1>
          <p>
            Operator zaczyna od logowania loginem i haslem albo przez przylozenie
            karty RFID. Po uzyskaniu dostepu system prowadzi przez skan detalu,
            checkliste, pomiar i zapis PASS albo FAIL przed dopuszczeniem czesci do
            dalszych etapow.
          </p>
        </div>
        <div className="control-deck">
          <label className="api-field">
            <span>Adres API</span>
            <input
              value={apiBaseUrl}
              onChange={(event) => setApiBaseUrl(event.target.value)}
              placeholder="http://localhost:8000/api"
            />
          </label>
          <div className="refresh-meta">
            <span>Widok roboczy: start logowania + stanowisko QC</span>
            <span>
              Status kontekstu:{" "}
              {contextState === "loading"
                ? "ladowanie"
                : contextState === "loaded"
                  ? "gotowe"
                  : contextState === "error"
                    ? "blad"
                    : "oczekuje"}
            </span>
          </div>
          <div className="details-inline-actions">
            <a className="ghost-button button-link" href="/">
              Wroc do dashboardu
            </a>
          </div>
        </div>
      </section>

      {contextError ? (
        <section className="error-banner" role="alert">
          <strong>Nie udalo sie zbudowac kontekstu stanowiska.</strong>
          <span>{contextError}</span>
        </section>
      ) : null}

      {authError ? (
        <section className="error-banner" role="alert">
          <strong>Logowanie do systemu QC nie powiodlo sie.</strong>
          <span>{authError}</span>
        </section>
      ) : null}

      {authMessage ? (
        <section className="qc-auth-banner" role="status">
          <strong>{authMessage}</strong>
        </section>
      ) : null}

      {!authState ? (
        <QcStationLoginScreen
          authSubmitState={authSubmitState}
          contextState={contextState}
          activeWorkstations={activeWorkstations}
          selectedWorkstationId={selectedWorkstationId}
          manualLoginName={manualLoginName}
          manualPassword={manualPassword}
          rfidUidHash={rfidUidHash}
          onSelectedWorkstationIdChange={setSelectedWorkstationId}
          onManualLoginNameChange={setManualLoginName}
          onManualPasswordChange={setManualPassword}
          onRfidUidHashChange={setRfidUidHash}
          onManualLoginSubmit={handleManualLoginSubmit}
          onRfidSubmit={handleRfidSubmit}
          formatWorkstationLabel={formatWorkstationLabel}
        />
      ) : (
        <>
          <section className="details-section qc-station-session-card">
            <div className="section-heading">
              <h2>Sesja stanowiskowa</h2>
              <div className="details-inline-actions">
                <span className="status-badge">
                  {authState.loginMethod === "RFID" ? "RFID" : "LOGIN"}
                </span>
                <button className="ghost-button" type="button" onClick={handleLogout}>
                  Wyloguj
                </button>
              </div>
            </div>
            <div className="details-grid qc-station-item-grid">
              <div className="detail-card">
                <span>Operator</span>
                <strong>{authState.operatorName}</strong>
              </div>
              <div className="detail-card">
                <span>Rola</span>
                <strong>{labelForCode(authState.operatorRole)}</strong>
              </div>
              <div className="detail-card">
                <span>Login</span>
                <strong>{authState.operatorLoginName}</strong>
              </div>
              <div className="detail-card">
                <span>Stanowisko</span>
                <strong>{authState.workstationName}</strong>
              </div>
              <div className="detail-card">
                <span>Work session</span>
                <strong>{authState.workSessionId}</strong>
              </div>
            </div>
          </section>

          <section className="qc-station-grid">
            <div className="filters-card">
              <div className="section-heading">
                <h2>1. Kontekst kontroli</h2>
                <span className={`status-badge state-${contextState}`}>
                  {contextState === "loading"
                    ? "Ladowanie"
                    : contextState === "loaded"
                      ? "API OK"
                      : contextState === "error"
                        ? "Blad"
                        : "Oczekuje"}
                </span>
              </div>
              <div className="qc-station-form-grid">
                <label className="field">
                  <span>Checklista</span>
                  <select
                    value={selectedChecklistCode}
                    onChange={(event) => setSelectedChecklistCode(event.target.value)}
                    disabled={activeChecklists.length === 0}
                  >
                    {activeChecklists.length === 0 ? (
                      <option value="">
                        {contextState === "loading"
                          ? "Ladowanie checklist..."
                          : "Brak aktywnej checklisty QC"}
                      </option>
                    ) : (
                      activeChecklists.map((checklist) => (
                        <option
                          key={checklist.checklist_code}
                          value={checklist.checklist_code}
                        >
                          {formatChecklistLabel(checklist)}
                        </option>
                      ))
                    )}
                  </select>
                </label>
              </div>
              <div className="details-inline-actions">
                {selectedChecklist ? (
                  <span className="action-hint">
                    Aktywna checklista: {selectedChecklist.name} ({selectedChecklist.checklist_code})
                  </span>
                ) : null}
              </div>
            </div>

            <QcStationQueuePanel
              authStateOperatorId={authState?.operatorId ?? null}
              barcodeValue={barcodeValue}
              lookupState={lookupState}
              lookupError={lookupError}
              waitingItemsState={waitingItemsState}
              waitingItemsError={waitingItemsError}
              waitingItems={waitingItems}
              filteredWaitingItems={filteredWaitingItems}
              waitingItemsReservationSummary={waitingItemsReservationSummary}
              waitingItemsFilter={waitingItemsFilter}
              waitingItemsReservationFilter={waitingItemsReservationFilter}
              waitingItemsSort={waitingItemsSort}
              selectedItem={selectedItem}
              selectedItemReservedByOtherOperator={selectedItemReservedByOtherOperator}
              selectedItemReservedByCurrentOperator={selectedItemReservedByCurrentOperator}
              reservationState={reservationState}
              reservationError={reservationError}
              reservationSuccess={reservationSuccess}
              shouldShowReworkPanel={shouldShowReworkPanel}
              openCriticalNcrsState={openCriticalNcrsState}
              openCriticalNcrsError={openCriticalNcrsError}
              openCriticalNcrs={openCriticalNcrs}
              canReleaseSelectedItemForRework={canReleaseSelectedItemForRework}
              reworkAction={reworkAction}
              reworkActionState={reworkActionState}
              reworkActionError={reworkActionError}
              reworkActionSuccess={reworkActionSuccess}
              onBarcodeValueChange={setBarcodeValue}
              onLookupSubmit={handleLookupSubmit}
              onResetSelectedItem={resetSelectedItemWorkflowState}
              onApplyWaitingItemsPreset={applyWaitingItemsPreset}
              onWaitingItemsFilterChange={setWaitingItemsFilter}
              onWaitingItemsReservationFilterChange={setWaitingItemsReservationFilter}
              onWaitingItemsSortChange={setWaitingItemsSort}
              onPickWaitingItem={handlePickWaitingItem}
              onReserveSelectedItem={handleReserveSelectedItem}
              onReleaseSelectedItemReservation={handleReleaseSelectedItemReservation}
              onReworkActionChange={setReworkAction}
              onReleaseForRework={handleReleaseForRework}
              isWaitingItemReservedByOtherOperator={isProductionItemReservedByOtherOperator}
              formatWaitingItemReservationLabel={formatWaitingItemReservationLabel}
              historyPanel={
                selectedItem ? (
                  <QcStationHistoryPanel
                    apiBaseUrl={apiBaseUrl}
                    filteredQcRunHistory={filteredQcRunHistory}
                    qcRunHistory={qcRunHistory}
                    qcRunHistoryError={qcRunHistoryError}
                    qcRunHistoryState={qcRunHistoryState}
                    sortedClosedCriticalNcrs={sortedClosedCriticalNcrs}
                    closedCriticalNcrs={closedCriticalNcrs}
                    closedCriticalNcrsError={closedCriticalNcrsError}
                    closedCriticalNcrsState={closedCriticalNcrsState}
                    qcRunHistoryFilter={qcRunHistoryFilter}
                    qcRunHistorySort={qcRunHistorySort}
                    closedCriticalNcrSort={closedCriticalNcrSort}
                    selectedHistoryRunId={selectedHistoryRunId}
                    selectedHistoryRunDetails={selectedHistoryRunDetails}
                    qcRunDetailsState={qcRunDetailsState}
                    qcRunDetailsError={qcRunDetailsError}
                    onApplyHistoryPreset={applyHistoryPreset}
                    onQcRunHistoryFilterChange={setQcRunHistoryFilter}
                    onQcRunHistorySortChange={setQcRunHistorySort}
                    onClosedCriticalNcrSortChange={setClosedCriticalNcrSort}
                    onSelectedHistoryRunIdChange={setSelectedHistoryRunId}
                  />
                ) : null
              }
            />
          </section>

          <QcStationRunPanel
            apiBaseUrl={apiBaseUrl}
            stepsState={stepsState}
            stepsError={stepsError}
            selectedChecklist={selectedChecklist}
            referenceOverlayAreas={referenceOverlayAreas}
            selectedItem={selectedItem}
            predictedRunResult={predictedRunResult}
            failureReason={failureReason}
            failureComment={failureComment}
            failureDisposition={failureDisposition}
            steps={steps}
            stepDrafts={stepDrafts}
            stepPreviews={stepPreviews}
            submitError={submitError}
            submitSuccess={submitSuccess}
            completedRun={completedRun}
            submitState={submitState}
            authStatePresent={!!authState}
            onFailureReasonChange={setFailureReason}
            onFailureDispositionChange={setFailureDisposition}
            onFailureCommentChange={setFailureComment}
            onStepDraftChange={handleStepDraftChange}
            onSubmitRun={handleSubmitRun}
            createDefaultStepDraft={() => createDefaultStepDraft()}
            normalizeStepEvaluationMode={normalizeStepEvaluationMode}
            formatTolerance={formatTolerance}
            failureReasonOptions={QC_FAILURE_REASON_OPTIONS}
            failureDispositionOptions={QC_FAILURE_DISPOSITION_OPTIONS}
          />
        </>
      )}
    </main>
  );
}
