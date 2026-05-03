import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import {
  createOperator,
  createWorkstation,
  listOperators,
  listWorkstations,
  updateOperator,
  updateWorkstation,
} from "./api";
import type {
  LoadState,
  OperatorCreatePayload,
  OperatorRead,
  OperatorUpdatePayload,
  WorkstationCreatePayload,
  WorkstationRead,
  WorkstationUpdatePayload,
} from "./api";

const API_STORAGE_KEY = "servicetrace.web.apiBaseUrl";
const DEFAULT_API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
const ROLE_OPTIONS = [
  "ADMIN",
  "QUALITY_INSPECTOR",
  "QUALITY_MANAGER",
  "PRODUCTION_OPERATOR",
  "FINAL_TEST_OPERATOR",
] as const;

type AdminTab = "operators" | "workstations";

interface OperatorFormState {
  operator_id: string;
  full_name: string;
  role: string;
  login_name: string;
  password: string;
  rfid_uid_hash: string;
  is_active: boolean;
}

interface WorkstationFormState {
  workstation_id: string;
  name: string;
  area: string;
  station_type: string;
  is_active: boolean;
}

const DEFAULT_OPERATOR_FORM: OperatorFormState = {
  operator_id: "",
  full_name: "",
  role: "QUALITY_INSPECTOR",
  login_name: "",
  password: "",
  rfid_uid_hash: "",
  is_active: true,
};

const DEFAULT_WORKSTATION_FORM: WorkstationFormState = {
  workstation_id: "",
  name: "",
  area: "QA",
  station_type: "QC",
  is_active: true,
};

export function AdminPage() {
  const [apiBaseUrl, setApiBaseUrl] = useState(
    () => localStorage.getItem(API_STORAGE_KEY) ?? DEFAULT_API_BASE_URL,
  );
  const [activeTab, setActiveTab] = useState<AdminTab>("operators");
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [operators, setOperators] = useState<OperatorRead[]>([]);
  const [workstations, setWorkstations] = useState<WorkstationRead[]>([]);
  const [operatorForm, setOperatorForm] =
    useState<OperatorFormState>(DEFAULT_OPERATOR_FORM);
  const [workstationForm, setWorkstationForm] = useState<WorkstationFormState>(
    DEFAULT_WORKSTATION_FORM,
  );
  const [editingOperatorId, setEditingOperatorId] = useState<string | null>(null);
  const [editingWorkstationId, setEditingWorkstationId] = useState<string | null>(
    null,
  );
  const [saveState, setSaveState] = useState<LoadState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(API_STORAGE_KEY, apiBaseUrl);
  }, [apiBaseUrl]);

  useEffect(() => {
    const trimmedApiBaseUrl = apiBaseUrl.trim();
    if (!trimmedApiBaseUrl) {
      setLoadState("idle");
      setLoadError("Podaj adres API, aby zaladowac panel administracyjny.");
      setOperators([]);
      setWorkstations([]);
      return;
    }

    const controller = new AbortController();
    let isCurrentRequest = true;
    setLoadState("loading");
    setLoadError(null);

    Promise.all([
      listOperators(trimmedApiBaseUrl, controller.signal),
      listWorkstations(trimmedApiBaseUrl, controller.signal),
    ])
      .then(([operatorRows, workstationRows]) => {
        if (!isCurrentRequest) {
          return;
        }

        setOperators(operatorRows);
        setWorkstations(workstationRows);
        setLoadState("loaded");
      })
      .catch((error: unknown) => {
        if (!isCurrentRequest || controller.signal.aborted) {
          return;
        }

        setLoadState("error");
        setLoadError(
          getErrorMessage(error, "Nie udalo sie zaladowac operatorow i stanowisk."),
        );
        setOperators([]);
        setWorkstations([]);
      });

    return () => {
      isCurrentRequest = false;
      controller.abort();
    };
  }, [apiBaseUrl]);

  const operatorCount = operators.length;
  const activeOperatorCount = operators.filter((operator) => operator.is_active).length;
  const workstationCount = workstations.length;
  const activeWorkstationCount = workstations.filter(
    (workstation) => workstation.is_active,
  ).length;

  async function refreshAdminData(): Promise<void> {
    const trimmedApiBaseUrl = apiBaseUrl.trim();
    const [operatorRows, workstationRows] = await Promise.all([
      listOperators(trimmedApiBaseUrl),
      listWorkstations(trimmedApiBaseUrl),
    ]);
    setOperators(operatorRows);
    setWorkstations(workstationRows);
  }

  async function handleOperatorSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedApiBaseUrl = apiBaseUrl.trim();
    if (!trimmedApiBaseUrl) {
      setSaveError("Podaj adres API.");
      return;
    }

    if (!operatorForm.operator_id.trim() && !editingOperatorId) {
      setSaveError("Operator ID jest wymagane.");
      return;
    }
    if (!operatorForm.full_name.trim()) {
      setSaveError("Imie i nazwisko operatora jest wymagane.");
      return;
    }

    setSaveState("loading");
    setSaveError(null);
    setSaveSuccess(null);

    try {
      if (editingOperatorId) {
        const payload: OperatorUpdatePayload = {
          full_name: operatorForm.full_name.trim(),
          role: operatorForm.role,
          login_name: normalizeOptionalString(operatorForm.login_name),
          rfid_uid_hash: normalizeOptionalString(operatorForm.rfid_uid_hash),
          is_active: operatorForm.is_active,
          ...(operatorForm.password.trim()
            ? { password: operatorForm.password.trim() }
            : {}),
        };
        await updateOperator(trimmedApiBaseUrl, editingOperatorId, payload);
        setSaveSuccess(`Zapisano operatora ${editingOperatorId}.`);
      } else {
        const payload: OperatorCreatePayload = {
          operator_id: operatorForm.operator_id.trim(),
          full_name: operatorForm.full_name.trim(),
          role: operatorForm.role,
          login_name: normalizeOptionalString(operatorForm.login_name),
          rfid_uid_hash: normalizeOptionalString(operatorForm.rfid_uid_hash),
          is_active: operatorForm.is_active,
          ...(operatorForm.password.trim()
            ? { password: operatorForm.password.trim() }
            : {}),
        };
        await createOperator(trimmedApiBaseUrl, payload);
        setSaveSuccess(`Dodano operatora ${payload.operator_id}.`);
      }

      await refreshAdminData();
      resetOperatorForm();
      setSaveState("loaded");
    } catch (error) {
      setSaveState("error");
      setSaveError(getErrorMessage(error, "Nie udalo sie zapisac operatora."));
    }
  }

  async function handleWorkstationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedApiBaseUrl = apiBaseUrl.trim();
    if (!trimmedApiBaseUrl) {
      setSaveError("Podaj adres API.");
      return;
    }

    if (!workstationForm.workstation_id.trim() && !editingWorkstationId) {
      setSaveError("ID stanowiska jest wymagane.");
      return;
    }
    if (!workstationForm.name.trim()) {
      setSaveError("Nazwa stanowiska jest wymagana.");
      return;
    }

    setSaveState("loading");
    setSaveError(null);
    setSaveSuccess(null);

    try {
      if (editingWorkstationId) {
        const payload: WorkstationUpdatePayload = {
          name: workstationForm.name.trim(),
          area: normalizeOptionalString(workstationForm.area),
          station_type: normalizeOptionalString(workstationForm.station_type),
          is_active: workstationForm.is_active,
        };
        await updateWorkstation(trimmedApiBaseUrl, editingWorkstationId, payload);
        setSaveSuccess(`Zapisano stanowisko ${editingWorkstationId}.`);
      } else {
        const payload: WorkstationCreatePayload = {
          workstation_id: workstationForm.workstation_id.trim(),
          name: workstationForm.name.trim(),
          area: normalizeOptionalString(workstationForm.area),
          station_type: normalizeOptionalString(workstationForm.station_type),
        };
        await createWorkstation(trimmedApiBaseUrl, payload);
        setSaveSuccess(`Dodano stanowisko ${payload.workstation_id}.`);
      }

      await refreshAdminData();
      resetWorkstationForm();
      setSaveState("loaded");
    } catch (error) {
      setSaveState("error");
      setSaveError(getErrorMessage(error, "Nie udalo sie zapisac stanowiska."));
    }
  }

  function resetOperatorForm() {
    setEditingOperatorId(null);
    setOperatorForm(DEFAULT_OPERATOR_FORM);
  }

  function resetWorkstationForm() {
    setEditingWorkstationId(null);
    setWorkstationForm(DEFAULT_WORKSTATION_FORM);
  }

  function startOperatorEdit(operator: OperatorRead) {
    setActiveTab("operators");
    setEditingOperatorId(operator.operator_id);
    setOperatorForm({
      operator_id: operator.operator_id,
      full_name: operator.full_name,
      role: operator.role,
      login_name: operator.login_name ?? "",
      password: "",
      rfid_uid_hash: operator.rfid_uid_hash ?? "",
      is_active: operator.is_active,
    });
    setSaveError(null);
    setSaveSuccess(null);
  }

  function startWorkstationEdit(workstation: WorkstationRead) {
    setActiveTab("workstations");
    setEditingWorkstationId(workstation.workstation_id);
    setWorkstationForm({
      workstation_id: workstation.workstation_id,
      name: workstation.name,
      area: workstation.area ?? "",
      station_type: workstation.station_type ?? "",
      is_active: workstation.is_active,
    });
    setSaveError(null);
    setSaveSuccess(null);
  }

  return (
    <main className="app-shell admin-shell">
      <section className="hero qc-station-hero">
        <div className="hero-copy">
          <p className="eyebrow">Administracja QC</p>
          <h1>Panel do zarzadzania operatorami i stanowiskami kontroli jakosci.</h1>
          <p>
            Tutaj mozna dodawac i edytowac operatorow, loginy, RFID oraz stanowiska
            QC bez recznego wywolywania endpointow API.
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
            <span>Panel: Operatorzy + Stanowiska QC</span>
            <span>
              Status danych: {loadState === "loading" ? "ladowanie" : loadState}
            </span>
          </div>
          <div className="details-inline-actions">
            <a className="ghost-button button-link" href="/">
              Wroc do dashboardu
            </a>
            <a className="ghost-button button-link" href="/qc-station">
              Otworz stanowisko QC
            </a>
          </div>
        </div>
      </section>

      {loadError ? (
        <div className="error-banner" role="alert">
          <strong>Panel administracyjny nie zaladowal danych.</strong>
          <span>{loadError}</span>
        </div>
      ) : null}

      {saveError ? (
        <div className="error-banner" role="alert">
          <strong>Nie udalo sie zapisac zmian.</strong>
          <span>{saveError}</span>
        </div>
      ) : null}

      {saveSuccess ? (
        <section className="qc-auth-banner" role="status">
          <strong>{saveSuccess}</strong>
        </section>
      ) : null}

      <section className="workspace">
        <nav className="view-switch" aria-label="Zakladki administracji">
          <button
            className={activeTab === "operators" ? "is-active" : ""}
            type="button"
            onClick={() => setActiveTab("operators")}
          >
            Operatorzy
          </button>
          <button
            className={activeTab === "workstations" ? "is-active" : ""}
            type="button"
            onClick={() => setActiveTab("workstations")}
          >
            Stanowiska QC
          </button>
        </nav>

        <div className="summary-grid">
          <div className="metric-card">
            <span>Operatorzy</span>
            <strong>{operatorCount}</strong>
            <small>Aktywni: {activeOperatorCount}</small>
          </div>
          <div className="metric-card">
            <span>Stanowiska QC</span>
            <strong>{workstationCount}</strong>
            <small>Aktywne: {activeWorkstationCount}</small>
          </div>
        </div>

        {activeTab === "operators" ? (
          <section className="admin-grid">
            <div className="filters-card admin-list-card">
              <div className="section-heading">
                <h2>Lista operatorow</h2>
                <div className="details-inline-actions">
                  <span className="status-badge">{operatorCount} rekordow</span>
                  <button className="ghost-button" type="button" onClick={resetOperatorForm}>
                    Nowy operator
                  </button>
                </div>
              </div>
              <div className="admin-list">
                {operators.map((operator) => (
                  <article className="detail-inline-card admin-row" key={operator.operator_id}>
                    <div className="detail-inline-header">
                      <strong>{operator.full_name}</strong>
                      <span
                        className={`status-badge ${operator.is_active ? "" : "state-error"}`}
                      >
                        {operator.is_active ? "AKTYWNY" : "NIEAKTYWNY"}
                      </span>
                    </div>
                    <p>
                      ID {operator.operator_id} | rola {operator.role}
                    </p>
                    <p>
                      Login {operator.login_name ?? "-"} | RFID {operator.rfid_uid_hash ?? "-"}
                    </p>
                    <div className="details-inline-actions">
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => startOperatorEdit(operator)}
                      >
                        Edytuj
                      </button>
                    </div>
                  </article>
                ))}
                {operators.length === 0 ? (
                  <p className="details-subtitle">Brak operatorow do wyswietlenia.</p>
                ) : null}
              </div>
            </div>

            <div className="filters-card admin-form-card">
              <div className="section-heading">
                <h2>{editingOperatorId ? "Edytuj operatora" : "Dodaj operatora"}</h2>
                {editingOperatorId ? (
                  <button className="ghost-button" type="button" onClick={resetOperatorForm}>
                    Anuluj edycje
                  </button>
                ) : null}
              </div>
              <form className="admin-form-grid" onSubmit={handleOperatorSubmit}>
                <label className="field">
                  <span>Operator ID</span>
                  <input
                    value={operatorForm.operator_id}
                    onChange={(event) =>
                      setOperatorForm((current) => ({
                        ...current,
                        operator_id: event.target.value,
                      }))
                    }
                    placeholder="np. QCOP-LINIA-01"
                    disabled={editingOperatorId !== null}
                  />
                </label>
                <label className="field">
                  <span>Imie i nazwisko</span>
                  <input
                    value={operatorForm.full_name}
                    onChange={(event) =>
                      setOperatorForm((current) => ({
                        ...current,
                        full_name: event.target.value,
                      }))
                    }
                    placeholder="np. Jan Kowalski"
                  />
                </label>
                <label className="field">
                  <span>Rola</span>
                  <select
                    value={operatorForm.role}
                    onChange={(event) =>
                      setOperatorForm((current) => ({
                        ...current,
                        role: event.target.value,
                      }))
                    }
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Login</span>
                  <input
                    value={operatorForm.login_name}
                    onChange={(event) =>
                      setOperatorForm((current) => ({
                        ...current,
                        login_name: event.target.value,
                      }))
                    }
                    placeholder="np. qc-linia-01"
                  />
                </label>
                <label className="field">
                  <span>{editingOperatorId ? "Nowe haslo" : "Haslo"}</span>
                  <input
                    type="password"
                    value={operatorForm.password}
                    onChange={(event) =>
                      setOperatorForm((current) => ({
                        ...current,
                        password: event.target.value,
                      }))
                    }
                    placeholder={
                      editingOperatorId
                        ? "Zostaw puste, aby nie zmieniac hasla"
                        : "np. Secret123!"
                    }
                  />
                </label>
                <label className="field">
                  <span>RFID</span>
                  <input
                    value={operatorForm.rfid_uid_hash}
                    onChange={(event) =>
                      setOperatorForm((current) => ({
                        ...current,
                        rfid_uid_hash: event.target.value,
                      }))
                    }
                    placeholder="np. QCRFID-LINIA-01"
                  />
                </label>
                <label className="field checkbox-field">
                  <input
                    type="checkbox"
                    checked={operatorForm.is_active}
                    onChange={(event) =>
                      setOperatorForm((current) => ({
                        ...current,
                        is_active: event.target.checked,
                      }))
                    }
                  />
                  <span>Operator aktywny</span>
                </label>
                <div className="details-inline-actions">
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={saveState === "loading"}
                  >
                    {editingOperatorId ? "Zapisz operatora" : "Dodaj operatora"}
                  </button>
                </div>
              </form>
            </div>
          </section>
        ) : (
          <section className="admin-grid">
            <div className="filters-card admin-list-card">
              <div className="section-heading">
                <h2>Lista stanowisk QC</h2>
                <div className="details-inline-actions">
                  <span className="status-badge">{workstationCount} rekordow</span>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={resetWorkstationForm}
                  >
                    Nowe stanowisko
                  </button>
                </div>
              </div>
              <div className="admin-list">
                {workstations.map((workstation) => (
                  <article
                    className="detail-inline-card admin-row"
                    key={workstation.workstation_id}
                  >
                    <div className="detail-inline-header">
                      <strong>{workstation.name}</strong>
                      <span
                        className={`status-badge ${workstation.is_active ? "" : "state-error"}`}
                      >
                        {workstation.is_active ? "AKTYWNE" : "NIEAKTYWNE"}
                      </span>
                    </div>
                    <p>
                      ID {workstation.workstation_id} | obszar {workstation.area ?? "-"}
                    </p>
                    <p>Typ stanowiska {workstation.station_type ?? "-"}</p>
                    <div className="details-inline-actions">
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => startWorkstationEdit(workstation)}
                      >
                        Edytuj
                      </button>
                    </div>
                  </article>
                ))}
                {workstations.length === 0 ? (
                  <p className="details-subtitle">Brak stanowisk do wyswietlenia.</p>
                ) : null}
              </div>
            </div>

            <div className="filters-card admin-form-card">
              <div className="section-heading">
                <h2>
                  {editingWorkstationId ? "Edytuj stanowisko" : "Dodaj stanowisko QC"}
                </h2>
                {editingWorkstationId ? (
                  <button className="ghost-button" type="button" onClick={resetWorkstationForm}>
                    Anuluj edycje
                  </button>
                ) : null}
              </div>
              <form className="admin-form-grid" onSubmit={handleWorkstationSubmit}>
                <label className="field">
                  <span>Stanowisko ID</span>
                  <input
                    value={workstationForm.workstation_id}
                    onChange={(event) =>
                      setWorkstationForm((current) => ({
                        ...current,
                        workstation_id: event.target.value,
                      }))
                    }
                    placeholder="np. QCWS-LINIA-01"
                    disabled={editingWorkstationId !== null}
                  />
                </label>
                <label className="field">
                  <span>Nazwa</span>
                  <input
                    value={workstationForm.name}
                    onChange={(event) =>
                      setWorkstationForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="np. Linia kontroli 1"
                  />
                </label>
                <label className="field">
                  <span>Obszar</span>
                  <input
                    value={workstationForm.area}
                    onChange={(event) =>
                      setWorkstationForm((current) => ({
                        ...current,
                        area: event.target.value,
                      }))
                    }
                    placeholder="np. QA"
                  />
                </label>
                <label className="field">
                  <span>Typ stanowiska</span>
                  <input
                    value={workstationForm.station_type}
                    onChange={(event) =>
                      setWorkstationForm((current) => ({
                        ...current,
                        station_type: event.target.value,
                      }))
                    }
                    placeholder="np. QC"
                  />
                </label>
                <label className="field checkbox-field">
                  <input
                    type="checkbox"
                    checked={workstationForm.is_active}
                    onChange={(event) =>
                      setWorkstationForm((current) => ({
                        ...current,
                        is_active: event.target.checked,
                      }))
                    }
                  />
                  <span>Stanowisko aktywne</span>
                </label>
                <div className="details-inline-actions">
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={saveState === "loading"}
                  >
                    {editingWorkstationId ? "Zapisz stanowisko" : "Dodaj stanowisko"}
                  </button>
                </div>
              </form>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

function normalizeOptionalString(value: string): string | null {
  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : null;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
