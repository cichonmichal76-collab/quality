import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import {
  addQcStepResult,
  completeQcRun,
  createQcRun,
  getProductionItemByBarcode,
  listOperators,
  listQcChecklists,
  listQcChecklistSteps,
  listWorkSessions,
} from "./api";
import type {
  LoadState,
  OperatorRead,
  ProductionItemRead,
  QcChecklistRead,
  QcRunRead,
  QcStepRead,
  WorkSessionRead,
} from "./api";
import { formatDateTime, labelForCode } from "./dashboard";

const API_STORAGE_KEY = "servicetrace.web.apiBaseUrl";
const QUALITY_SESSION_STORAGE_KEY = "servicetrace.web.qualityWorkSessionId";
const QC_CHECKLIST_STORAGE_KEY = "servicetrace.web.qcStationChecklistCode";
const DEFAULT_API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
const QUALITY_ACTION_ALLOWED_ROLES = new Set([
  "ADMIN",
  "QUALITY_INSPECTOR",
  "QUALITY_MANAGER",
]);

interface ActionWorkSessionOption {
  workSessionId: string;
  operatorId: string;
  workstationId: string;
  machineId: string | null;
  role: string;
  label: string;
}

interface StepDraft {
  status: "PASS" | "FAIL";
  measurementValue: string;
  comment: string;
}

type StepDraftMap = Record<string, StepDraft>;

interface MeasurementPreview {
  kind: "success" | "error";
  message: string;
}

export function QcStationPage() {
  const [apiBaseUrl, setApiBaseUrl] = useState(
    () => localStorage.getItem(API_STORAGE_KEY) ?? DEFAULT_API_BASE_URL,
  );
  const [workSessions, setWorkSessions] = useState<WorkSessionRead[]>([]);
  const [operators, setOperators] = useState<OperatorRead[]>([]);
  const [checklists, setChecklists] = useState<QcChecklistRead[]>([]);
  const [contextState, setContextState] = useState<LoadState>("idle");
  const [contextError, setContextError] = useState<string | null>(null);
  const [selectedQualitySessionId, setSelectedQualitySessionId] = useState(
    () => localStorage.getItem(QUALITY_SESSION_STORAGE_KEY) ?? "",
  );
  const [selectedChecklistCode, setSelectedChecklistCode] = useState(
    () => localStorage.getItem(QC_CHECKLIST_STORAGE_KEY) ?? "",
  );
  const [barcodeValue, setBarcodeValue] = useState("");
  const [lookupState, setLookupState] = useState<LoadState>("idle");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ProductionItemRead | null>(null);
  const [stepsState, setStepsState] = useState<LoadState>("idle");
  const [stepsError, setStepsError] = useState<string | null>(null);
  const [steps, setSteps] = useState<QcStepRead[]>([]);
  const [stepDrafts, setStepDrafts] = useState<StepDraftMap>({});
  const [submitState, setSubmitState] = useState<LoadState>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [completedRun, setCompletedRun] = useState<QcRunRead | null>(null);

  const qualitySessionOptions = buildActionWorkSessionOptions(
    workSessions,
    operators,
    QUALITY_ACTION_ALLOWED_ROLES,
  );
  const activeChecklists = checklists
    .filter((checklist) => checklist.is_active)
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
  const selectedQualitySession =
    qualitySessionOptions.find(
      (session) => session.workSessionId === selectedQualitySessionId,
    ) ?? null;
  const measurementWarnings = buildMeasurementWarnings(steps, stepDrafts);

  useEffect(() => {
    localStorage.setItem(API_STORAGE_KEY, apiBaseUrl);
  }, [apiBaseUrl]);

  useEffect(() => {
    if (selectedQualitySessionId) {
      localStorage.setItem(QUALITY_SESSION_STORAGE_KEY, selectedQualitySessionId);
      return;
    }

    localStorage.removeItem(QUALITY_SESSION_STORAGE_KEY);
  }, [selectedQualitySessionId]);

  useEffect(() => {
    if (selectedChecklistCode) {
      localStorage.setItem(QC_CHECKLIST_STORAGE_KEY, selectedChecklistCode);
      return;
    }

    localStorage.removeItem(QC_CHECKLIST_STORAGE_KEY);
  }, [selectedChecklistCode]);

  useEffect(() => {
    const trimmedApiBaseUrl = apiBaseUrl.trim();
    if (!trimmedApiBaseUrl) {
      setContextState("idle");
      setContextError("Podaj adres API, aby załadować sesje jakościowe i checklisty.");
      setWorkSessions([]);
      setOperators([]);
      setChecklists([]);
      return;
    }

    const controller = new AbortController();
    let isCurrentRequest = true;
    setContextState("loading");
    setContextError(null);

    Promise.all([
      listWorkSessions(trimmedApiBaseUrl, controller.signal),
      listOperators(trimmedApiBaseUrl, controller.signal),
      listQcChecklists(trimmedApiBaseUrl, controller.signal),
    ])
      .then(([sessionRows, operatorRows, checklistRows]) => {
        if (!isCurrentRequest) {
          return;
        }

        setWorkSessions(sessionRows);
        setOperators(operatorRows);
        setChecklists(checklistRows);
        setContextState("loaded");
      })
      .catch((error: unknown) => {
        if (!isCurrentRequest || controller.signal.aborted) {
          return;
        }

        setContextState("error");
        setContextError(getErrorMessage(error, "Nie udało się załadować kontekstu QC."));
        setWorkSessions([]);
        setOperators([]);
        setChecklists([]);
      });

    return () => {
      isCurrentRequest = false;
      controller.abort();
    };
  }, [apiBaseUrl]);

  useEffect(() => {
    if (qualitySessionOptions.length === 0) {
      if (selectedQualitySessionId !== "") {
        setSelectedQualitySessionId("");
      }
      return;
    }

    const hasSelectedSession = qualitySessionOptions.some(
      (session) => session.workSessionId === selectedQualitySessionId,
    );
    if (!hasSelectedSession) {
      setSelectedQualitySessionId(qualitySessionOptions[0].workSessionId);
    }
  }, [qualitySessionOptions, selectedQualitySessionId]);

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
    const trimmedApiBaseUrl = apiBaseUrl.trim();
    if (!trimmedApiBaseUrl || !selectedChecklistCode) {
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
          getErrorMessage(error, "Nie udało się załadować kroków checklisty."),
        );
      });

    return () => {
      isCurrentRequest = false;
      controller.abort();
    };
  }, [apiBaseUrl, selectedChecklistCode]);

  useEffect(() => {
    setSubmitState("idle");
    setSubmitError(null);
    setSubmitSuccess(null);
    setCompletedRun(null);
  }, [selectedChecklistCode, selectedItem?.barcode_value, selectedQualitySessionId]);

  const handleLookupSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedApiBaseUrl = apiBaseUrl.trim();
    const trimmedBarcodeValue = barcodeValue.trim();

    setLookupError(null);
    setSubmitError(null);
    setSubmitSuccess(null);
    setCompletedRun(null);

    if (!trimmedApiBaseUrl) {
      setLookupState("error");
      setLookupError("Podaj adres API przed skanem.");
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
      setSelectedItem(item);
      setBarcodeValue(item.barcode_value);
      setLookupState("loaded");
    } catch (error) {
      setSelectedItem(null);
      setLookupState("error");
      setLookupError(
        getErrorMessage(error, "Nie znaleziono komponentu dla podanego barcode."),
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

    if (!trimmedApiBaseUrl) {
      setSubmitState("error");
      setSubmitError("Podaj adres API przed zapisem kontroli.");
      return;
    }

    if (!selectedItem) {
      setSubmitState("error");
      setSubmitError("Najpierw zeskanuj komponent do kontroli.");
      return;
    }

    if (!selectedChecklist) {
      setSubmitState("error");
      setSubmitError("Wybierz checklistę QC.");
      return;
    }

    if (!selectedQualitySession) {
      setSubmitState("error");
      setSubmitError("Wybierz aktywną sesję jakościową.");
      return;
    }

    if (steps.length === 0) {
      setSubmitState("error");
      setSubmitError("Wybrana checklista nie ma żadnych kroków do zapisania.");
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

    setSubmitState("loading");

    try {
      const runId = createClientQcRunId();
      await createQcRun(trimmedApiBaseUrl, {
        run_id: runId,
        item_serial_number: selectedItem.item_serial_number,
        barcode_value: selectedItem.barcode_value,
        checklist_id: selectedChecklist.id,
        process_stage: selectedChecklist.process_stage,
        operator_id: selectedQualitySession.operatorId,
        work_session_id: selectedQualitySession.workSessionId,
      });

      for (const preparedStep of preparedSteps) {
        await addQcStepResult(
          trimmedApiBaseUrl,
          runId,
          preparedStep.step.id,
          preparedStep.payload,
        );
      }

      const completed = await completeQcRun(trimmedApiBaseUrl, runId);
      const refreshedItem = await getProductionItemByBarcode(
        trimmedApiBaseUrl,
        selectedItem.barcode_value,
      );

      setSelectedItem(refreshedItem);
      setCompletedRun(completed);
      setSubmitState("loaded");
      setSubmitSuccess(
        completed.result === "PASS"
          ? `Kontrola zakończona PASS. Komponent ${refreshedItem.item_serial_number} ma teraz status ${refreshedItem.current_status}.`
          : `Kontrola zakończona FAIL. Komponent ${refreshedItem.item_serial_number} ma teraz status ${refreshedItem.current_status}.`,
      );
    } catch (error) {
      setSubmitState("error");
      setSubmitError(
        getErrorMessage(error, "Nie udało się zapisać wyników kontroli QC."),
      );
    }
  };

  return (
    <main className="app-shell qc-station-shell">
      <section className="hero qc-station-hero">
        <div className="hero-copy">
          <p className="eyebrow">Stanowisko operatora jakości</p>
          <h1>Pomiar komponentu, zapis wyniku i dopuszczenie do dalszych etapów.</h1>
          <p>
            Ten ekran odwzorowuje brakujący krok stanowiskowy z PRD: operator
            skanuje detal, wykonuje pomiary lub kontrolę, zapisuje PASS albo FAIL,
            a backend ustawia status komponentu tak, by montaż widział już tylko
            części dopuszczone dalej.
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
            <span>Widok roboczy: QC komponentu przed montażem</span>
            <span>
              Status kontekstu:{" "}
              {contextState === "loading"
                ? "ładowanie"
                : contextState === "loaded"
                  ? "gotowe"
                  : contextState === "error"
                    ? "błąd"
                    : "oczekuje"}
            </span>
          </div>
          <div className="details-inline-actions">
            <a className="ghost-button button-link" href="/">
              Wróć do dashboardu
            </a>
          </div>
        </div>
      </section>

      {contextError ? (
        <section className="error-banner" role="alert">
          <strong>Nie udało się zbudować kontekstu stanowiska.</strong>
          <span>{contextError}</span>
        </section>
      ) : null}

      <section className="qc-station-grid">
        <div className="filters-card">
          <div className="section-heading">
            <h2>1. Kontekst stanowiska</h2>
            <span className={`status-badge state-${contextState}`}>
              {contextState === "loading"
                ? "Ładowanie"
                : contextState === "loaded"
                  ? "API OK"
                  : contextState === "error"
                    ? "Błąd"
                    : "Oczekuje"}
            </span>
          </div>
          <div className="qc-station-form-grid">
            <label className="field">
              <span>Sesja jakościowa</span>
              <select
                value={selectedQualitySessionId}
                onChange={(event) => setSelectedQualitySessionId(event.target.value)}
                disabled={qualitySessionOptions.length === 0}
              >
                {qualitySessionOptions.length === 0 ? (
                  <option value="">
                    {contextState === "loading"
                      ? "Ładowanie aktywnych sesji..."
                      : "Brak aktywnej sesji jakościowej"}
                  </option>
                ) : (
                  qualitySessionOptions.map((session) => (
                    <option key={session.workSessionId} value={session.workSessionId}>
                      {session.label}
                    </option>
                  ))
                )}
              </select>
            </label>
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
                      ? "Ładowanie checklist..."
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
            {qualitySessionOptions.length === 0 && contextState !== "loading" ? (
              <span className="action-hint">
                Brak aktywnej sesji z rolą jakościową. Uruchom sesję
                `QUALITY_INSPECTOR`, `QUALITY_MANAGER` albo `ADMIN`.
              </span>
            ) : null}
            {activeChecklists.length === 0 && contextState !== "loading" ? (
              <span className="action-hint">
                Brak aktywnej checklisty QC. Dodaj ją przez API lub seed demo.
              </span>
            ) : null}
          </div>
        </div>

        <div className="filters-card">
          <div className="section-heading">
            <h2>2. Skan detalu</h2>
            <span className={`status-badge state-${lookupState}`}>
              {lookupState === "loading"
                ? "Szukam"
                : lookupState === "loaded"
                  ? "Detal OK"
                  : lookupState === "error"
                    ? "Błąd"
                    : "Gotowy"}
            </span>
          </div>
          <form className="qc-station-lookup-form" onSubmit={handleLookupSubmit}>
            <label className="field">
              <span>Barcode komponentu</span>
              <input
                value={barcodeValue}
                onChange={(event) => setBarcodeValue(event.target.value)}
                placeholder="np. BC-DEMO-001"
              />
            </label>
            <div className="details-inline-actions">
              <button className="primary-button" type="submit">
                Pobierz detal
              </button>
              {selectedItem ? (
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => {
                    setSelectedItem(null);
                    setLookupState("idle");
                    setLookupError(null);
                    setSubmitError(null);
                    setSubmitSuccess(null);
                    setCompletedRun(null);
                    setBarcodeValue("");
                  }}
                >
                  Nowy detal
                </button>
              ) : null}
            </div>
          </form>
          {lookupError ? (
            <div className="error-banner" role="alert">
              <strong>Nie udało się pobrać komponentu.</strong>
              <span>{lookupError}</span>
            </div>
          ) : null}
          {selectedItem ? (
            <div className="details-grid qc-station-item-grid">
              <div className="detail-card">
                <span>Serial komponentu</span>
                <strong>{selectedItem.item_serial_number}</strong>
              </div>
              <div className="detail-card">
                <span>Status bieżący</span>
                <strong>{labelForCode(selectedItem.current_status)}</strong>
              </div>
              <div className="detail-card">
                <span>Typ komponentu</span>
                <strong>{labelForCode(selectedItem.item_type)}</strong>
              </div>
              <div className="detail-card">
                <span>Barcode</span>
                <strong>{selectedItem.barcode_value}</strong>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <strong>Brak wybranego komponentu</strong>
              <span>
                Zeskanuj barcode, aby pobrać detal do kontroli i zapisać wynik QC.
              </span>
            </div>
          )}
        </div>
      </section>

      <section className="details-section qc-station-run-section">
        <div className="section-heading">
          <h2>3. Wykonanie kontroli</h2>
          <span className={`status-badge state-${stepsState}`}>
            {stepsState === "loading"
              ? "Ładowanie kroków"
              : stepsState === "loaded"
                ? "Checklista gotowa"
                : stepsState === "error"
                  ? "Błąd kroków"
                  : "Oczekuje"}
          </span>
        </div>

        {stepsError ? (
          <div className="error-banner" role="alert">
            <strong>Nie udało się załadować checklisty.</strong>
            <span>{stepsError}</span>
          </div>
        ) : null}

        {selectedChecklist ? (
          <div className="detail-inline-card">
            <div className="detail-inline-header">
              <strong>{selectedChecklist.name}</strong>
              <span className="status-badge">
                {labelForCode(selectedChecklist.process_stage)}
              </span>
            </div>
            <p>
              Kod {selectedChecklist.checklist_code}, wersja {selectedChecklist.version}.
            </p>
          </div>
        ) : null}

        {steps.length === 0 ? (
          <div className="empty-state">
            <strong>Brak kroków do wykonania</strong>
            <span>
              Wybierz aktywną checklistę QC z krokami pomiarowymi albo kontrolnymi.
            </span>
          </div>
        ) : (
          <div className="qc-step-list">
            {steps.map((step, index) => {
              const draft = stepDrafts[step.id] ?? createDefaultStepDraft();
              const preview = measurementWarnings[step.id] ?? null;
              const isManualFail = step.requires_measurement && draft.status === "FAIL";

              return (
                <article key={step.id} className="qc-step-card">
                  <div className="qc-step-card-header">
                    <div>
                      <p className="eyebrow">Krok {index + 1}</p>
                      <h3>{step.title}</h3>
                    </div>
                    <div className="details-inline-actions">
                      {step.requires_measurement ? (
                        <span className="status-badge">Pomiar wymagany</span>
                      ) : (
                        <span className="status-badge">Kontrola binarna</span>
                      )}
                      {step.blocking_on_fail ? (
                        <span className="status-badge state-error">
                          Fail blokuje
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {step.instruction ? (
                    <p className="details-subtitle">{step.instruction}</p>
                  ) : null}
                  <div className="qc-step-meta">
                    {step.expected_value ? (
                      <span>Oczekiwane: {step.expected_value}</span>
                    ) : null}
                    {step.unit ? <span>Jednostka: {step.unit}</span> : null}
                    {step.tolerance_min !== null || step.tolerance_max !== null ? (
                      <span>{formatTolerance(step)}</span>
                    ) : null}
                  </div>
                  <div className="qc-step-form-grid">
                    <label className="field">
                      <span>
                        {step.requires_measurement
                          ? "Tryb wyniku kroku"
                          : "Wynik kroku"}
                      </span>
                      <select
                        value={draft.status}
                        onChange={(event) =>
                          handleStepDraftChange(
                            step.id,
                            "status",
                            event.target.value,
                          )
                        }
                      >
                        {step.requires_measurement ? (
                          <>
                            <option value="PASS">Zalicz według pomiaru</option>
                            <option value="FAIL">Oznacz FAIL ręcznie</option>
                          </>
                        ) : (
                          <>
                            <option value="PASS">PASS</option>
                            <option value="FAIL">FAIL</option>
                          </>
                        )}
                      </select>
                    </label>
                    {step.requires_measurement ? (
                      <label className="field">
                        <span>
                          Pomiar {step.unit ? `(${step.unit})` : ""}
                        </span>
                        <input
                          value={draft.measurementValue}
                          onChange={(event) =>
                            handleStepDraftChange(
                              step.id,
                              "measurementValue",
                              event.target.value,
                            )
                          }
                          inputMode="decimal"
                          placeholder="np. 24.95"
                          disabled={isManualFail}
                        />
                      </label>
                    ) : null}
                    <label className="field qc-step-comment-field">
                      <span>Komentarz operatora</span>
                      <input
                        value={draft.comment}
                        onChange={(event) =>
                          handleStepDraftChange(step.id, "comment", event.target.value)
                        }
                        placeholder="Opcjonalna notatka, np. numer przyrządu lub obserwacja."
                      />
                    </label>
                  </div>
                  {step.requires_measurement ? (
                    <div className="details-inline-actions">
                      {isManualFail ? (
                        <span className="inline-feedback-badge state-error">
                          FAIL zostanie zapisany ręcznie bez automatyki tolerancji.
                        </span>
                      ) : preview ? (
                        <span className={`inline-feedback-badge state-${preview.kind}`}>
                          {preview.message}
                        </span>
                      ) : (
                        <span className="action-hint">
                          Wpisz pomiar, a wynik kroku zostanie wyliczony na podstawie
                          tolerancji backendu.
                        </span>
                      )}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}

        {submitError ? (
          <div className="error-banner" role="alert">
            <strong>Kontrola nie została zapisana.</strong>
            <span>{submitError}</span>
          </div>
        ) : null}

        {submitSuccess ? (
          <div className="qc-result-banner">
            <strong>{submitSuccess}</strong>
            {completedRun ? (
              <span>
                Run {completedRun.run_id} zakończył się wynikiem {completedRun.result}
                {completedRun.ended_at
                  ? ` o ${formatDateTime(completedRun.ended_at)}`
                  : ""}.
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="qc-station-toolbar">
          <button
            className="primary-button"
            type="button"
            onClick={handleSubmitRun}
            disabled={
              submitState === "loading" ||
              !selectedItem ||
              !selectedChecklist ||
              !selectedQualitySession ||
              steps.length === 0
            }
          >
            {submitState === "loading"
              ? "Zapisuję kontrolę..."
              : "Zapisz kontrolę QC"}
          </button>
          <span className="action-hint">
            Po wyniku PASS backend ustawi komponent na `QC_PASSED`, więc montaż
            dopuści go do dalszych etapów. FAIL ustawi `QC_FAILED` i może otworzyć NCR.
          </span>
        </div>
      </section>
    </main>
  );
}

function buildActionWorkSessionOptions(
  sessions: WorkSessionRead[],
  operators: OperatorRead[],
  allowedRoles: Set<string>,
): ActionWorkSessionOption[] {
  const operatorsById = new Map(
    operators.map((operator) => [operator.operator_id, operator]),
  );

  return sessions
    .filter((session) => session.status === "ACTIVE" && session.ended_at === null)
    .map((session) => {
      const operator = operatorsById.get(session.operator_id);

      if (
        !operator ||
        !operator.is_active ||
        !allowedRoles.has(operator.role)
      ) {
        return null;
      }

      return {
        workSessionId: session.work_session_id,
        operatorId: operator.operator_id,
        workstationId: session.workstation_id,
        machineId: session.machine_id,
        role: operator.role,
        label: `${operator.full_name} · ${labelForCode(operator.role)} · ${session.workstation_id}`,
      };
    })
    .filter((session): session is ActionWorkSessionOption => session !== null);
}

function buildInitialStepDrafts(steps: QcStepRead[]): StepDraftMap {
  return Object.fromEntries(
    steps.map((step) => [step.id, createDefaultStepDraft(step.requires_measurement)]),
  );
}

function createDefaultStepDraft(requiresMeasurement = false): StepDraft {
  return {
    status: "PASS",
    measurementValue: "",
    comment: requiresMeasurement ? "" : "",
  };
}

function prepareStepPayload(
  step: QcStepRead,
  draft: StepDraft | undefined,
):
  | { payload: { status: "PASS" | "FAIL"; measurement_value?: number; comment?: string } }
  | { error: string } {
  const safeDraft = draft ?? createDefaultStepDraft(step.requires_measurement);
  const normalizedComment = normalizeOptionalString(safeDraft.comment);

  if (step.requires_measurement) {
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
        error: `Krok „${step.title}” wymaga pomiaru albo ręcznego FAIL.`,
      };
    }

    const measurementValue = Number(trimmedMeasurement);
    if (!Number.isFinite(measurementValue)) {
      return {
        error: `Pomiar dla kroku „${step.title}” nie jest poprawną liczbą.`,
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

function buildMeasurementWarnings(
  steps: QcStepRead[],
  stepDrafts: StepDraftMap,
): Record<string, MeasurementPreview> {
  const previews: Record<string, MeasurementPreview> = {};

  for (const step of steps) {
    if (!step.requires_measurement) {
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
        message: "Pomiar nie jest poprawną liczbą.",
      };
      continue;
    }

    if (
      step.tolerance_min !== null &&
      measurementValue < Number(step.tolerance_min)
    ) {
      previews[step.id] = {
        kind: "error",
        message: `Poza tolerancją: ${measurementValue} < ${step.tolerance_min}.`,
      };
      continue;
    }

    if (
      step.tolerance_max !== null &&
      measurementValue > Number(step.tolerance_max)
    ) {
      previews[step.id] = {
        kind: "error",
        message: `Poza tolerancją: ${measurementValue} > ${step.tolerance_max}.`,
      };
      continue;
    }

    previews[step.id] = {
      kind: "success",
      message: "Pomiar mieści się w tolerancji.",
    };
  }

  return previews;
}

function formatChecklistLabel(checklist: QcChecklistRead): string {
  return `${checklist.name} · ${labelForCode(checklist.process_stage)} · v${checklist.version}`;
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

function createClientQcRunId(): string {
  return `QC-WEB-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}
