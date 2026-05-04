import { useEffect, useMemo, useState } from "react";

import {
  listOperators,
  listQcChecklists,
  listWorkstations,
  type LoadState,
  type OperatorRead,
  type QcChecklistRead,
  type WorkstationRead,
} from "./api";
import { getErrorMessage, readStoredAuthState, type QcStationAuthState } from "./QcStationShared";

const API_STORAGE_KEY = "servicetrace.web.apiBaseUrl";
const QC_AUTH_STORAGE_KEY = "servicetrace.web.qcStationAuth";
const QC_CHECKLIST_STORAGE_KEY = "servicetrace.web.qcStationChecklistCode";
const QC_LOGIN_STORAGE_KEY = "servicetrace.web.qcStationLoginName";
const QC_WORKSTATION_STORAGE_KEY = "servicetrace.web.qcStationWorkstationId";
const DEFAULT_API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

export function useQcStationContext() {
  const [apiBaseUrl, setApiBaseUrl] = useState(
    () => localStorage.getItem(API_STORAGE_KEY) ?? DEFAULT_API_BASE_URL,
  );
  const [operators, setOperators] = useState<OperatorRead[]>([]);
  const [workstations, setWorkstations] = useState<WorkstationRead[]>([]);
  const [checklists, setChecklists] = useState<QcChecklistRead[]>([]);
  const [contextState, setContextState] = useState<LoadState>("idle");
  const [contextError, setContextError] = useState<string | null>(null);
  const [authState, setAuthState] = useState<QcStationAuthState | null>(
    () => readStoredAuthState(QC_AUTH_STORAGE_KEY),
  );
  const [selectedChecklistCode, setSelectedChecklistCode] = useState(
    () => localStorage.getItem(QC_CHECKLIST_STORAGE_KEY) ?? "",
  );
  const [manualLoginName, setManualLoginName] = useState(
    () => localStorage.getItem(QC_LOGIN_STORAGE_KEY) ?? "",
  );
  const [selectedWorkstationId, setSelectedWorkstationId] = useState(
    () => localStorage.getItem(QC_WORKSTATION_STORAGE_KEY) ?? "",
  );

  const activeWorkstations = useMemo(
    () =>
      workstations
        .filter((workstation) => workstation.is_active)
        .sort((left, right) =>
          `${left.area ?? ""}:${left.name}:${left.workstation_id}`.localeCompare(
            `${right.area ?? ""}:${right.name}:${right.workstation_id}`,
            "pl",
          ),
        ),
    [workstations],
  );

  const activeChecklists = useMemo(
    () =>
      checklists
        .filter((checklist) => checklist.is_active && !checklist.skip_component_qc)
        .sort((left, right) =>
          `${left.process_stage}:${left.name}:${left.version}`.localeCompare(
            `${right.process_stage}:${right.name}:${right.version}`,
            "pl",
          ),
        ),
    [checklists],
  );

  const selectedChecklist = useMemo(
    () =>
      activeChecklists.find((checklist) => checklist.checklist_code === selectedChecklistCode) ??
      null,
    [activeChecklists, selectedChecklistCode],
  );

  const selectedWorkstation = useMemo(
    () =>
      activeWorkstations.find(
        (workstation) => workstation.workstation_id === selectedWorkstationId,
      ) ?? null,
    [activeWorkstations, selectedWorkstationId],
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

  return {
    apiBaseUrl,
    setApiBaseUrl,
    operators,
    workstations,
    checklists,
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
  };
}
