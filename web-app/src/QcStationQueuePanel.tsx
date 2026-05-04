import type { FormEvent, ReactNode } from "react";

import type { LoadState, NonconformityRead, ProductionItemRead } from "./api";
import type {
  WaitingItemsFilter,
  WaitingItemsReservationFilter,
  WaitingItemsReservationSummary,
  WaitingItemsSort,
} from "./QcStationShared";
import { formatDateTime, labelForCode } from "./dashboard";
type WaitingPreset =
  | "PRODUCED"
  | "REWORK_REQUIRED"
  | "UNRESERVED"
  | "MINE"
  | "OTHER_RESERVED"
  | "RESET";

interface QcStationQueuePanelProps {
  authStateOperatorId: string | null;
  barcodeValue: string;
  lookupState: LoadState;
  lookupError: string | null;
  waitingItemsState: LoadState;
  waitingItemsError: string | null;
  waitingItems: ProductionItemRead[];
  filteredWaitingItems: ProductionItemRead[];
  waitingItemsReservationSummary: WaitingItemsReservationSummary;
  waitingItemsFilter: WaitingItemsFilter;
  waitingItemsReservationFilter: WaitingItemsReservationFilter;
  waitingItemsSort: WaitingItemsSort;
  selectedItem: ProductionItemRead | null;
  selectedItemReservedByOtherOperator: boolean;
  selectedItemReservedByCurrentOperator: boolean;
  reservationState: LoadState;
  reservationError: string | null;
  reservationSuccess: string | null;
  shouldShowReworkPanel: boolean;
  openCriticalNcrsState: LoadState;
  openCriticalNcrsError: string | null;
  openCriticalNcrs: NonconformityRead[];
  canReleaseSelectedItemForRework: boolean;
  reworkAction: string;
  reworkActionState: LoadState;
  reworkActionError: string | null;
  reworkActionSuccess: string | null;
  onBarcodeValueChange: (value: string) => void;
  onLookupSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onResetSelectedItem: () => void;
  onApplyWaitingItemsPreset: (preset: WaitingPreset) => void;
  onWaitingItemsFilterChange: (value: WaitingItemsFilter) => void;
  onWaitingItemsReservationFilterChange: (value: WaitingItemsReservationFilter) => void;
  onWaitingItemsSortChange: (value: WaitingItemsSort) => void;
  onPickWaitingItem: (item: ProductionItemRead) => void;
  onReserveSelectedItem: () => void;
  onReleaseSelectedItemReservation: () => void;
  onReworkActionChange: (value: string) => void;
  onReleaseForRework: () => void;
  isWaitingItemReservedByOtherOperator: (item: ProductionItemRead, operatorId: string) => boolean;
  formatWaitingItemReservationLabel: (item: ProductionItemRead) => string;
  historyPanel: ReactNode;
}

export function QcStationQueuePanel({
  authStateOperatorId,
  barcodeValue,
  lookupState,
  lookupError,
  waitingItemsState,
  waitingItemsError,
  waitingItems,
  filteredWaitingItems,
  waitingItemsReservationSummary,
  waitingItemsFilter,
  waitingItemsReservationFilter,
  waitingItemsSort,
  selectedItem,
  selectedItemReservedByOtherOperator,
  selectedItemReservedByCurrentOperator,
  reservationState,
  reservationError,
  reservationSuccess,
  shouldShowReworkPanel,
  openCriticalNcrsState,
  openCriticalNcrsError,
  openCriticalNcrs,
  canReleaseSelectedItemForRework,
  reworkAction,
  reworkActionState,
  reworkActionError,
  reworkActionSuccess,
  onBarcodeValueChange,
  onLookupSubmit,
  onResetSelectedItem,
  onApplyWaitingItemsPreset,
  onWaitingItemsFilterChange,
  onWaitingItemsReservationFilterChange,
  onWaitingItemsSortChange,
  onPickWaitingItem,
  onReserveSelectedItem,
  onReleaseSelectedItemReservation,
  onReworkActionChange,
  onReleaseForRework,
  isWaitingItemReservedByOtherOperator,
  formatWaitingItemReservationLabel,
  historyPanel,
}: QcStationQueuePanelProps) {
  return (
    <section className="qc-station-grid">
      <div className="filters-card">
        <div className="section-heading">
          <h2>2. Skan detalu i kolejka QC</h2>
          <span className={`status-badge state-${lookupState}`}>
            {lookupState === "loading"
              ? "Szukam"
              : lookupState === "loaded"
                ? "Detal OK"
                : lookupState === "error"
                  ? "Blad"
                  : "Gotowy"}
          </span>
        </div>
        <form className="qc-station-lookup-form" onSubmit={onLookupSubmit}>
          <label className="field">
            <span>Barcode komponentu</span>
            <input
              value={barcodeValue}
              onChange={(event) => onBarcodeValueChange(event.target.value)}
              placeholder="np. BC-DEMO-001"
            />
          </label>
          <div className="details-inline-actions">
            <button className="primary-button" type="submit">
              Pobierz detal
            </button>
            {selectedItem ? (
              <button className="ghost-button" type="button" onClick={onResetSelectedItem}>
                Nowy detal
              </button>
            ) : null}
          </div>
        </form>
        <div className="details-inline-actions">
          <span className="action-hint">
            Kolejka pokazuje elementy w statusie `PRODUCED` albo `REWORK_REQUIRED`.
            Klikniecie detalu moze od razu dobrac wlasciwa checkliste po typie komponentu.
          </span>
          <span className={`status-badge state-${waitingItemsState}`}>
            {waitingItemsState === "loading"
              ? "Kolejka laduje"
              : waitingItemsState === "loaded"
                ? `${filteredWaitingItems.length}/${waitingItems.length} oczekuje`
                : waitingItemsState === "error"
                  ? "Blad kolejki"
                  : "Kolejka idle"}
          </span>
        </div>
        <div className="detail-card-grid" data-testid="qc-waiting-summary">
          <div className="detail-card" data-testid="qc-waiting-summary-all">
            <span>Wszystkie</span>
            <strong>{waitingItemsReservationSummary.all}</strong>
          </div>
          <div className="detail-card" data-testid="qc-waiting-summary-unreserved">
            <span>Wolne detale</span>
            <strong>{waitingItemsReservationSummary.unreserved}</strong>
          </div>
          <div className="detail-card" data-testid="qc-waiting-summary-mine">
            <span>Moje rezerwacje</span>
            <strong>{waitingItemsReservationSummary.mine}</strong>
          </div>
          <div className="detail-card" data-testid="qc-waiting-summary-other">
            <span>Cudze rezerwacje</span>
            <strong>{waitingItemsReservationSummary.otherReserved}</strong>
          </div>
        </div>
        <div className="qc-station-form-grid qc-history-filter-grid">
          <div className="details-inline-actions qc-history-preset-actions">
            <button className="ghost-button" type="button" onClick={() => onApplyWaitingItemsPreset("PRODUCED")}>
              Nowe sztuki
            </button>
            <button className="ghost-button" type="button" onClick={() => onApplyWaitingItemsPreset("REWORK_REQUIRED")}>
              Rework
            </button>
            <button className="ghost-button" type="button" onClick={() => onApplyWaitingItemsPreset("MINE")}>
              Moje rezerwacje
            </button>
            <button className="ghost-button" type="button" onClick={() => onApplyWaitingItemsPreset("UNRESERVED")}>
              Wolne detale
            </button>
            <button className="ghost-button" type="button" onClick={() => onApplyWaitingItemsPreset("OTHER_RESERVED")}>
              Cudze rezerwacje
            </button>
            <button className="ghost-button" type="button" onClick={() => onApplyWaitingItemsPreset("RESET")}>
              Reset kolejki
            </button>
          </div>
          <label className="field">
            <span>Status kolejki QC</span>
            <select
              aria-label="Status kolejki QC"
              value={waitingItemsFilter}
              onChange={(event) => onWaitingItemsFilterChange(event.target.value as WaitingItemsFilter)}
            >
              <option value="ALL">Wszystkie sztuki</option>
              <option value="PRODUCED">Tylko nowe sztuki</option>
              <option value="REWORK_REQUIRED">Tylko rework</option>
            </select>
          </label>
          <label className="field">
            <span>Filtr rezerwacji QC</span>
            <select
              aria-label="Filtr rezerwacji QC"
              value={waitingItemsReservationFilter}
              onChange={(event) =>
                onWaitingItemsReservationFilterChange(
                  event.target.value as WaitingItemsReservationFilter,
                )
              }
            >
              <option value="ALL">Wszystkie rezerwacje</option>
              <option value="UNRESERVED">Tylko wolne detale</option>
              <option value="MINE">Tylko moje rezerwacje</option>
              <option value="OTHER_RESERVED">Tylko cudze rezerwacje</option>
            </select>
          </label>
          <label className="field">
            <span>Sortowanie kolejki QC</span>
            <select
              aria-label="Sortowanie kolejki QC"
              value={waitingItemsSort}
              onChange={(event) => onWaitingItemsSortChange(event.target.value as WaitingItemsSort)}
            >
              <option value="OLDEST">Najstarsze najpierw</option>
              <option value="NEWEST">Najnowsze najpierw</option>
            </select>
          </label>
        </div>
        {waitingItemsError ? (
          <div className="error-banner" role="alert">
            <strong>Nie udalo sie pobrac kolejki QC.</strong>
            <span>{waitingItemsError}</span>
          </div>
        ) : null}
        {filteredWaitingItems.length === 0 ? (
          <div className="empty-state qc-waiting-empty-state">
            <strong>Brak komponentow spelniajacych filtr kolejki QC</strong>
            <span>
              Zmien filtr albo poczekaj na nowe detale, aby zobaczyc elementy
              gotowe do kontroli bez przepisywania barcode.
            </span>
          </div>
        ) : (
          <div className="qc-waiting-list" data-testid="qc-waiting-list">
            {filteredWaitingItems.map((item) => {
              const isSelected = selectedItem?.item_serial_number === item.item_serial_number;
              const isReservedByOtherOperator =
                !!authStateOperatorId &&
                isWaitingItemReservedByOtherOperator(item, authStateOperatorId);
              return (
                <button
                  key={item.item_serial_number}
                  className={`qc-waiting-item${isSelected ? " is-selected" : ""}`}
                  type="button"
                  onClick={() => onPickWaitingItem(item)}
                  disabled={isReservedByOtherOperator}
                >
                  <div className="qc-waiting-item-copy">
                    <strong>{item.item_serial_number}</strong>
                    <span>
                      {labelForCode(item.item_type)} | {item.barcode_value}
                    </span>
                  </div>
                  <div className="qc-waiting-item-meta">
                    <span>{labelForCode(item.current_status)}</span>
                    {item.qc_reserved_by_operator_id ? (
                      <span>Zarezerwowane: {formatWaitingItemReservationLabel(item)}</span>
                    ) : (
                      <span>Wolny detal</span>
                    )}
                    <span>{formatDateTime(item.produced_at ?? item.created_at)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {lookupError ? (
          <div className="error-banner" role="alert">
            <strong>Nie udalo sie pobrac komponentu.</strong>
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
              <span>Status biezacy</span>
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
            <div className="detail-card">
              <span>Rezerwacja QC</span>
              <strong>
                {selectedItem.qc_reserved_by_operator_id
                  ? `${selectedItem.qc_reserved_by_operator_id} @ ${selectedItem.qc_reserved_by_workstation_id ?? "brak stanowiska"}`
                  : "Brak rezerwacji"}
              </strong>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <strong>Brak wybranego komponentu</strong>
            <span>
              Zeskanuj barcode, aby pobrac detal do kontroli i zapisac wynik QC.
            </span>
          </div>
        )}
        {selectedItem ? (
          <div className="details-inline-actions">
            {selectedItemReservedByCurrentOperator ? (
              <button className="ghost-button" type="button" onClick={onReleaseSelectedItemReservation}>
                Zwolnij rezerwacje
              </button>
            ) : (
              <button
                className="ghost-button"
                type="button"
                onClick={onReserveSelectedItem}
                disabled={selectedItemReservedByOtherOperator}
              >
                Zarezerwuj detal
              </button>
            )}
            <span className={`status-badge state-${reservationState}`}>
              {reservationState === "loading"
                ? "Rezerwuje"
                : reservationState === "loaded"
                  ? "Rezerwacja OK"
                  : reservationState === "error"
                    ? "Blad rezerwacji"
                    : selectedItemReservedByCurrentOperator
                      ? "Zarezerwowany przeze mnie"
                      : selectedItemReservedByOtherOperator
                        ? "Zarezerwowany przez innego"
                        : "Bez rezerwacji"}
            </span>
          </div>
        ) : null}
        {reservationError ? (
          <div className="error-banner" role="alert">
            <strong>Nie udalo sie obsluzyc rezerwacji detalu.</strong>
            <span>{reservationError}</span>
          </div>
        ) : null}
        {reservationSuccess ? (
          <div className="success-banner" role="status">
            <strong>{reservationSuccess}</strong>
          </div>
        ) : null}

        {shouldShowReworkPanel ? (
          <div className="detail-inline-card qc-run-decision-card">
            <div className="detail-inline-header">
              <strong>2a. NCR i decyzja rework</strong>
              <span className={`status-badge state-${openCriticalNcrsState}`}>
                {openCriticalNcrsState === "loading"
                  ? "Sprawdzam NCR"
                  : openCriticalNcrs.length > 0
                    ? `${openCriticalNcrs.length} NCR`
                    : selectedItem?.current_status === "REWORK_REQUIRED"
                      ? "Rework gotowy"
                      : "Brak otwartego NCR"}
              </span>
            </div>
            <p>
              Ten panel sluzy do domkniecia krytycznych NCR po poprawkach i
              przywrocenia detalu do kolejki ponownej kontroli.
            </p>

            {openCriticalNcrsError ? (
              <div className="error-banner" role="alert">
                <strong>Nie udalo sie pobrac NCR dla detalu.</strong>
                <span>{openCriticalNcrsError}</span>
              </div>
            ) : null}

            {openCriticalNcrs.length > 0 ? (
              <div className="qc-evidence-list">
                {openCriticalNcrs.map((ncr) => (
                  <div key={ncr.ncr_id} className="qc-evidence-item">
                    <div className="qc-evidence-item-copy">
                      <strong>{ncr.ncr_id}</strong>
                      <span>
                        {labelForCode(ncr.severity)} | {labelForCode(ncr.status)} |{" "}
                        {labelForCode(ncr.process_stage ?? "QC")}
                      </span>
                      <span>{ncr.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="details-inline-actions">
                <span className="action-hint">
                  {selectedItem?.current_status === "REWORK_REQUIRED"
                    ? "Detal jest juz oznaczony do reworku i pozostaje w kolejce ponownej kontroli."
                    : "Dla tego detalu nie ma obecnie otwartego krytycznego NCR."}
                </span>
              </div>
            )}

            {canReleaseSelectedItemForRework ? (
              <div className="qc-station-form-grid">
                <label className="field qc-step-comment-field">
                  <span>Akcja korygujaca po reworku</span>
                  <textarea
                    value={reworkAction}
                    onChange={(event) => onReworkActionChange(event.target.value)}
                    placeholder="Opisz wykonany rework, naprawe albo decyzje serwisowa przed ponowna kontrola."
                  />
                </label>
              </div>
            ) : null}

            {reworkActionError ? (
              <div className="error-banner" role="alert">
                <strong>Nie udalo sie przygotowac detalu do reworku.</strong>
                <span>{reworkActionError}</span>
              </div>
            ) : null}

            {reworkActionSuccess ? (
              <div className="qc-auth-banner" role="status">
                <strong>{reworkActionSuccess}</strong>
              </div>
            ) : null}

            {canReleaseSelectedItemForRework ? (
              <div className="details-inline-actions">
                <button
                  className="primary-button"
                  type="button"
                  disabled={reworkActionState === "loading"}
                  onClick={onReleaseForRework}
                >
                  {openCriticalNcrs.length > 0
                    ? "Zamknij NCR i przywroc do reworku"
                    : "Przywroc detal do reworku"}
                </button>
                <span className={`status-badge state-${reworkActionState}`}>
                  {reworkActionState === "loading"
                    ? "Zapisuje"
                    : reworkActionState === "loaded"
                      ? "Rework OK"
                      : reworkActionState === "error"
                        ? "Blad"
                        : "Gotowe"}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        {historyPanel}
      </div>
    </section>
  );
}
