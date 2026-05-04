import { useEffect, useState } from "react";

import type { NonconformityRead, ProductionItemRead, QcRunRead } from "./api";
import {
  filterAndSortQcRunHistory,
  filterAndSortWaitingItems,
  resolveQcRunHistoryPreset,
  resolveWaitingItemsPreset,
  sortClosedCriticalNcrs,
  summarizeWaitingItemsReservations,
  type ClosedCriticalNcrSort,
  type QcRunHistoryFilter,
  type QcRunHistoryPreset,
  type QcRunHistorySort,
  type WaitingItemsFilter,
  type WaitingItemsPreset,
  type WaitingItemsReservationFilter,
  type WaitingItemsSort,
} from "./QcStationShared";

interface UseQcStationUiStateArgs {
  waitingItems: ProductionItemRead[];
  qcRunHistory: QcRunRead[];
  closedCriticalNcrs: NonconformityRead[];
  authOperatorId: string | null;
  selectedHistoryRunId: string | null;
  setSelectedHistoryRunId: (value: string | null) => void;
}

export function useQcStationUiState({
  waitingItems,
  qcRunHistory,
  closedCriticalNcrs,
  authOperatorId,
  selectedHistoryRunId,
  setSelectedHistoryRunId,
}: UseQcStationUiStateArgs) {
  const [waitingItemsFilter, setWaitingItemsFilter] =
    useState<WaitingItemsFilter>("ALL");
  const [waitingItemsReservationFilter, setWaitingItemsReservationFilter] =
    useState<WaitingItemsReservationFilter>("ALL");
  const [waitingItemsSort, setWaitingItemsSort] =
    useState<WaitingItemsSort>("OLDEST");
  const [qcRunHistoryFilter, setQcRunHistoryFilter] =
    useState<QcRunHistoryFilter>("ALL");
  const [qcRunHistorySort, setQcRunHistorySort] =
    useState<QcRunHistorySort>("NEWEST");
  const [closedCriticalNcrSort, setClosedCriticalNcrSort] =
    useState<ClosedCriticalNcrSort>("NEWEST");

  const filteredWaitingItems = filterAndSortWaitingItems(
    waitingItems,
    waitingItemsFilter,
    waitingItemsReservationFilter,
    waitingItemsSort,
    authOperatorId,
  );
  const waitingItemsReservationSummary = summarizeWaitingItemsReservations(
    waitingItems,
    authOperatorId,
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
  }, [filteredQcRunHistory, selectedHistoryRunId, setSelectedHistoryRunId]);

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

  return {
    waitingItemsFilter,
    setWaitingItemsFilter,
    waitingItemsReservationFilter,
    setWaitingItemsReservationFilter,
    waitingItemsSort,
    setWaitingItemsSort,
    qcRunHistoryFilter,
    setQcRunHistoryFilter,
    qcRunHistorySort,
    setQcRunHistorySort,
    closedCriticalNcrSort,
    setClosedCriticalNcrSort,
    filteredWaitingItems,
    waitingItemsReservationSummary,
    filteredQcRunHistory,
    sortedClosedCriticalNcrs,
    applyHistoryPreset,
    applyWaitingItemsPreset,
  };
}
