import { useCallback, useEffect, useState } from "react";

import { listQcWaitingItems, type LoadState, type ProductionItemRead } from "./api";
import { getErrorMessage } from "./QcStationShared";

export function useQcStationWaitingItems(apiBaseUrl: string, enabled: boolean) {
  const [waitingItemsState, setWaitingItemsState] = useState<LoadState>("idle");
  const [waitingItemsError, setWaitingItemsError] = useState<string | null>(null);
  const [waitingItems, setWaitingItems] = useState<ProductionItemRead[]>([]);
  const [waitingItemsReloadKey, setWaitingItemsReloadKey] = useState(0);

  useEffect(() => {
    const trimmedApiBaseUrl = apiBaseUrl.trim();
    if (!trimmedApiBaseUrl || !enabled) {
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
  }, [apiBaseUrl, enabled, waitingItemsReloadKey]);

  const reloadWaitingItems = useCallback(() => {
    setWaitingItemsReloadKey((currentValue) => currentValue + 1);
  }, []);

  return {
    waitingItemsState,
    waitingItemsError,
    waitingItems,
    reloadWaitingItems,
  };
}
