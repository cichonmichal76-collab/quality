import { useEffect, useState } from "react";

import { QcStationHistoryPanel } from "./QcStationHistoryPanel";
import { QcStationLoginScreen } from "./QcStationLoginScreen";
import { QcStationQueuePanel } from "./QcStationQueuePanel";
import { QcStationRunPanel } from "./QcStationRunPanel";
import { useQcStationAuth } from "./useQcStationAuth";
import { useQcStationChecklistSteps } from "./useQcStationChecklistSteps";
import { useQcStationContext } from "./useQcStationContext";
import { useQcStationHistory } from "./useQcStationHistory";
import { useQcStationWaitingItems } from "./useQcStationWaitingItems";
import { useQcStationWorkflow } from "./useQcStationWorkflow";
import {
  buildStationOverlayAreas,
  buildStepPreviews,
  createDefaultStepDraft,
  deriveDraftRunResult,
  filterAndSortQcRunHistory,
  filterAndSortWaitingItems,
  formatChecklistLabel,
  formatTolerance,
  formatWaitingItemReservationLabel,
  formatWorkstationLabel,
  isProductionItemReservedByOtherOperator,
  normalizeStepEvaluationMode,
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
import { labelForCode } from "./dashboard";
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

export function QcStationPage() {
  const {
    apiBaseUrl,
    setApiBaseUrl,
    operators,
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
  } = useQcStationContext();
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
  const { stepsState, stepsError, steps, stepDrafts, setStepDrafts } =
    useQcStationChecklistSteps(apiBaseUrl, selectedChecklistCode, !!authState);
  const { waitingItemsState, waitingItemsError, waitingItems, reloadWaitingItems } =
    useQcStationWaitingItems(apiBaseUrl, !!authState);
  const {
    barcodeValue,
    setBarcodeValue,
    lookupState,
    lookupError,
    selectedItem,
    reservationState,
    reservationError,
    reservationSuccess,
    reworkAction,
    setReworkAction,
    reworkActionState,
    reworkActionError,
    reworkActionSuccess,
    failureReason,
    setFailureReason,
    failureComment,
    setFailureComment,
    failureDisposition,
    setFailureDisposition,
    submitState,
    submitError,
    submitSuccess,
    completedRun,
    resetRunOutcomeState,
    resetReservationFeedbackState,
    resetReworkState,
    resetSelectedItemWorkflowState,
    handleLookupSubmit,
    handlePickWaitingItem,
    handleReserveSelectedItem,
    handleReleaseSelectedItemReservation,
    handleReleaseForRework,
    handleStepDraftChange,
    handleSubmitRun,
  } = useQcStationWorkflow({
    apiBaseUrl,
    authState,
    activeChecklists,
    selectedChecklistCode,
    setSelectedChecklistCode,
    selectedChecklist,
    steps,
    stepDrafts,
    setStepDrafts,
    reloadWaitingItems,
  });
  const {
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
  } = useQcStationHistory(
    apiBaseUrl,
    !!authState,
    selectedItem?.item_serial_number ?? null,
    selectedItem?.current_status ?? null,
  );
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

  const resetHistoryAndNcrState = () => {
    resetHistoryState();
  };

  const handleReleaseForReworkAndClearNcr = async () => {
    const released = await handleReleaseForRework(openCriticalNcrs.length);
    if (released) {
      setOpenCriticalNcrs([]);
    }
  };

  const {
    manualPassword,
    setManualPassword,
    rfidUidHash,
    setRfidUidHash,
    authSubmitState,
    authError,
    authMessage,
    handleManualLoginSubmit,
    handleRfidSubmit,
    handleLogout,
  } = useQcStationAuth({
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
    onResetSelectedItemWorkflowState: resetSelectedItemWorkflowState,
    onResetHistoryAndNcrState: resetHistoryAndNcrState,
  });

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
              onResetSelectedItem={resetSelectedItemWorkflowState}
              onApplyWaitingItemsPreset={applyWaitingItemsPreset}
              onWaitingItemsFilterChange={setWaitingItemsFilter}
              onWaitingItemsReservationFilterChange={setWaitingItemsReservationFilter}
              onWaitingItemsSortChange={setWaitingItemsSort}
              onPickWaitingItem={handlePickWaitingItem}
              onReserveSelectedItem={handleReserveSelectedItem}
              onReleaseSelectedItemReservation={handleReleaseSelectedItemReservation}
              onReworkActionChange={setReworkAction}
              onReleaseForRework={handleReleaseForReworkAndClearNcr}
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
