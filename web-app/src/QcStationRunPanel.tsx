import { joinApiUrl } from "./api";
import type { LoadState, ProductionItemRead, QcChecklistRead, QcRunRead, QcStepRead } from "./api";
import type { StepDraft, StepPreview, StepDraftMap } from "./QcStationShared";
import type { QcReferenceArea } from "./QcStationPresentation";
import { formatDateTime, labelForCode } from "./dashboard";
import { QcReferenceImage } from "./QcReferenceImage";

interface QcStationRunPanelProps {
  apiBaseUrl: string;
  stepsState: LoadState;
  stepsError: string | null;
  selectedChecklist: QcChecklistRead | null;
  referenceOverlayAreas: QcReferenceArea[];
  selectedItem: ProductionItemRead | null;
  predictedRunResult: "PASS" | "FAIL";
  failureReason: string;
  failureComment: string;
  failureDisposition: "OPEN_CRITICAL_NCR" | "REWORK_REQUIRED" | "BLOCKED";
  steps: QcStepRead[];
  stepDrafts: StepDraftMap;
  stepPreviews: Record<string, StepPreview>;
  submitError: string | null;
  submitSuccess: string | null;
  completedRun: QcRunRead | null;
  submitState: LoadState;
  authStatePresent: boolean;
  onFailureReasonChange: (value: string) => void;
  onFailureDispositionChange: (value: "OPEN_CRITICAL_NCR" | "REWORK_REQUIRED" | "BLOCKED") => void;
  onFailureCommentChange: (value: string) => void;
  onStepDraftChange: (stepId: string, field: keyof StepDraft, value: string) => void;
  onSubmitRun: () => void;
  createDefaultStepDraft: () => StepDraft;
  normalizeStepEvaluationMode: (step: QcStepRead) => "MANUAL" | "NUMERIC_RANGE" | "TEXT_MATCH";
  formatTolerance: (step: QcStepRead) => string;
  failureReasonOptions: ReadonlyArray<{ value: string; label: string }>;
  failureDispositionOptions: ReadonlyArray<{
    value: "OPEN_CRITICAL_NCR" | "REWORK_REQUIRED" | "BLOCKED";
    label: string;
    hint: string;
  }>;
}

export function QcStationRunPanel({
  apiBaseUrl,
  stepsState,
  stepsError,
  selectedChecklist,
  referenceOverlayAreas,
  selectedItem,
  predictedRunResult,
  failureReason,
  failureComment,
  failureDisposition,
  steps,
  stepDrafts,
  stepPreviews,
  submitError,
  submitSuccess,
  completedRun,
  submitState,
  authStatePresent,
  onFailureReasonChange,
  onFailureDispositionChange,
  onFailureCommentChange,
  onStepDraftChange,
  onSubmitRun,
  createDefaultStepDraft,
  normalizeStepEvaluationMode,
  formatTolerance,
  failureReasonOptions,
  failureDispositionOptions,
}: QcStationRunPanelProps) {
  return (
    <section className="details-section qc-station-run-section">
      <div className="section-heading">
        <h2>3. Wykonanie kontroli</h2>
        <span className={`status-badge state-${stepsState}`}>
          {stepsState === "loading"
            ? "Ladowanie krokow"
            : stepsState === "loaded"
              ? "Checklista gotowa"
              : stepsState === "error"
                ? "Blad krokow"
                : "Oczekuje"}
        </span>
      </div>

      {stepsError ? (
        <div className="error-banner" role="alert">
          <strong>Nie udalo sie zaladowac checklisty.</strong>
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
          {selectedChecklist.reference_image_file_id ? (
            <QcReferenceImage
              imageUrl={joinApiUrl(
                apiBaseUrl.trim(),
                `/files/${encodeURIComponent(selectedChecklist.reference_image_file_id)}`,
              )}
              imageAlt={`Wzorzec kontroli ${selectedChecklist.name}`}
              areas={referenceOverlayAreas}
              caption="Zdjecie referencyjne elementu do porownania podczas kontroli."
            />
          ) : null}
        </div>
      ) : null}

      {selectedItem ? (
        <div className="detail-inline-card qc-run-decision-card">
          <div className="detail-inline-header">
            <strong>4. Decyzja kontroli</strong>
            <span
              className={`status-badge ${
                predictedRunResult === "FAIL" ? "state-error" : "state-loaded"
              }`}
            >
              {predictedRunResult}
            </span>
          </div>
          <p>
            System przewiduje wynik na podstawie aktualnych krokow. Operator
            wykonuje kontrole na podstawie zdjecia pogladowego od administratora,
            a dla FAIL musi wskazac powod i komentarz.
          </p>
          <div className="qc-station-form-grid">
            {predictedRunResult === "FAIL" ? (
              <label className="field">
                <span>Powod niezgodnosci</span>
                <select
                  value={failureReason}
                  onChange={(event) => onFailureReasonChange(event.target.value)}
                >
                  <option value="">Wybierz powod FAIL</option>
                  {failureReasonOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {predictedRunResult === "FAIL" ? (
              <label className="field">
                <span>Decyzja po FAIL</span>
                <select
                  value={failureDisposition}
                  onChange={(event) =>
                    onFailureDispositionChange(
                      event.target.value as "OPEN_CRITICAL_NCR" | "REWORK_REQUIRED" | "BLOCKED",
                    )
                  }
                >
                  {failureDispositionOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {predictedRunResult === "FAIL" ? (
              <label className="field qc-step-comment-field">
                <span>Komentarz do FAIL</span>
                <textarea
                  value={failureComment}
                  onChange={(event) => onFailureCommentChange(event.target.value)}
                  placeholder="Opisz co jest niezgodne i dlaczego detal nie przechodzi kontroli."
                />
              </label>
            ) : null}
          </div>
          {predictedRunResult === "FAIL" ? (
            <div className="details-inline-actions">
              <span className="action-hint">
                {failureDispositionOptions.find((option) => option.value === failureDisposition)?.hint}
              </span>
            </div>
          ) : null}
          <div className="details-inline-actions">
            <span className="action-hint">
              Operator nie dodaje zdjec do runu QC. Jedynym obrazem na stanowisku
              jest zdjecie pogladowe zdefiniowane przez administratora.
            </span>
          </div>
        </div>
      ) : null}

      {steps.length === 0 ? (
        <div className="empty-state">
          <strong>Brak krokow do wykonania</strong>
          <span>
            Wybierz aktywna checkliste QC z krokami pomiarowymi albo kontrolnymi.
          </span>
        </div>
      ) : (
        <div className="qc-step-list">
          {steps.map((step, index) => {
            const draft = stepDrafts[step.id] ?? createDefaultStepDraft();
            const preview = stepPreviews[step.id] ?? null;
            const evaluationMode = normalizeStepEvaluationMode(step);
            const isNumericRange = evaluationMode === "NUMERIC_RANGE";
            const isTextMatch = evaluationMode === "TEXT_MATCH";
            const isManualFail = isNumericRange && draft.status === "FAIL";

            return (
              <article key={step.id} className="qc-step-card">
                <div className="qc-step-card-header">
                  <div>
                    <p className="eyebrow">Krok {index + 1}</p>
                    <h3>{step.title}</h3>
                  </div>
                  <div className="details-inline-actions">
                    {isNumericRange ? (
                      <span className="status-badge">Pomiar wymagany</span>
                    ) : isTextMatch ? (
                      <span className="status-badge">Porownanie tekstu</span>
                    ) : (
                      <span className="status-badge">Kontrola reczna</span>
                    )}
                    {step.blocking_on_fail ? (
                      <span className="status-badge state-error">Fail blokuje</span>
                    ) : null}
                    {step.requires_photo ? (
                      <span className="status-badge">Zdjecie wymagane</span>
                    ) : null}
                  </div>
                </div>
                {step.instruction ? <p className="details-subtitle">{step.instruction}</p> : null}
                <div className="qc-step-meta">
                  {step.control_area ? <span>Obszar: {step.control_area}</span> : null}
                  {step.region_x != null &&
                  step.region_y != null &&
                  step.region_width != null &&
                  step.region_height != null ? (
                    <span>
                      Region: X {step.region_x}% | Y {step.region_y}% | S {step.region_width}% W{" "}
                      {step.region_height}%
                    </span>
                  ) : null}
                  {step.expected_value ? <span>Oczekiwane: {step.expected_value}</span> : null}
                  {step.unit ? <span>Jednostka: {step.unit}</span> : null}
                  {step.tolerance_min !== null || step.tolerance_max !== null ? (
                    <span>{formatTolerance(step)}</span>
                  ) : null}
                </div>
                <div className="qc-step-form-grid">
                  {!isTextMatch ? (
                    <label className="field">
                      <span>{isNumericRange ? "Tryb wyniku kroku" : "Wynik kroku"}</span>
                      <select
                        value={draft.status}
                        onChange={(event) => onStepDraftChange(step.id, "status", event.target.value)}
                      >
                        {isNumericRange ? (
                          <>
                            <option value="PASS">Zalicz wedlug pomiaru</option>
                            <option value="FAIL">Oznacz FAIL recznie</option>
                          </>
                        ) : (
                          <>
                            <option value="PASS">PASS</option>
                            <option value="FAIL">FAIL</option>
                          </>
                        )}
                      </select>
                    </label>
                  ) : null}
                  {isNumericRange ? (
                    <label className="field">
                      <span>
                        {(step.result_input_label || "Pomiar") + (step.unit ? ` (${step.unit})` : "")}
                      </span>
                      <input
                        value={draft.measurementValue}
                        onChange={(event) =>
                          onStepDraftChange(step.id, "measurementValue", event.target.value)
                        }
                        inputMode="decimal"
                        placeholder="np. 24.95"
                        disabled={isManualFail}
                      />
                    </label>
                  ) : null}
                  {isTextMatch ? (
                    <label className="field">
                      <span>{step.result_input_label || "Wynik kontroli"}</span>
                      <input
                        value={draft.observedValue}
                        onChange={(event) =>
                          onStepDraftChange(step.id, "observedValue", event.target.value)
                        }
                        placeholder="Wpisz odczyt lub wynik obserwacji"
                      />
                    </label>
                  ) : null}
                  <label className="field qc-step-comment-field">
                    <span>Komentarz operatora</span>
                    <input
                      value={draft.comment}
                      onChange={(event) => onStepDraftChange(step.id, "comment", event.target.value)}
                      placeholder="Opcjonalna notatka albo numer przyrzadu"
                    />
                  </label>
                </div>
                {isNumericRange || isTextMatch ? (
                  <div className="details-inline-actions">
                    {isNumericRange && isManualFail ? (
                      <span className="inline-feedback-badge state-error">
                        FAIL zostanie zapisany recznie bez automatyki tolerancji.
                      </span>
                    ) : preview ? (
                      <span className={`inline-feedback-badge state-${preview.kind}`}>
                        {preview.message}
                      </span>
                    ) : (
                      <span className="action-hint">
                        {isNumericRange
                          ? "Wpisz pomiar, a wynik kroku zostanie porownany z tolerancja."
                          : "Wpisz obserwowany wynik, a system porowna go z wartoscia oczekiwana."}
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
          <strong>Kontrola nie zostala zapisana.</strong>
          <span>{submitError}</span>
        </div>
      ) : null}

      {submitSuccess ? (
        <div className="qc-result-banner">
          <strong>{submitSuccess}</strong>
          {completedRun ? (
            <span>
              Run {completedRun.run_id} zakonczyl sie wynikiem {completedRun.result}
              {completedRun.ended_at ? ` o ${formatDateTime(completedRun.ended_at)}` : ""}.
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="qc-station-toolbar">
        <button
          className="primary-button"
          type="button"
          onClick={onSubmitRun}
          disabled={
            submitState === "loading" ||
            !selectedItem ||
            !selectedChecklist ||
            !authStatePresent ||
            steps.length === 0
          }
        >
          {submitState === "loading" ? "Zapisuje kontrole..." : "Zapisz kontrole QC"}
        </button>
        <span className="action-hint">
          Po wyniku PASS backend ustawi komponent na `QC_PASSED`, wiec montaz
          dopusci go do dalszych etapow. FAIL ustawi `QC_FAILED` i moze otworzyc NCR.
        </span>
      </div>
    </section>
  );
}
