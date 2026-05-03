import { joinApiUrl } from "./api";
import type {
  LoadState,
  NonconformityRead,
  QcRunDetailsRead,
  QcRunRead,
} from "./api";
import { formatDateTime, labelForCode } from "./dashboard";

type QcRunHistoryFilter = "ALL" | "FAIL" | "PASS" | "POST_LATEST_REWORK";
type QcRunHistorySort = "NEWEST" | "OLDEST";
type ClosedCriticalNcrSort = "NEWEST" | "OLDEST";
type QcHistoryPreset = "LATEST_FAIL" | "LATEST_PASS" | "POST_LATEST_REWORK" | "RESET";

interface QcStationHistoryPanelProps {
  apiBaseUrl: string;
  filteredQcRunHistory: QcRunRead[];
  qcRunHistory: QcRunRead[];
  qcRunHistoryError: string | null;
  qcRunHistoryState: LoadState;
  sortedClosedCriticalNcrs: NonconformityRead[];
  closedCriticalNcrs: NonconformityRead[];
  closedCriticalNcrsError: string | null;
  closedCriticalNcrsState: LoadState;
  qcRunHistoryFilter: QcRunHistoryFilter;
  qcRunHistorySort: QcRunHistorySort;
  closedCriticalNcrSort: ClosedCriticalNcrSort;
  selectedHistoryRunId: string | null;
  selectedHistoryRunDetails: QcRunDetailsRead | null;
  qcRunDetailsState: LoadState;
  qcRunDetailsError: string | null;
  onApplyHistoryPreset: (preset: QcHistoryPreset) => void;
  onQcRunHistoryFilterChange: (value: QcRunHistoryFilter) => void;
  onQcRunHistorySortChange: (value: QcRunHistorySort) => void;
  onClosedCriticalNcrSortChange: (value: ClosedCriticalNcrSort) => void;
  onSelectedHistoryRunIdChange: (runId: string) => void;
}

export function QcStationHistoryPanel({
  apiBaseUrl,
  filteredQcRunHistory,
  qcRunHistory,
  qcRunHistoryError,
  qcRunHistoryState,
  sortedClosedCriticalNcrs,
  closedCriticalNcrs,
  closedCriticalNcrsError,
  closedCriticalNcrsState,
  qcRunHistoryFilter,
  qcRunHistorySort,
  closedCriticalNcrSort,
  selectedHistoryRunId,
  selectedHistoryRunDetails,
  qcRunDetailsState,
  qcRunDetailsError,
  onApplyHistoryPreset,
  onQcRunHistoryFilterChange,
  onQcRunHistorySortChange,
  onClosedCriticalNcrSortChange,
  onSelectedHistoryRunIdChange,
}: QcStationHistoryPanelProps) {
  return (
    <div className="detail-inline-card qc-run-decision-card">
      <div className="detail-inline-header">
        <strong>2b. Historia kontroli i zamkniete NCR</strong>
        <span className="status-badge">
          {filteredQcRunHistory.length} / {qcRunHistory.length} run |{" "}
          {sortedClosedCriticalNcrs.length} / {closedCriticalNcrs.length} NCR
        </span>
      </div>
      <p>
        Podglad ostatnich kontroli tego samego detalu i zamknietych NCR po
        wykonanych poprawkach.
      </p>

      {qcRunHistoryError ? (
        <div className="error-banner" role="alert">
          <strong>Nie udalo sie pobrac historii kontroli.</strong>
          <span>{qcRunHistoryError}</span>
        </div>
      ) : null}

      <div className="details-grid qc-station-item-grid">
        <div className="detail-card">
          <span>Historia QC</span>
          <strong>
            {qcRunHistoryState === "loading"
              ? "Ladowanie"
              : `${filteredQcRunHistory.length} / ${qcRunHistory.length}`}
          </strong>
        </div>
        <div className="detail-card">
          <span>Zamkniete NCR</span>
          <strong>
            {closedCriticalNcrsState === "loading"
              ? "Ladowanie"
              : `${sortedClosedCriticalNcrs.length} / ${closedCriticalNcrs.length}`}
          </strong>
        </div>
      </div>

      <div className="qc-station-form-grid qc-history-filter-grid">
        <div className="details-inline-actions qc-history-preset-actions">
          <button
            className="ghost-button"
            type="button"
            onClick={() => onApplyHistoryPreset("LATEST_FAIL")}
          >
            Najnowszy FAIL
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => onApplyHistoryPreset("LATEST_PASS")}
          >
            Najnowszy PASS
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => onApplyHistoryPreset("POST_LATEST_REWORK")}
          >
            Po ostatnim reworku
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => onApplyHistoryPreset("RESET")}
          >
            Reset historii
          </button>
        </div>
        <label className="field">
          <span>Filtr historii QC</span>
          <select
            aria-label="Filtr historii QC"
            value={qcRunHistoryFilter}
            onChange={(event) =>
              onQcRunHistoryFilterChange(event.target.value as QcRunHistoryFilter)
            }
          >
            <option value="ALL">Wszystkie runy</option>
            <option value="FAIL">Tylko FAIL</option>
            <option value="PASS">Tylko PASS</option>
            <option value="POST_LATEST_REWORK">Po ostatnim reworku</option>
          </select>
        </label>
        <label className="field">
          <span>Sortowanie historii QC</span>
          <select
            aria-label="Sortowanie historii QC"
            value={qcRunHistorySort}
            onChange={(event) =>
              onQcRunHistorySortChange(event.target.value as QcRunHistorySort)
            }
          >
            <option value="NEWEST">Najnowsze runy</option>
            <option value="OLDEST">Najstarsze runy</option>
          </select>
        </label>
        <label className="field">
          <span>Sortowanie zamknietych NCR</span>
          <select
            aria-label="Sortowanie zamknietych NCR"
            value={closedCriticalNcrSort}
            onChange={(event) =>
              onClosedCriticalNcrSortChange(
                event.target.value as ClosedCriticalNcrSort,
              )
            }
          >
            <option value="NEWEST">Ostatnie zamkniete NCR</option>
            <option value="OLDEST">Najstarsze zamkniete NCR</option>
          </select>
        </label>
      </div>

      {filteredQcRunHistory.length > 0 ? (
        <div className="qc-evidence-list" data-testid="qc-run-history-list">
          {filteredQcRunHistory.map((run) => (
            <button
              key={run.run_id}
              type="button"
              className={`qc-evidence-item qc-run-history-item${
                selectedHistoryRunId === run.run_id ? " is-selected" : ""
              }`}
              onClick={() => onSelectedHistoryRunIdChange(run.run_id)}
            >
              <div className="qc-evidence-item-copy">
                <strong>{run.run_id}</strong>
                <span>
                  {labelForCode(run.process_stage)} | {labelForCode(run.status)} |{" "}
                  {labelForCode(run.result ?? "IN_PROGRESS")}
                </span>
                <span>
                  {formatDateTime(run.started_at)}{" "}
                  {run.ended_at ? `-> ${formatDateTime(run.ended_at)}` : ""}
                </span>
              </div>
              <span className="status-badge">
                {selectedHistoryRunId === run.run_id
                  ? "Szczegoly aktywne"
                  : "Pokaz szczegoly"}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="details-inline-actions">
          <span className="action-hint">
            Brak runow QC spelniajacych aktywny filtr dla tego detalu.
          </span>
        </div>
      )}

      {closedCriticalNcrsError ? (
        <div className="error-banner" role="alert">
          <strong>Nie udalo sie pobrac zamknietych NCR.</strong>
          <span>{closedCriticalNcrsError}</span>
        </div>
      ) : null}

      {sortedClosedCriticalNcrs.length > 0 ? (
        <div className="qc-evidence-list" data-testid="qc-closed-ncr-list">
          {sortedClosedCriticalNcrs.map((ncr) => (
            <div key={ncr.ncr_id} className="qc-evidence-item">
              <div className="qc-evidence-item-copy">
                <strong>{ncr.ncr_id}</strong>
                <span>
                  Zamkniete:{" "}
                  {ncr.closed_at ? formatDateTime(ncr.closed_at) : "brak daty"}
                </span>
                <span>
                  {ncr.corrective_action ?? "Brak zapisanej akcji korygujacej."}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="details-inline-actions">
          <span className="action-hint">
            Brak zamknietych krytycznych NCR dla tego detalu.
          </span>
        </div>
      )}

      <div className="detail-inline-card qc-run-details-card">
        <div className="detail-inline-header">
          <strong>2c. Szczegoly wybranego runu QC</strong>
          <span className={`status-badge state-${qcRunDetailsState}`}>
            {qcRunDetailsState === "loading"
              ? "Ladowanie"
              : qcRunDetailsState === "loaded"
                ? "Szczegoly gotowe"
                : qcRunDetailsState === "error"
                  ? "Blad"
                  : "Wybierz run"}
          </span>
        </div>
        <p>
          Szczegolowy podglad krokow, komentarzy, decyzji FAIL i plikow
          dowodowych dla zaznaczonego wpisu z historii.
        </p>

        {qcRunDetailsError ? (
          <div className="error-banner" role="alert">
            <strong>Nie udalo sie pobrac szczegolow runu.</strong>
            <span>{qcRunDetailsError}</span>
          </div>
        ) : null}

        {selectedHistoryRunDetails ? (
          <>
            <div className="details-grid qc-station-item-grid">
              <div className="detail-card">
                <span>Run ID</span>
                <strong>{selectedHistoryRunDetails.run_id}</strong>
              </div>
              <div className="detail-card">
                <span>Wynik</span>
                <strong>
                  {labelForCode(
                    selectedHistoryRunDetails.result ??
                      selectedHistoryRunDetails.status,
                  )}
                </strong>
              </div>
              <div className="detail-card">
                <span>Checklista</span>
                <strong>
                  {selectedHistoryRunDetails.checklist_name ??
                    selectedHistoryRunDetails.checklist_code ??
                    "Brak checklisty"}
                </strong>
              </div>
              <div className="detail-card">
                <span>Pliki dowodowe</span>
                <strong>
                  {selectedHistoryRunDetails.evidence_files.length} plik(ow)
                </strong>
              </div>
            </div>

            {(selectedHistoryRunDetails.failure_reason ||
              selectedHistoryRunDetails.failure_comment ||
              selectedHistoryRunDetails.failure_disposition) && (
              <div className="details-grid qc-station-item-grid">
                <div className="detail-card">
                  <span>Decyzja FAIL</span>
                  <strong>
                    {labelForCode(
                      selectedHistoryRunDetails.failure_disposition ?? "FAIL",
                    )}
                  </strong>
                </div>
                <div className="detail-card">
                  <span>Powod FAIL</span>
                  <strong>
                    {labelForCode(
                      selectedHistoryRunDetails.failure_reason ?? "BRAK_POWODU",
                    )}
                  </strong>
                </div>
                <div className="detail-card">
                  <span>Komentarz FAIL</span>
                  <strong>
                    {selectedHistoryRunDetails.failure_comment ??
                      "Brak zapisanego komentarza."}
                  </strong>
                </div>
              </div>
            )}

            {selectedHistoryRunDetails.step_results.length > 0 ? (
              <div className="qc-evidence-list" data-testid="qc-run-detail-steps">
                {selectedHistoryRunDetails.step_results.map((stepResult) => (
                  <div key={stepResult.id} className="qc-evidence-item">
                    <div className="qc-evidence-item-copy">
                      <strong>
                        Krok {stepResult.step_order}: {stepResult.step_title}
                      </strong>
                      <span>
                        {labelForCode(stepResult.evaluation_mode)} |{" "}
                        {labelForCode(stepResult.status)}
                      </span>
                      {stepResult.control_area ? (
                        <span>Obszar: {stepResult.control_area}</span>
                      ) : null}
                      {stepResult.measurement_value != null ? (
                        <span>
                          Pomiar: {stepResult.measurement_value}
                          {stepResult.unit ? ` ${stepResult.unit}` : ""}
                        </span>
                      ) : null}
                      {stepResult.observed_value ? (
                        <span>Wynik obserwowany: {stepResult.observed_value}</span>
                      ) : null}
                      {stepResult.expected_value ? (
                        <span>Wartosc oczekiwana: {stepResult.expected_value}</span>
                      ) : null}
                      {stepResult.comment ? (
                        <span>Komentarz: {stepResult.comment}</span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="details-inline-actions">
                <span className="action-hint">
                  Brak zapisanych wynikow krokow dla tego runu.
                </span>
              </div>
            )}

            {selectedHistoryRunDetails.evidence_files.length > 0 ? (
              <div className="qc-evidence-list" data-testid="qc-run-detail-files">
                {selectedHistoryRunDetails.evidence_files.map((file) => (
                  <a
                    key={file.id}
                    className="qc-evidence-item qc-evidence-link"
                    href={joinApiUrl(apiBaseUrl, `/files/${file.id}`)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <div className="qc-evidence-item-copy">
                      <strong>{file.file_name}</strong>
                      <span>
                        {file.file_type ?? "plik"} | {formatDateTime(file.created_at)}
                      </span>
                      <span>Zaladowal: {file.uploaded_by ?? "brak"}</span>
                    </div>
                    <span className="status-badge">Pobierz</span>
                  </a>
                ))}
              </div>
            ) : (
              <div className="details-inline-actions">
                <span className="action-hint">
                  Ten run nie ma zalaczonych plikow dowodowych.
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="details-inline-actions">
            <span className="action-hint">
              Wybierz run z historii, aby zobaczyc szczegoly krokow i plikow.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
