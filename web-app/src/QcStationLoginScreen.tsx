import type { FormEvent } from "react";

import type { LoadState, WorkstationRead } from "./api";

interface QcStationLoginScreenProps {
  authSubmitState: LoadState;
  contextState: LoadState;
  activeWorkstations: WorkstationRead[];
  selectedWorkstationId: string;
  manualLoginName: string;
  manualPassword: string;
  rfidUidHash: string;
  onSelectedWorkstationIdChange: (value: string) => void;
  onManualLoginNameChange: (value: string) => void;
  onManualPasswordChange: (value: string) => void;
  onRfidUidHashChange: (value: string) => void;
  onManualLoginSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRfidSubmit: (event: FormEvent<HTMLFormElement>) => void;
  formatWorkstationLabel: (workstation: WorkstationRead) => string;
}

export function QcStationLoginScreen({
  authSubmitState,
  contextState,
  activeWorkstations,
  selectedWorkstationId,
  manualLoginName,
  manualPassword,
  rfidUidHash,
  onSelectedWorkstationIdChange,
  onManualLoginNameChange,
  onManualPasswordChange,
  onRfidUidHashChange,
  onManualLoginSubmit,
  onRfidSubmit,
  formatWorkstationLabel,
}: QcStationLoginScreenProps) {
  return (
    <section className="qc-login-grid">
      <article className="filters-card qc-login-card">
        <div className="section-heading">
          <h2>1. Logowanie operatora</h2>
          <span className={`status-badge state-${authSubmitState}`}>
            {authSubmitState === "loading"
              ? "Logowanie"
              : authSubmitState === "loaded"
                ? "Dostep OK"
                : authSubmitState === "error"
                  ? "Blad"
                  : "Gotowe"}
          </span>
        </div>
        <form className="qc-login-stack" onSubmit={onManualLoginSubmit}>
          <label className="field">
            <span>Stanowisko QC</span>
            <select
              value={selectedWorkstationId}
              onChange={(event) => onSelectedWorkstationIdChange(event.target.value)}
              disabled={activeWorkstations.length === 0}
            >
              {activeWorkstations.length === 0 ? (
                <option value="">
                  {contextState === "loading"
                    ? "Ladowanie stanowisk..."
                    : "Brak aktywnego stanowiska QC"}
                </option>
              ) : (
                activeWorkstations.map((workstation) => (
                  <option
                    key={workstation.workstation_id}
                    value={workstation.workstation_id}
                  >
                    {formatWorkstationLabel(workstation)}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="field">
            <span>Login</span>
            <input
              value={manualLoginName}
              onChange={(event) => onManualLoginNameChange(event.target.value)}
              placeholder="np. qc-demo-local"
              autoComplete="username"
            />
          </label>
          <label className="field">
            <span>Haslo</span>
            <input
              value={manualPassword}
              onChange={(event) => onManualPasswordChange(event.target.value)}
              placeholder="Haslo operatora"
              autoComplete="current-password"
              type="password"
            />
          </label>
          <div className="details-inline-actions">
            <button className="primary-button" type="submit">
              Wejdz do aplikacji
            </button>
          </div>
        </form>
      </article>

      <article className="filters-card qc-login-card">
        <div className="section-heading">
          <h2>2. Logowanie RFID</h2>
          <span className="status-badge">Autowypelnienie</span>
        </div>
        <p className="details-subtitle">
          Czytnik RFID dzialajacy jako klawiatura moze wpisac UID do aktywnego
          pola. Po odczycie system wypelni login operatora i od razu przyzna
          dostep do stanowiska kontroli.
        </p>
        <form className="qc-login-stack" onSubmit={onRfidSubmit}>
          <label className="field">
            <span>Odczyt RFID</span>
            <input
              className="rfid-listener-input"
              value={rfidUidHash}
              onChange={(event) => onRfidUidHashChange(event.target.value)}
              placeholder="Przyluz karte albo wpisz UID"
            />
          </label>
          <div className="details-inline-actions">
            <button className="ghost-button" type="submit">
              Zaloguj przez RFID
            </button>
          </div>
          <span className="action-hint">
            Dla lokalnego demo seed zwraca dedykowane dane logowania i RFID dla
            stanowiska QC.
          </span>
        </form>
      </article>
    </section>
  );
}
