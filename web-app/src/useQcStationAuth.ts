import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { operatorLogin, rfidLogin, type LoadState, type OperatorRead, type WorkstationRead } from "./api";
import {
  findOperatorByLogin,
  getErrorMessage,
  type LoginMethod,
  type QcStationAuthState,
} from "./QcStationShared";

const QUALITY_ACTION_ALLOWED_ROLES = new Set([
  "ADMIN",
  "QUALITY_INSPECTOR",
  "QUALITY_MANAGER",
]);

interface UseQcStationAuthArgs {
  apiBaseUrl: string;
  operators: OperatorRead[];
  authState: QcStationAuthState | null;
  setAuthState: (value: QcStationAuthState | null) => void;
  manualLoginName: string;
  setManualLoginName: (value: string) => void;
  selectedWorkstationId: string;
  setSelectedWorkstationId: (value: string) => void;
  activeWorkstations: WorkstationRead[];
  selectedWorkstation: WorkstationRead | null;
  onResetSelectedItemWorkflowState: () => void;
  onResetHistoryAndNcrState: () => void;
}

export function useQcStationAuth({
  apiBaseUrl,
  operators,
  authState,
  setAuthState,
  manualLoginName,
  setManualLoginName,
  selectedWorkstationId,
  setSelectedWorkstationId,
  activeWorkstations,
  selectedWorkstation,
  onResetSelectedItemWorkflowState,
  onResetHistoryAndNcrState,
}: UseQcStationAuthArgs) {
  const [manualPassword, setManualPassword] = useState("");
  const [rfidUidHash, setRfidUidHash] = useState("");
  const [authSubmitState, setAuthSubmitState] = useState<LoadState>("idle");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

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
  }, [activeWorkstations, authState, operators, setAuthState]);

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
    onResetSelectedItemWorkflowState();
  };

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

  const handleLogout = () => {
    if (authState) {
      setManualLoginName(authState.operatorLoginName);
    }
    setManualPassword("");
    setRfidUidHash("");
    onResetSelectedItemWorkflowState();
    onResetHistoryAndNcrState();
    setAuthState(null);
    setAuthMessage("Sesja stanowiskowa zostala wylogowana lokalnie.");
  };

  return {
    manualPassword,
    setManualPassword,
    rfidUidHash,
    setRfidUidHash,
    authSubmitState,
    authError,
    authMessage,
    setAuthError,
    handleManualLoginSubmit,
    handleRfidSubmit,
    handleLogout,
  };
}
