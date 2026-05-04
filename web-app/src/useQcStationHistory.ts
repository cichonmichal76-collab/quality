import { useEffect, useState } from "react";

import {
  getQcRunDetails,
  listQcItemClosedCriticalNcrs,
  listQcItemOpenCriticalNcrs,
  listQcRunsForItem,
  type LoadState,
  type NonconformityRead,
  type QcRunDetailsRead,
  type QcRunRead,
} from "./api";
import { getErrorMessage } from "./QcStationShared";

export function useQcStationHistory(
  apiBaseUrl: string,
  enabled: boolean,
  selectedItemSerialNumber: string | null,
  selectedItemStatus: string | null,
) {
  const [openCriticalNcrsState, setOpenCriticalNcrsState] = useState<LoadState>("idle");
  const [openCriticalNcrsError, setOpenCriticalNcrsError] = useState<string | null>(null);
  const [openCriticalNcrs, setOpenCriticalNcrs] = useState<NonconformityRead[]>([]);
  const [closedCriticalNcrsState, setClosedCriticalNcrsState] =
    useState<LoadState>("idle");
  const [closedCriticalNcrsError, setClosedCriticalNcrsError] = useState<string | null>(
    null,
  );
  const [closedCriticalNcrs, setClosedCriticalNcrs] = useState<NonconformityRead[]>([]);
  const [qcRunHistoryState, setQcRunHistoryState] = useState<LoadState>("idle");
  const [qcRunHistoryError, setQcRunHistoryError] = useState<string | null>(null);
  const [qcRunHistory, setQcRunHistory] = useState<QcRunRead[]>([]);
  const [selectedHistoryRunId, setSelectedHistoryRunId] = useState<string | null>(null);
  const [selectedHistoryRunDetails, setSelectedHistoryRunDetails] =
    useState<QcRunDetailsRead | null>(null);
  const [qcRunDetailsState, setQcRunDetailsState] = useState<LoadState>("idle");
  const [qcRunDetailsError, setQcRunDetailsError] = useState<string | null>(null);

  const resetHistoryState = () => {
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
  };

  useEffect(() => {
    const trimmedApiBaseUrl = apiBaseUrl.trim();
    if (!trimmedApiBaseUrl || !enabled || !selectedItemSerialNumber) {
      setOpenCriticalNcrs([]);
      setOpenCriticalNcrsState("idle");
      setOpenCriticalNcrsError(null);
      return;
    }

    const controller = new AbortController();
    let isCurrentRequest = true;
    setOpenCriticalNcrsState("loading");
    setOpenCriticalNcrsError(null);

    listQcItemOpenCriticalNcrs(trimmedApiBaseUrl, selectedItemSerialNumber, controller.signal)
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
  }, [apiBaseUrl, enabled, selectedItemSerialNumber, selectedItemStatus]);

  useEffect(() => {
    const trimmedApiBaseUrl = apiBaseUrl.trim();
    if (!trimmedApiBaseUrl || !enabled || !selectedItemSerialNumber) {
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
        selectedItemSerialNumber,
        10,
        controller.signal,
      ),
      listQcRunsForItem(trimmedApiBaseUrl, selectedItemSerialNumber, 10, controller.signal),
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
  }, [apiBaseUrl, enabled, selectedItemSerialNumber, selectedItemStatus]);

  useEffect(() => {
    if (qcRunHistory.length === 0) {
      if (selectedHistoryRunId !== null) {
        setSelectedHistoryRunId(null);
      }
      return;
    }

    const hasSelectedRun = qcRunHistory.some((run) => run.run_id === selectedHistoryRunId);
    if (!hasSelectedRun) {
      setSelectedHistoryRunId(qcRunHistory[0]?.run_id ?? null);
    }
  }, [qcRunHistory, selectedHistoryRunId]);

  useEffect(() => {
    const trimmedApiBaseUrl = apiBaseUrl.trim();
    if (!trimmedApiBaseUrl || !enabled || !selectedItemSerialNumber || !selectedHistoryRunId) {
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
  }, [apiBaseUrl, enabled, selectedHistoryRunId, selectedItemSerialNumber]);

  return {
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
  };
}
