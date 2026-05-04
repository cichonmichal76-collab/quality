import { useEffect, useState } from "react";

import { listQcChecklistSteps, type LoadState, type QcStepRead } from "./api";
import { buildInitialStepDrafts, getErrorMessage, type StepDraftMap } from "./QcStationShared";

export function useQcStationChecklistSteps(
  apiBaseUrl: string,
  selectedChecklistCode: string,
  enabled: boolean,
) {
  const [stepsState, setStepsState] = useState<LoadState>("idle");
  const [stepsError, setStepsError] = useState<string | null>(null);
  const [steps, setSteps] = useState<QcStepRead[]>([]);
  const [stepDrafts, setStepDrafts] = useState<StepDraftMap>({});

  useEffect(() => {
    const trimmedApiBaseUrl = apiBaseUrl.trim();
    if (!trimmedApiBaseUrl || !selectedChecklistCode || !enabled) {
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
        setStepsError(getErrorMessage(error, "Nie udalo sie zaladowac krokow checklisty."));
      });

    return () => {
      isCurrentRequest = false;
      controller.abort();
    };
  }, [apiBaseUrl, enabled, selectedChecklistCode]);

  return {
    stepsState,
    stepsError,
    steps,
    stepDrafts,
    setStepDrafts,
  };
}
