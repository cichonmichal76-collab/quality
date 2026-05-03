import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import {
  addQcStepResult,
  completeQcRun,
  createQcRun,
  getQcRunDetails,
  getProductionItemByBarcode,
  listQcItemClosedCriticalNcrs,
  listQcItemOpenCriticalNcrs,
  listQcRunsForItem,
  listQcWaitingItems,
  listOperators,
  listQcChecklists,
  listQcChecklistSteps,
  listWorkstations,
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
import type {
  LoadState,
  NonconformityRead,
  OperatorRead,
  ProductionItemRead,
  QcChecklistRead,
  QcRunDetailsRead,
  QcRunRead,
  QcStepRead,
  WorkstationRead,
} from "./api";
import { labelForCode } from "./dashboard";

const API_STORAGE_KEY = "servicetrace.web.apiBaseUrl";
const QC_AUTH_STORAGE_KEY = "servicetrace.web.qcStationAuth";
const QC_CHECKLIST_STORAGE_KEY = "servicetrace.web.qcStationChecklistCode";
const QC_LOGIN_STORAGE_KEY = "servicetrace.web.qcStationLoginName";
const QC_WORKSTATION_STORAGE_KEY = "servicetrace.web.qcStationWorkstationId";
const DEFAULT_API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
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

interface QcStationAuthState {
  workSessionId: string;
  operatorId: string;
  operatorName: string;
  operatorRole: string;
  operatorLoginName: string;
  workstationId: string;
  workstationName: string;
  machineId: string | null;
  loginMethod: LoginMethod;
}

interface StepDraft {
  status: "PASS" | "FAIL";
  measurementValue: string;
  observedValue: string;
  comment: string;
}

type StepDraftMap = Record<string, StepDraft>;

interface StepPreview {
  kind: "success" | "error";
  message: string;
}

type WaitingItemsFilter = "ALL" | "PRODUCED" | "REWORK_REQUIRED";
type WaitingItemsReservationFilter = "ALL" | "UNRESERVED" | "MINE" | "OTHER_RESERVED";
type WaitingItemsSort = "OLDEST" | "NEWEST";
type QcRunHistoryFilter = "ALL" | "FAIL" | "PASS" | "POST_LATEST_REWORK";
type QcRunHistorySort = "NEWEST" | "OLDEST";
type ClosedCriticalNcrSort = "NEWEST" | "OLDEST";

export function QcStationPage() {
  const [apiBaseUrl, setApiBaseUrl] = useState(
    () => localStorage.getItem(API_STORAGE_KEY) ?? DEFAULT_API_BASE_URL,
  );
  const [operators, setOperators] = useState<OperatorRead[]>([]);
  const [workstations, setWorkstations] = useState<WorkstationRead[]>([]);
  const [checklists, setChecklists] = useState<QcChecklistRead[]>([]);
  const [contextState, setContextState] = useState<LoadState>("idle");
  const [contextError, setContextError] = useState<string | null>(null);
  const [authState, setAuthState] = useState<QcStationAuthState | null>(
    () => readStoredAuthState(),
  );
  const [selectedChecklistCode, setSelectedChecklistCode] = useState(
    () => localStorage.getItem(QC_CHECKLIST_STORAGE_KEY) ?? "",
  );
  const [manualLoginName, setManualLoginName] = useState(
    () => localStorage.getItem(QC_LOGIN_STORAGE_KEY) ?? "",
  );
  const [manualPassword, setManualPassword] = useState("");
  const [selectedWorkstationId, setSelectedWorkstationId] = useState(
    () => localStorage.getItem(QC_WORKSTATION_STORAGE_KEY) ?? "",
  );
  const [rfidUidHash, setRfidUidHash] = useState("");
  const [authSubmitState, setAuthSubmitState] = useState<LoadState>("idle");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [barcodeValue, setBarcodeValue] = useState("");
  const [lookupState, setLookupState] = useState<LoadState>("idle");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ProductionItemRead | null>(null);
  const [waitingItemsState, setWaitingItemsState] = useState<LoadState>("idle");
  const [waitingItemsError, setWaitingItemsError] = useState<string | null>(null);
  const [waitingItems, setWaitingItems] = useState<ProductionItemRead[]>([]);
  const [waitingItemsReloadKey, setWaitingItemsReloadKey] = useState(0);
  const [waitingItemsFilter, setWaitingItemsFilter] =
    useState<WaitingItemsFilter>("ALL");
  const [waitingItemsReservationFilter, setWaitingItemsReservationFilter] =
    useState<WaitingItemsReservationFilter>("ALL");
  const [waitingItemsSort, setWaitingItemsSort] =
    useState<WaitingItemsSort>("OLDEST");
  const [reservationState, setReservationState] = useState<LoadState>("idle");
  const [reservationError, setReservationError] = useState<string | null>(null);
  const [reservationSuccess, setReservationSuccess] = useState<string | null>(null);
  const [openCriticalNcrsState, setOpenCriticalNcrsState] = useState<LoadState>("idle");
  const [openCriticalNcrsError, setOpenCriticalNcrsError] = useState<string | null>(null);
  const [openCriticalNcrs, setOpenCriticalNcrs] = useState<NonconformityRead[]>([]);
  const [closedCriticalNcrsState, setClosedCriticalNcrsState] = useState<LoadState>("idle");
  const [closedCriticalNcrsError, setClosedCriticalNcrsError] = useState<string | null>(null);
  const [closedCriticalNcrs, setClosedCriticalNcrs] = useState<NonconformityRead[]>([]);
  const [qcRunHistoryState, setQcRunHistoryState] = useState<LoadState>("idle");
  const [qcRunHistoryError, setQcRunHistoryError] = useState<string | null>(null);
  const [qcRunHistory, setQcRunHistory] = useState<QcRunRead[]>([]);
  const [selectedHistoryRunId, setSelectedHistoryRunId] = useState<string | null>(null);
  const [selectedHistoryRunDetails, setSelectedHistoryRunDetails] =
    useState<QcRunDetailsRead | null>(null);
  const [qcRunDetailsState, setQcRunDetailsState] = useState<LoadState>("idle");
  const [qcRunDetailsError, setQcRunDetailsError] = useState<string | null>(null);
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
  const [stepsState, setStepsState] = useState<LoadState>("idle");
  const [stepsError, setStepsError] = useState<string | null>(null);
  const [steps, setSteps] = useState<QcStepRead[]>([]);
  const [stepDrafts, setStepDrafts] = useState<StepDraftMap>({});
  const [failureReason, setFailureReason] = useState("");
  const [failureComment, setFailureComment] = useState("");
  const [failureDisposition, setFailureDisposition] = useState<
    "OPEN_CRITICAL_NCR" | "REWORK_REQUIRED" | "BLOCKED"
  >("OPEN_CRITICAL_NCR");
  const [submitState, setSubmitState] = useState<LoadState>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [completedRun, setCompletedRun] = useState<QcRunRead | null>(null);

  const activeWorkstations = workstations
    .filter((workstation) => workstation.is_active)
    .sort((left, right) =>
      `${left.area ?? ""}:${left.name}:${left.workstation_id}`.localeCompare(
        `${right.area ?? ""}:${right.name}:${right.workstation_id}`,
        "pl",
      ),
    );
  const activeChecklists = checklists
    .filter((checklist) => checklist.is_active && !checklist.skip_component_qc)
    .sort((left, right) =>
      `${left.process_stage}:${left.name}:${left.version}`.localeCompare(
        `${right.process_stage}:${right.name}:${right.version}`,
        "pl",
      ),
    );
  const selectedChecklist =
    activeChecklists.find(
      (checklist) => checklist.checklist_code === selectedChecklistCode,
    ) ?? null;
  const selectedWorkstation =
    activeWorkstations.find(
      (workstation) => workstation.workstation_id === selectedWorkstationId,
    ) ?? null;
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

  useEffect(() => {
    localStorage.setItem(API_STORAGE_KEY, apiBaseUrl);
  }, [apiBaseUrl]);

  useEffect(() => {
    if (selectedChecklistCode) {
      localStorage.setItem(QC_CHECKLIST_STORAGE_KEY, selectedChecklistCode);
      return;
    }

    localStorage.removeItem(QC_CHECKLIST_STORAGE_KEY);
  }, [selectedChecklistCode]);

  useEffect(() => {
    if (manualLoginName.trim()) {
      localStorage.setItem(QC_LOGIN_STORAGE_KEY, manualLoginName.trim());
      return;
    }

    localStorage.removeItem(QC_LOGIN_STORAGE_KEY);
  }, [manualLoginName]);

  useEffect(() => {
    if (selectedWorkstationId) {
      localStorage.setItem(QC_WORKSTATION_STORAGE_KEY, selectedWorkstationId);
      return;
    }

    localStorage.removeItem(QC_WORKSTATION_STORAGE_KEY);
  }, [selectedWorkstationId]);

  useEffect(() => {
    if (authState) {
      localStorage.setItem(QC_AUTH_STORAGE_KEY, JSON.stringify(authState));
      return;
    }

    localStorage.removeItem(QC_AUTH_STORAGE_KEY);
  }, [authState]);

  useEffect(() => {
    const trimmedApiBaseUrl = apiBaseUrl.trim();
    if (!trimmedApiBaseUrl) {
      setContextState("idle");
      setContextError("Podaj adres API, aby zaladowac stanowiska, operatorow i checklisty.");
      setOperators([]);
      setWorkstations([]);
      setChecklists([]);
      return;
    }

    const controller = new AbortController();
    let isCurrentRequest = true;
    setContextState("loading");
    setContextError(null);

    Promise.all([
      listOperators(trimmedApiBaseUrl, controller.signal),
      listWorkstations(trimmedApiBaseUrl, controller.signal),
      listQcChecklists(trimmedApiBaseUrl, controller.signal),
    ])
      .then(([operatorRows, workstationRows, checklistRows]) => {
        if (!isCurrentRequest) {
          return;
        }

        setOperators(operatorRows);
        setWorkstations(workstationRows);
        setChecklists(checklistRows);
        setContextState("loaded");
      })
      .catch((error: unknown) => {
        if (!isCurrentRequest || controller.signal.aborted) {
          return;
        }

        setContextState("error");
        setContextError(
          getErrorMessage(error, "Nie udalo sie zaladowac kontekstu stanowiska QC."),
        );
        setOperators([]);
        setWorkstations([]);
        setChecklists([]);
      });

    return () => {
      isCurrentRequest = false;
      controller.abort();
    };
  }, [apiBaseUrl]);

  useEffect(() => {
    if (activeWorkstations.length === 0) {
      if (selectedWorkstationId !== "") {
        setSelectedWorkstationId("");
      }
      return;
    }

    const hasSelectedWorkstation = activeWorkstations.some(
      (workstation) => workstation.workstation_id === selectedWorkstationId,
    );
    if (!hasSelectedWorkstation) {
      setSelectedWorkstationId(activeWorkstations[0].workstation_id);
    }
  }, [activeWorkstations, selectedWorkstationId]);

  useEffect(() => {
    if (activeChecklists.length === 0) {
      if (selectedChecklistCode !== "") {
        setSelectedChecklistCode("");
      }
      return;
    }

    const hasSelectedChecklist = activeChecklists.some(
      (checklist) => checklist.checklist_code === selectedChecklistCode,
    );
    if (!hasSelectedChecklist) {
      setSelectedChecklistCode(activeChecklists[0].checklist_code);
    }
  }, [activeChecklists, selectedChecklistCode]);

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
    const trimmedApiBaseUrl = apiBaseUrl.trim();
    if (!trimmedApiBaseUrl || !selectedChecklistCode || !authState) {
      setSteps([]);
      setStepDrafts({});
      setStepsState("idle");
      setStepsError(null);
      return;
    }

    const controller = new AbortController();
    let isCurrentRequest = true;
    setStepsState("loading");
    setStepsError(null);

    listQcChecklistSteps(trimmedApiBaseUrl, selectedChecklistCode, controller.signal)
      .then((stepRows) => {
        if (!isCurrentRequest) {
          return;
        }

        setSteps(stepRows);
        setStepDrafts(buildInitialStepDrafts(stepRows));
        setStepsState("loaded");
      })
      .catch((error: unknown) => {
        if (!isCurrentRequest || controller.signal.aborted) {
          return;
        }

        setSteps([]);
        setStepDrafts({});
        setStepsState("error");
        setStepsError(
          getErrorMessage(error, "Nie udalo sie zaladowac krokow checklisty."),
        );
      });

    return () => {
      isCurrentRequest = false;
      controller.abort();
    };
  }, [apiBaseUrl, authState, selectedChecklistCode]);

  useEffect(() => {
    const trimmedApiBaseUrl = apiBaseUrl.trim();
    if (!trimmedApiBaseUrl || !authState) {
      setWaitingItems([]);
      setWaitingItemsState("idle");
      setWaitingItemsError(null);
      return;
    }

    const controller = new AbortController();
    let isCurrentRequest = true;
    setWaitingItemsState("loading");
    setWaitingItemsError(null);

    listQcWaitingItems(
      trimmedApiBaseUrl,
      {
        limit: 25,
      },
      controller.signal,
    )
      .then((items) => {
        if (!isCurrentRequest) {
          return;
        }

        setWaitingItems(items);
        setWaitingItemsState("loaded");
      })
      .catch((error: unknown) => {
        if (!isCurrentRequest || controller.signal.aborted) {
          return;
        }

        setWaitingItems([]);
        setWaitingItemsState("error");
        setWaitingItemsError(
          getErrorMessage(error, "Nie udalo sie pobrac kolejki komponentow oczekujacych na QC."),
        );
      });

    return () => {
      isCurrentRequest = false;
      controller.abort();
    };
  }, [apiBaseUrl, authState, waitingItemsReloadKey]);

  useEffect(() => {
    const trimmedApiBaseUrl = apiBaseUrl.trim();
    if (!trimmedApiBaseUrl || !authState || !selectedItem) {
      setOpenCriticalNcrs([]);
      setOpenCriticalNcrsState("idle");
      setOpenCriticalNcrsError(null);
      return;
    }

    const controller = new AbortController();
    let isCurrentRequest = true;
    setOpenCriticalNcrsState("loading");
    setOpenCriticalNcrsError(null);

    listQcItemOpenCriticalNcrs(
      trimmedApiBaseUrl,
      selectedItem.item_serial_number,
      controller.signal,
    )
      .then((rows) => {
        if (!isCurrentRequest) {
          return;
        }

        setOpenCriticalNcrs(rows);
        setOpenCriticalNcrsState("loaded");
      })
      .catch((error: unknown) => {
        if (!isCurrentRequest || controller.signal.aborted) {
          return;
        }

        setOpenCriticalNcrs([]);
        setOpenCriticalNcrsState("error");
        setOpenCriticalNcrsError(
          getErrorMessage(error, "Nie udalo sie pobrac otwartych NCR dla detalu."),
        );
      });

    return () => {
      isCurrentRequest = false;
      controller.abort();
    };
  }, [apiBaseUrl, authState, selectedItem]);

  useEffect(() => {
    const trimmedApiBaseUrl = apiBaseUrl.trim();
    if (!trimmedApiBaseUrl || !authState || !selectedItem) {
      setClosedCriticalNcrs([]);
      setClosedCriticalNcrsState("idle");
      setClosedCriticalNcrsError(null);
      setQcRunHistory([]);
      setQcRunHistoryState("idle");
      setQcRunHistoryError(null);
      setSelectedHistoryRunId(null);
      return;
    }

    const controller = new AbortController();
    let isCurrentRequest = true;
    setClosedCriticalNcrsState("loading");
    setClosedCriticalNcrsError(null);
    setQcRunHistoryState("loading");
    setQcRunHistoryError(null);

    Promise.all([
      listQcItemClosedCriticalNcrs(
        trimmedApiBaseUrl,
        selectedItem.item_serial_number,
        10,
        controller.signal,
      ),
      listQcRunsForItem(
        trimmedApiBaseUrl,
        selectedItem.item_serial_number,
        10,
        controller.signal,
      ),
    ])
      .then(([closedNcrRows, qcRunRows]) => {
        if (!isCurrentRequest) {
          return;
        }

        setClosedCriticalNcrs(closedNcrRows);
        setClosedCriticalNcrsState("loaded");
        setQcRunHistory(qcRunRows);
        setQcRunHistoryState("loaded");
      })
      .catch((error: unknown) => {
        if (!isCurrentRequest || controller.signal.aborted) {
          return;
        }

        const message = getErrorMessage(
          error,
          "Nie udalo sie pobrac historii kontroli albo zamknietych NCR dla detalu.",
        );
        setClosedCriticalNcrs([]);
        setClosedCriticalNcrsState("error");
        setClosedCriticalNcrsError(message);
        setQcRunHistory([]);
        setQcRunHistoryState("error");
        setQcRunHistoryError(message);
      });

    return () => {
      isCurrentRequest = false;
      controller.abort();
    };
  }, [apiBaseUrl, authState, selectedItem]);

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
    const trimmedApiBaseUrl = apiBaseUrl.trim();
    if (!trimmedApiBaseUrl || !authState || !selectedItem || !selectedHistoryRunId) {
      setSelectedHistoryRunDetails(null);
      setQcRunDetailsState("idle");
      setQcRunDetailsError(null);
      return;
    }

    const controller = new AbortController();
    let isCurrentRequest = true;
    setQcRunDetailsState("loading");
    setQcRunDetailsError(null);

    getQcRunDetails(trimmedApiBaseUrl, selectedHistoryRunId, controller.signal)
      .then((details) => {
        if (!isCurrentRequest) {
          return;
        }

        setSelectedHistoryRunDetails(details);
        setQcRunDetailsState("loaded");
      })
      .catch((error: unknown) => {
        if (!isCurrentRequest || controller.signal.aborted) {
          return;
        }

        setSelectedHistoryRunDetails(null);
        setQcRunDetailsState("error");
        setQcRunDetailsError(
          getErrorMessage(error, "Nie udalo sie pobrac szczegolow wybranego runu QC."),
        );
      });

    return () => {
      isCurrentRequest = false;
      controller.abort();
    };
  }, [apiBaseUrl, authState, selectedItem, selectedHistoryRunId]);

  useEffect(() => {
    setLookupError(null);
    setSubmitState("idle");
    setSubmitError(null);
    setSubmitSuccess(null);
    setCompletedRun(null);
    setFailureReason("");
    setFailureComment("");
    setFailureDisposition("OPEN_CRITICAL_NCR");
    setOpenCriticalNcrs([]);
    setOpenCriticalNcrsState("idle");
    setOpenCriticalNcrsError(null);
    setClosedCriticalNcrs([]);
    setClosedCriticalNcrsState("idle");
    setClosedCriticalNcrsError(null);
    setQcRunHistory([]);
    setQcRunHistoryState("idle");
    setQcRunHistoryError(null);
    setSelectedHistoryRunId(null);
    setSelectedHistoryRunDetails(null);
    setQcRunDetailsState("idle");
    setQcRunDetailsError(null);
    setReworkAction("");
    setReworkActionState("idle");
    setReworkActionError(null);
    setReworkActionSuccess(null);
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
    setSubmitState("idle");
    setSubmitError(null);
    setSubmitSuccess(null);
    setCompletedRun(null);
    setFailureReason("");
    setFailureComment("");
    setFailureDisposition("OPEN_CRITICAL_NCR");
    setReworkAction("");
    setReworkActionState("idle");
    setReworkActionError(null);
    setReworkActionSuccess(null);
    setReservationState("idle");
    setReservationError(null);
    setReservationSuccess(null);
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
      setWaitingItemsReloadKey((currentValue) => currentValue + 1);
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
      setWaitingItemsReloadKey((currentValue) => currentValue + 1);
      setReservationState("loaded");
      setReservationSuccess(`Zwolniono rezerwacje detalu ${releasedItem.item_serial_number}.`);
    } catch (error) {
      setReservationState("error");
      setReservationError(
        getErrorMessage(error, "Nie udalo sie zwolnic rezerwacji detalu."),
      );
    }
  };

  const applyHistoryPreset = (preset: "LATEST_FAIL" | "LATEST_PASS" | "POST_LATEST_REWORK" | "RESET") => {
    if (preset === "LATEST_FAIL") {
      setQcRunHistoryFilter("FAIL");
      setQcRunHistorySort("NEWEST");
      return;
    }
    if (preset === "LATEST_PASS") {
      setQcRunHistoryFilter("PASS");
      setQcRunHistorySort("NEWEST");
      return;
    }
    if (preset === "POST_LATEST_REWORK") {
      setQcRunHistoryFilter("POST_LATEST_REWORK");
      setQcRunHistorySort("NEWEST");
      setClosedCriticalNcrSort("NEWEST");
      return;
    }
    setQcRunHistoryFilter("ALL");
    setQcRunHistorySort("NEWEST");
    setClosedCriticalNcrSort("NEWEST");
  };

  const applyWaitingItemsPreset = (
    preset:
      | "PRODUCED"
      | "REWORK_REQUIRED"
      | "UNRESERVED"
      | "MINE"
      | "OTHER_RESERVED"
      | "RESET",
  ) => {
    if (preset === "PRODUCED") {
      setWaitingItemsFilter("PRODUCED");
      setWaitingItemsReservationFilter("ALL");
      setWaitingItemsSort("OLDEST");
      return;
    }

    if (preset === "REWORK_REQUIRED") {
      setWaitingItemsFilter("REWORK_REQUIRED");
      setWaitingItemsReservationFilter("ALL");
      setWaitingItemsSort("OLDEST");
      return;
    }

    if (preset === "UNRESERVED") {
      setWaitingItemsFilter("ALL");
      setWaitingItemsReservationFilter("UNRESERVED");
      setWaitingItemsSort("OLDEST");
      return;
    }

    if (preset === "MINE") {
      setWaitingItemsFilter("ALL");
      setWaitingItemsReservationFilter("MINE");
      setWaitingItemsSort("OLDEST");
      return;
    }

    if (preset === "OTHER_RESERVED") {
      setWaitingItemsFilter("ALL");
      setWaitingItemsReservationFilter("OTHER_RESERVED");
      setWaitingItemsSort("OLDEST");
      return;
    }

    setWaitingItemsFilter("ALL");
    setWaitingItemsReservationFilter("ALL");
    setWaitingItemsSort("OLDEST");
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
      setWaitingItemsReloadKey((currentValue) => currentValue + 1);
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
      setWaitingItemsReloadKey((currentValue) => currentValue + 1);

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
      setWaitingItemsReloadKey((currentValue) => currentValue + 1);
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
    setBarcodeValue("");
    setRfidUidHash("");
    setFailureReason("");
    setFailureComment("");
    setFailureDisposition("OPEN_CRITICAL_NCR");
    setReworkAction("");
    setReworkActionState("idle");
    setReworkActionError(null);
    setReworkActionSuccess(null);
    setLookupState("idle");
    setLookupError(null);
    setSelectedItem(null);
    setWaitingItems([]);
    setWaitingItemsState("idle");
    setWaitingItemsError(null);
    setReservationState("idle");
    setReservationError(null);
    setReservationSuccess(null);
    setSubmitState("idle");
    setSubmitError(null);
    setSubmitSuccess(null);
    setCompletedRun(null);
    setReworkAction("");
    setReworkActionState("idle");
    setReworkActionError(null);
    setReworkActionSuccess(null);
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
    setLookupState("idle");
    setLookupError(null);
    setSelectedItem(null);
    setBarcodeValue("");
    setSubmitState("idle");
    setSubmitError(null);
    setSubmitSuccess(null);
    setCompletedRun(null);
    setReworkAction("");
    setReworkActionState("idle");
    setReworkActionError(null);
    setReworkActionSuccess(null);
    setReservationState("idle");
    setReservationError(null);
    setReservationSuccess(null);
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
              onResetSelectedItem={() => {
                setSelectedItem(null);
                setLookupState("idle");
                setLookupError(null);
                setSubmitError(null);
                setSubmitSuccess(null);
                setCompletedRun(null);
                setFailureReason("");
                setFailureComment("");
                setFailureDisposition("OPEN_CRITICAL_NCR");
                setReworkAction("");
                setReworkActionState("idle");
                setReworkActionError(null);
                setReworkActionSuccess(null);
                setReservationState("idle");
                setReservationError(null);
                setReservationSuccess(null);
                setBarcodeValue("");
              }}
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

function buildInitialStepDrafts(steps: QcStepRead[]): StepDraftMap {
  return Object.fromEntries(
    steps.map((step) => [step.id, createDefaultStepDraft(step.requires_measurement)]),
  );
}

function createDefaultStepDraft(_requiresMeasurement = false): StepDraft {
  return {
    status: "PASS",
    measurementValue: "",
    observedValue: "",
    comment: "",
  };
}

function prepareStepPayload(
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

function buildStepPreviews(
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

    if (
      step.tolerance_min !== null &&
      measurementValue < Number(step.tolerance_min)
    ) {
      previews[step.id] = {
        kind: "error",
        message: `Poza tolerancja: ${measurementValue} < ${step.tolerance_min}.`,
      };
      continue;
    }

    if (
      step.tolerance_max !== null &&
      measurementValue > Number(step.tolerance_max)
    ) {
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

function deriveDraftRunResult(
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

function resolveChecklistCodeForItem(
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

function formatChecklistLabel(checklist: QcChecklistRead): string {
  return `${checklist.name} - ${labelForCode(checklist.process_stage)} - v${checklist.version}`;
}

function formatWorkstationLabel(workstation: WorkstationRead): string {
  const area = workstation.area ? `${workstation.area} - ` : "";
  return `${area}${workstation.name} (${workstation.workstation_id})`;
}

function formatTolerance(step: QcStepRead): string {
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

function normalizeStepEvaluationMode(step: QcStepRead): "MANUAL" | "NUMERIC_RANGE" | "TEXT_MATCH" {
  const normalizedMode = step.evaluation_mode?.toUpperCase();
  if (normalizedMode === "NUMERIC_RANGE" || normalizedMode === "TEXT_MATCH") {
    return normalizedMode;
  }
  return step.requires_measurement ? "NUMERIC_RANGE" : "MANUAL";
}

function buildStationOverlayAreas(steps: QcStepRead[]) {
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

function parseOptionalMeasurementValue(value: string): number | null {
  const normalizedValue = value.trim().replace(",", ".");
  if (!normalizedValue) {
    return null;
  }

  const measurementValue = Number(normalizedValue);
  return Number.isFinite(measurementValue) ? measurementValue : null;
}

function normalizeOptionalString(value: string): string | null {
  const normalizedValue = value.trim();
  return normalizedValue === "" ? null : normalizedValue;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

function filterAndSortQcRunHistory(
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

function filterAndSortWaitingItems(
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

function summarizeWaitingItemsReservations(
  items: ProductionItemRead[],
  operatorId: string | null,
): {
  all: number;
  unreserved: number;
  mine: number;
  otherReserved: number;
} {
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

function isProductionItemReservedByOtherOperator(
  item: ProductionItemRead,
  operatorId: string,
): boolean {
  return !!item.qc_reserved_by_operator_id && item.qc_reserved_by_operator_id !== operatorId;
}

function formatWaitingItemReservationLabel(item: ProductionItemRead): string {
  const operatorLabel = item.qc_reserved_by_operator_id ?? "nieznany operator";
  if (item.qc_reserved_by_workstation_id) {
    return `${operatorLabel} @ ${item.qc_reserved_by_workstation_id}`;
  }
  return operatorLabel;
}

function buildReservedByOtherOperatorMessage(item: ProductionItemRead): string {
  return `Komponent jest zarezerwowany przez operatora ${formatWaitingItemReservationLabel(item)}.`;
}

function getLatestClosedCriticalNcrTimestamp(
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

function sortClosedCriticalNcrs(
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

function createClientQcRunId(): string {
  return `QC-WEB-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function findOperatorByLogin(
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

function readStoredAuthState(): QcStationAuthState | null {
  const rawValue = localStorage.getItem(QC_AUTH_STORAGE_KEY);
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
