import { useEffect, useState } from "react";
import type { ChangeEvent, CSSProperties, ReactNode } from "react";

import {
  buildQuery,
  fetchJson,
  joinApiUrl,
  optionalBoolean,
} from "./api";
import type {
  DashboardMode,
  DeviceComponentQuality,
  DeviceComponentQualityQueue,
  DeviceShipmentQueue,
  DeviceShipmentReadiness,
  LoadState,
  QueryValue,
} from "./api";
import {
  formatDateTime,
  formatNumber,
  labelForCode,
  percentage,
} from "./dashboard";

import "./App.css";

const API_STORAGE_KEY = "servicetrace.web.apiBaseUrl";
const DEFAULT_API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

const PRODUCTION_STATUS_OPTIONS = [
  "CREATED",
  "FINAL_TEST_PASSED",
  "READY_FOR_SHIPMENT",
  "SHIPPED",
];

const SHIPMENT_BLOCKING_OPTIONS = [
  "FINAL_TEST_NOT_PASSED",
  "BOM_TEMPLATE_NOT_EFFECTIVE",
  "BOM_REQUIRED_COMPONENTS_MISSING",
  "BOM_OVER_INSTALLED_COMPONENTS",
  "BOM_UNEXPECTED_COMPONENTS",
  "CRITICAL_OPEN_NCR",
  "COMPONENT_QC_NOT_PASSED",
  "COMPONENT_CRITICAL_OPEN_NCR",
];

const SHIPMENT_ACTION_OPTIONS = [
  "MARK_READY_FOR_SHIPMENT",
  "COMPLETE_ASSEMBLY",
  "RUN_FINAL_TEST",
  "RESOLVE_CRITICAL_NCR",
  "RESOLVE_COMPONENT_QUALITY",
  "ACTIVATE_OR_CONFIGURE_BOM",
  "FIX_ASSEMBLY_MISMATCH",
];

const COMPONENT_ACTION_OPTIONS = [
  "NO_ACTION",
  "RUN_COMPONENT_QC_OR_REWORK",
  "RESOLVE_COMPONENT_NCR",
];

const COMPONENT_STATUS_OPTIONS = [
  "PASS",
  "QC_NOT_PASSED",
  "CRITICAL_NCR_OPEN",
];

const COMPONENT_STALE_OPTIONS = ["LT_24H", "D1_TO_D3", "D3_TO_D7", "GT_7D"];

const SHIPMENT_SORT_OPTIONS = [
  "created_at",
  "device_serial_number",
  "priority",
  "recommended_action",
];

const COMPONENT_SORT_OPTIONS = [
  "blocked_components",
  "created_at",
  "updated_at",
  "device_serial_number",
  "passes_component_quality_gate",
  "production_status",
  "primary_blocking_component_type",
  "primary_blocking_component_serial_number",
  "stale_bucket",
  "variant_code",
  "recommended_action",
];

type OptionalBooleanString = "" | "true" | "false";

interface ShipmentFilters {
  device_type: string;
  variant_code: string;
  production_status: string;
  primary_blocking_code: string;
  recommended_action: string;
  latest_gate_result: string;
  only_blocked: boolean;
  only_ready: boolean;
  sort_by: string;
  sort_desc: boolean;
  limit: number;
  offset: number;
}

interface ComponentFilters {
  device_type: string;
  variant_code: string;
  production_status: string;
  blocking_component_type: string;
  primary_quality_status: string;
  stale_bucket: string;
  recommended_action: string;
  passes_component_quality_gate: OptionalBooleanString;
  only_blocking: boolean;
  sort_by: string;
  sort_desc: boolean;
  limit: number;
  offset: number;
}

const DEFAULT_SHIPMENT_FILTERS: ShipmentFilters = {
  device_type: "",
  variant_code: "",
  production_status: "",
  primary_blocking_code: "",
  recommended_action: "",
  latest_gate_result: "",
  only_blocked: false,
  only_ready: false,
  sort_by: "created_at",
  sort_desc: true,
  limit: 100,
  offset: 0,
};

const DEFAULT_COMPONENT_FILTERS: ComponentFilters = {
  device_type: "",
  variant_code: "",
  production_status: "",
  blocking_component_type: "",
  primary_quality_status: "",
  stale_bucket: "",
  recommended_action: "",
  passes_component_quality_gate: "",
  only_blocking: true,
  sort_by: "blocked_components",
  sort_desc: true,
  limit: 100,
  offset: 0,
};

export function App() {
  const [activeView, setActiveView] = useState<DashboardMode>("shipment");
  const [apiBaseUrl, setApiBaseUrl] = useState(() => {
    return localStorage.getItem(API_STORAGE_KEY) ?? DEFAULT_API_BASE_URL;
  });
  const [shipmentFilters, setShipmentFilters] = useState(
    DEFAULT_SHIPMENT_FILTERS,
  );
  const [componentFilters, setComponentFilters] = useState(
    DEFAULT_COMPONENT_FILTERS,
  );
  const [shipmentData, setShipmentData] = useState<DeviceShipmentQueue | null>(
    null,
  );
  const [componentData, setComponentData] =
    useState<DeviceComponentQualityQueue | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const clearActiveViewData = (view: DashboardMode) => {
    if (view === "shipment") {
      setShipmentData(null);
      return;
    }

    setComponentData(null);
  };

  useEffect(() => {
    localStorage.setItem(API_STORAGE_KEY, apiBaseUrl);
  }, [apiBaseUrl]);

  useEffect(() => {
    if (!apiBaseUrl.trim()) {
      clearActiveViewData(activeView);
      setLoadState("error");
      setErrorMessage("Podaj bazowy adres API.");
      return;
    }

    const controller = new AbortController();
    let isCurrentRequest = true;
    const path =
      activeView === "shipment" ? "/shipment-readiness" : "/component-quality";
    const params =
      activeView === "shipment"
        ? shipmentQueryParams(shipmentFilters)
        : componentQueryParams(componentFilters);
    const url = joinApiUrl(apiBaseUrl.trim(), path) + buildQuery(params);

    setLoadState("loading");
    setErrorMessage(null);

    fetchJson<DeviceShipmentQueue | DeviceComponentQualityQueue>(
      url,
      controller.signal,
    )
      .then((payload) => {
        if (!isCurrentRequest) {
          return;
        }

        if (activeView === "shipment") {
          setShipmentData(payload as DeviceShipmentQueue);
        } else {
          setComponentData(payload as DeviceComponentQualityQueue);
        }
        setLoadState("loaded");
      })
      .catch((error: unknown) => {
        if (!isCurrentRequest || isAbortError(error)) {
          return;
        }

        clearActiveViewData(activeView);
        setLoadState("error");
        setErrorMessage(error instanceof Error ? error.message : String(error));
      });

    return () => {
      isCurrentRequest = false;
      controller.abort();
    };
  }, [
    activeView,
    apiBaseUrl,
    shipmentFilters,
    componentFilters,
    refreshVersion,
  ]);

  const updateShipmentFilter = <Key extends keyof ShipmentFilters>(
    key: Key,
    value: ShipmentFilters[Key],
  ) => {
    setShipmentFilters((previous) => {
      const normalizedValue =
        key === "limit"
          ? (clampLimit(value as number) as ShipmentFilters[Key])
          : value;
      const next = {
        ...previous,
        [key]: normalizedValue,
      } as ShipmentFilters;
      if (key !== "offset") {
        next.offset = 0;
      }
      return next;
    });
  };

  const updateComponentFilter = <Key extends keyof ComponentFilters>(
    key: Key,
    value: ComponentFilters[Key],
  ) => {
    setComponentFilters((previous) => {
      const normalizedValue =
        key === "limit"
          ? (clampLimit(value as number) as ComponentFilters[Key])
          : value;
      const next = {
        ...previous,
        [key]: normalizedValue,
      } as ComponentFilters;
      if (key !== "offset") {
        next.offset = 0;
      }
      return next;
    });
  };

  return (
    <main className="app-shell">
      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">ServiceTrace Operations</p>
          <h1>Panel gotowości wysyłki i jakości komponentów</h1>
          <p>
            Jedno miejsce do pilnowania blokad BOM, final testu, NCR i jakości
            zamontowanych komponentów przed wysyłką urządzeń.
          </p>
        </div>
        <section className="control-deck" aria-label="Ustawienia API">
          <StatusBadge loadState={loadState} />
          <label className="api-field">
            <span>API base</span>
            <input
              value={apiBaseUrl}
              onChange={(event) => setApiBaseUrl(event.target.value)}
              spellCheck={false}
            />
          </label>
          <button
            className="primary-button"
            type="button"
            onClick={() => setRefreshVersion((value) => value + 1)}
          >
            Odśwież
          </button>
        </section>
      </header>

      <section className="workspace">
        <nav className="view-switch" aria-label="Widok panelu">
          <button
            className={activeView === "shipment" ? "is-active" : ""}
            type="button"
            onClick={() => setActiveView("shipment")}
          >
            Wysyłka
          </button>
          <button
            className={activeView === "components" ? "is-active" : ""}
            type="button"
            onClick={() => setActiveView("components")}
          >
            Komponenty
          </button>
        </nav>

        {errorMessage ? (
          <div className="error-banner" role="alert">
            <strong>API zwróciło problem.</strong>
            <span>{errorMessage}</span>
          </div>
        ) : null}

        {activeView === "shipment" ? (
          <>
            <ShipmentFiltersPanel
              filters={shipmentFilters}
              onChange={updateShipmentFilter}
              onReset={() => setShipmentFilters(DEFAULT_SHIPMENT_FILTERS)}
            />
            <ShipmentDashboard
              data={shipmentData}
              isLoading={loadState === "loading"}
              onPageChange={(offset) => updateShipmentFilter("offset", offset)}
              fallbackLimit={shipmentFilters.limit}
            />
          </>
        ) : (
          <>
            <ComponentFiltersPanel
              filters={componentFilters}
              onChange={updateComponentFilter}
              onReset={() => setComponentFilters(DEFAULT_COMPONENT_FILTERS)}
            />
            <ComponentDashboard
              data={componentData}
              isLoading={loadState === "loading"}
              onPageChange={(offset) => updateComponentFilter("offset", offset)}
              fallbackLimit={componentFilters.limit}
            />
          </>
        )}
      </section>
    </main>
  );
}

function ShipmentFiltersPanel({
  filters,
  onChange,
  onReset,
}: {
  filters: ShipmentFilters;
  onChange: <Key extends keyof ShipmentFilters>(
    key: Key,
    value: ShipmentFilters[Key],
  ) => void;
  onReset: () => void;
}) {
  return (
    <section className="filters-card" aria-label="Filtry wysyłki">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Kontrola kolejki</p>
          <h2>Filtry wysyłki</h2>
        </div>
        <button className="ghost-button" type="button" onClick={onReset}>
          Wyczyść
        </button>
      </div>
      <div className="filters-grid">
        <TextField
          label="Typ urządzenia"
          value={filters.device_type}
          onChange={(value) => onChange("device_type", value)}
          placeholder="np. ZSS-VENT"
        />
        <TextField
          label="Wariant"
          value={filters.variant_code}
          onChange={(value) => onChange("variant_code", value)}
          placeholder="np. DEFAULT"
        />
        <SelectField
          label="Status produkcji"
          value={filters.production_status}
          options={PRODUCTION_STATUS_OPTIONS}
          onChange={(value) => onChange("production_status", value)}
        />
        <SelectField
          label="Główna blokada"
          value={filters.primary_blocking_code}
          options={SHIPMENT_BLOCKING_OPTIONS}
          onChange={(value) => onChange("primary_blocking_code", value)}
        />
        <SelectField
          label="Akcja"
          value={filters.recommended_action}
          options={SHIPMENT_ACTION_OPTIONS}
          onChange={(value) => onChange("recommended_action", value)}
        />
        <SelectField
          label="Ostatni gate"
          value={filters.latest_gate_result}
          options={["PASS", "BLOCKED", "NONE"]}
          onChange={(value) => onChange("latest_gate_result", value)}
        />
        <SelectField
          label="Sortowanie"
          value={filters.sort_by}
          options={SHIPMENT_SORT_OPTIONS}
          onChange={(value) => onChange("sort_by", value)}
          allowEmpty={false}
        />
        <NumberField
          label="Limit"
          value={filters.limit}
          onChange={(value) => onChange("limit", value)}
        />
        <SwitchField
          label="Tylko zablokowane"
          checked={filters.only_blocked}
          onChange={(checked) => {
            setExclusiveShipmentQueueFilter("only_blocked", checked, onChange);
          }}
        />
        <SwitchField
          label="Tylko gotowe"
          checked={filters.only_ready}
          onChange={(checked) => {
            setExclusiveShipmentQueueFilter("only_ready", checked, onChange);
          }}
        />
        <SwitchField
          label="Malejąco"
          checked={filters.sort_desc}
          onChange={(checked) => onChange("sort_desc", checked)}
        />
      </div>
    </section>
  );
}

function ComponentFiltersPanel({
  filters,
  onChange,
  onReset,
}: {
  filters: ComponentFilters;
  onChange: <Key extends keyof ComponentFilters>(
    key: Key,
    value: ComponentFilters[Key],
  ) => void;
  onReset: () => void;
}) {
  return (
    <section className="filters-card" aria-label="Filtry jakości komponentów">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Triage jakości</p>
          <h2>Filtry komponentów</h2>
        </div>
        <button className="ghost-button" type="button" onClick={onReset}>
          Wyczyść
        </button>
      </div>
      <div className="filters-grid">
        <TextField
          label="Typ urządzenia"
          value={filters.device_type}
          onChange={(value) => onChange("device_type", value)}
          placeholder="np. ZSS-VENT"
        />
        <TextField
          label="Wariant"
          value={filters.variant_code}
          onChange={(value) => onChange("variant_code", value)}
          placeholder="np. SERVICE"
        />
        <SelectField
          label="Status produkcji"
          value={filters.production_status}
          options={PRODUCTION_STATUS_OPTIONS}
          onChange={(value) => onChange("production_status", value)}
        />
        <TextField
          label="Typ blokującego komponentu"
          value={filters.blocking_component_type}
          onChange={(value) => onChange("blocking_component_type", value)}
          placeholder="np. CONTROL_PCB"
        />
        <SelectField
          label="Główny status jakości"
          value={filters.primary_quality_status}
          options={COMPONENT_STATUS_OPTIONS}
          onChange={(value) => onChange("primary_quality_status", value)}
        />
        <SelectField
          label="Świeżość danych"
          value={filters.stale_bucket}
          options={COMPONENT_STALE_OPTIONS}
          onChange={(value) => onChange("stale_bucket", value)}
        />
        <SelectField
          label="Akcja"
          value={filters.recommended_action}
          options={COMPONENT_ACTION_OPTIONS}
          onChange={(value) => onChange("recommended_action", value)}
        />
        <SelectField
          label="Gate komponentów"
          value={filters.passes_component_quality_gate}
          options={["true", "false"]}
          onChange={(value) =>
            onChange(
              "passes_component_quality_gate",
              value as OptionalBooleanString,
            )
          }
        />
        <SelectField
          label="Sortowanie"
          value={filters.sort_by}
          options={COMPONENT_SORT_OPTIONS}
          onChange={(value) => onChange("sort_by", value)}
          allowEmpty={false}
        />
        <NumberField
          label="Limit"
          value={filters.limit}
          onChange={(value) => onChange("limit", value)}
        />
        <SwitchField
          label="Tylko blokujące"
          checked={filters.only_blocking}
          onChange={(checked) => onChange("only_blocking", checked)}
        />
        <SwitchField
          label="Malejąco"
          checked={filters.sort_desc}
          onChange={(checked) => onChange("sort_desc", checked)}
        />
      </div>
    </section>
  );
}

function ShipmentDashboard({
  data,
  isLoading,
  onPageChange,
  fallbackLimit,
}: {
  data: DeviceShipmentQueue | null;
  isLoading: boolean;
  onPageChange: (offset: number) => void;
  fallbackLimit: number;
}) {
  const readyCount = data?.ready_count ?? 0;
  const blockedCount = data?.blocked_count ?? 0;
  const totalDevices = data?.total_devices ?? 0;

  return (
    <section className="dashboard-grid" aria-busy={isLoading}>
      <div className="metrics-grid">
        <MetricCard
          title="Urządzenia"
          value={formatNumber(totalDevices)}
          caption={`${formatNumber(data?.returned_count ?? 0)} w bieżącej stronie`}
        />
        <MetricCard
          title="Gotowe"
          value={formatNumber(readyCount)}
          caption={`${percentage(readyCount, totalDevices)} kolejki`}
          tone="success"
        />
        <MetricCard
          title="Zablokowane"
          value={formatNumber(blockedCount)}
          caption={`${percentage(blockedCount, totalDevices)} kolejki`}
          tone="danger"
        />
      </div>

      <div className="summary-grid">
        <SummaryPanel
          title="Główne blokady"
          items={data?.primary_blocking_summary ?? []}
          emptyMessage="Brak blokad głównych"
          getKey={(item) => item.code}
          getCount={(item) => item.device_count}
          getCaption={(item) => item.message ?? "Brak opisu blokady"}
        />
        <SummaryPanel
          title="Akcje operacyjne"
          items={data?.recommended_action_summary ?? []}
          emptyMessage="Brak akcji"
          getKey={(item) => item.recommended_action}
          getCount={(item) => item.device_count}
        />
        <SummaryPanel
          title="Ostatni shipment gate"
          items={data?.latest_shipment_gate_result_summary ?? []}
          emptyMessage="Brak historii gate"
          getKey={(item) => item.result}
          getCount={(item) => item.device_count}
        />
      </div>

      <ShipmentTable devices={data?.devices ?? []} isLoading={isLoading} />
      <PaginationBar
        label="kolejki wysyłki"
        total={totalDevices}
        returned={data?.returned_count ?? 0}
        offset={data?.offset ?? 0}
        limit={data?.limit ?? fallbackLimit}
        hasMore={data?.has_more ?? false}
        nextOffset={data?.next_offset ?? null}
        isLoading={isLoading}
        onPrevious={() =>
          onPageChange(
            Math.max((data?.offset ?? 0) - (data?.limit ?? fallbackLimit), 0),
          )
        }
        onNext={() =>
          onPageChange(
            data?.next_offset ??
              (data?.offset ?? 0) + (data?.returned_count ?? 0),
          )
        }
      />
    </section>
  );
}

function ComponentDashboard({
  data,
  isLoading,
  onPageChange,
  fallbackLimit,
}: {
  data: DeviceComponentQualityQueue | null;
  isLoading: boolean;
  onPageChange: (offset: number) => void;
  fallbackLimit: number;
}) {
  const totalDevices = data?.total_devices ?? 0;
  const devicesWithIssues = data?.devices_with_issues ?? 0;
  const passingDevices = Math.max(totalDevices - devicesWithIssues, 0);

  return (
    <section className="dashboard-grid" aria-busy={isLoading}>
      <div className="metrics-grid">
        <MetricCard
          title="Urządzenia"
          value={formatNumber(totalDevices)}
          caption={`${formatNumber(data?.returned_count ?? 0)} w bieżącej stronie`}
        />
        <MetricCard
          title="Przechodzą gate"
          value={formatNumber(passingDevices)}
          caption={`${percentage(passingDevices, totalDevices)} kolejki`}
          tone="success"
        />
        <MetricCard
          title="Z problemami"
          value={formatNumber(devicesWithIssues)}
          caption={`${percentage(devicesWithIssues, totalDevices)} kolejki`}
          tone="danger"
        />
      </div>

      <div className="summary-grid">
        <SummaryPanel
          title="Typy blokujące"
          items={data?.blocking_component_type_summary ?? []}
          emptyMessage="Brak blokujących komponentów"
          getKey={(item) => item.component_type}
          getCount={(item) => item.device_count}
          getCaption={(item) =>
            `${formatNumber(item.component_count)} komponentów`
          }
        />
        <SummaryPanel
          title="Primary quality"
          items={data?.primary_quality_status_summary ?? []}
          emptyMessage="Brak statusów"
          getKey={(item) => item.primary_quality_status}
          getCount={(item) => item.device_count}
        />
        <SummaryPanel
          title="Akcje operacyjne"
          items={data?.recommended_action_summary ?? []}
          emptyMessage="Brak akcji"
          getKey={(item) => item.recommended_action}
          getCount={(item) => item.device_count}
        />
      </div>

      <ComponentTable devices={data?.devices ?? []} isLoading={isLoading} />
      <PaginationBar
        label="kolejki komponentów"
        total={totalDevices}
        returned={data?.returned_count ?? 0}
        offset={data?.offset ?? 0}
        limit={data?.limit ?? fallbackLimit}
        hasMore={data?.has_more ?? false}
        nextOffset={data?.next_offset ?? null}
        isLoading={isLoading}
        onPrevious={() =>
          onPageChange(
            Math.max((data?.offset ?? 0) - (data?.limit ?? fallbackLimit), 0),
          )
        }
        onNext={() =>
          onPageChange(
            data?.next_offset ??
              (data?.offset ?? 0) + (data?.returned_count ?? 0),
          )
        }
      />
    </section>
  );
}

function PaginationBar({
  label,
  total,
  returned,
  offset,
  limit,
  hasMore,
  nextOffset,
  isLoading,
  onPrevious,
  onNext,
}: {
  label: string;
  total: number;
  returned: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  nextOffset: number | null;
  isLoading: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  if (total <= 0) {
    return null;
  }

  const currentPage = Math.floor(offset / Math.max(limit, 1)) + 1;
  const start = returned > 0 ? offset + 1 : 0;
  const end = returned > 0 ? offset + returned : 0;

  return (
    <section className="pagination-bar" aria-label={`Paginacja ${label}`}>
      <div className="pagination-copy">
        <strong>
          {formatNumber(start)}-{formatNumber(end)} z {formatNumber(total)} urządzeń
        </strong>
        <span>
          Strona {formatNumber(currentPage)} · limit {formatNumber(limit)}
        </span>
      </div>
      <div className="pagination-actions">
        <button
          className="ghost-button"
          type="button"
          onClick={onPrevious}
          disabled={offset <= 0 || isLoading}
        >
          Poprzednia strona
        </button>
        <button
          className="primary-button"
          type="button"
          onClick={onNext}
          disabled={!hasMore || nextOffset === null || isLoading}
        >
          Następna strona
        </button>
      </div>
    </section>
  );
}

function ShipmentTable({
  devices,
  isLoading,
}: {
  devices: DeviceShipmentReadiness[];
  isLoading: boolean;
}) {
  if (devices.length === 0) {
    return <EmptyTable isLoading={isLoading} label="Brak urządzeń w kolejce." />;
  }

  return (
    <section className="table-card">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">Kolejka wysyłki</p>
          <h2>Urządzenia do decyzji</h2>
        </div>
        {isLoading ? <span className="loading-chip">Odświeżanie...</span> : null}
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Serial</th>
              <th>Typ / wariant</th>
              <th>Status</th>
              <th>Wysyłka</th>
              <th>Główna blokada</th>
              <th>Akcja</th>
              <th>Gate</th>
              <th>Final / BOM</th>
              <th>Aktualizacja</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((device) => (
              <tr key={device.device_serial_number}>
                <td className="serial-cell">{device.device_serial_number}</td>
                <td>
                  <strong>{device.device_type}</strong>
                  <span>{device.device_variant_code}</span>
                </td>
                <td>
                  <CodePill value={device.production_status} />
                </td>
                <td>
                  <BooleanPill
                    value={device.can_transition_to_ready_for_shipment}
                    trueLabel="Gotowe"
                    falseLabel="Blokada"
                  />
                </td>
                <td>
                  <strong>{labelForCode(device.primary_blocking_code)}</strong>
                  <span>{device.primary_blocking_message ?? "Bez blokady"}</span>
                </td>
                <td>
                  <CodePill value={device.recommended_action} />
                </td>
                <td>
                  {device.latest_shipment_gate_decision ? (
                    <>
                      <CodePill
                        value={device.latest_shipment_gate_decision.result}
                      />
                      <span>
                        {formatDateTime(
                          device.latest_shipment_gate_decision.created_at,
                        )}
                      </span>
                    </>
                  ) : (
                    <span>Brak decyzji</span>
                  )}
                </td>
                <td>
                  <span>Final: {labelForCode(device.final_test_passed)}</span>
                  <span>
                    BOM: {labelForCode(device.bom_compliance.passes_bom_gate)}
                  </span>
                </td>
                <td>{formatDateTime(device.device_updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ComponentTable({
  devices,
  isLoading,
}: {
  devices: DeviceComponentQuality[];
  isLoading: boolean;
}) {
  if (devices.length === 0) {
    return (
      <EmptyTable
        isLoading={isLoading}
        label="Brak urządzeń w kolejce jakości komponentów."
      />
    );
  }

  return (
    <section className="table-card">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">Kolejka jakości komponentów</p>
          <h2>Urządzenia z komponentami</h2>
        </div>
        {isLoading ? <span className="loading-chip">Odświeżanie...</span> : null}
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Serial</th>
              <th>Typ / wariant</th>
              <th>Status</th>
              <th>Gate</th>
              <th>Komponenty</th>
              <th>Primary quality</th>
              <th>Blokujący komponent</th>
              <th>Akcja</th>
              <th>Wiek danych</th>
              <th>Aktualizacja</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((device) => (
              <tr key={device.device_serial_number}>
                <td className="serial-cell">{device.device_serial_number}</td>
                <td>
                  <strong>{device.device_type}</strong>
                  <span>{device.device_variant_code}</span>
                </td>
                <td>
                  <CodePill value={device.production_status} />
                </td>
                <td>
                  <BooleanPill
                    value={device.passes_component_quality_gate}
                    trueLabel="PASS"
                    falseLabel="Blokada"
                  />
                </td>
                <td>
                  <strong>
                    {formatNumber(device.blocked_components)} blok. /{" "}
                    {formatNumber(device.passing_components)} pass
                  </strong>
                  <span>
                    Łącznie {formatNumber(device.total_installed_components)}
                  </span>
                </td>
                <td>
                  <CodePill value={device.primary_quality_status} />
                </td>
                <td>
                  <strong>
                    {labelForCode(device.primary_blocking_component_type)}
                  </strong>
                  <span>
                    {device.primary_blocking_component_serial_number ??
                      "Brak serialu"}
                  </span>
                </td>
                <td>
                  <CodePill value={device.recommended_action} />
                </td>
                <td>
                  <CodePill value={device.stale_bucket} />
                </td>
                <td>{formatDateTime(device.device_updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SummaryPanel<Item>({
  title,
  items,
  emptyMessage,
  getKey,
  getCount,
  getCaption,
}: {
  title: string;
  items: Item[];
  emptyMessage: string;
  getKey: (item: Item) => string | boolean | null;
  getCount: (item: Item) => number;
  getCaption?: (item: Item) => string;
}) {
  const maxCount = Math.max(1, ...items.map((item) => getCount(item)));

  return (
    <section className="summary-panel">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="empty-copy">{emptyMessage}</p>
      ) : (
        <div className="summary-list">
          {items.slice(0, 6).map((item) => {
            const count = getCount(item);
            const barStyle = {
              "--bar-width": `${Math.round((count / maxCount) * 100)}%`,
            } as CSSProperties;

            return (
              <article className="summary-item" key={String(getKey(item))}>
                <div>
                  <strong>{labelForCode(getKey(item))}</strong>
                  {getCaption ? <span>{getCaption(item)}</span> : null}
                </div>
                <b>{formatNumber(count)}</b>
                <span className="summary-bar" style={barStyle} />
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function MetricCard({
  title,
  value,
  caption,
  tone = "neutral",
}: {
  title: string;
  value: string;
  caption: string;
  tone?: "neutral" | "success" | "danger";
}) {
  return (
    <article className={`metric-card tone-${tone}`}>
      <span>{title}</span>
      <strong>{value}</strong>
      <p>{caption}</p>
    </article>
  );
}

function StatusBadge({ loadState }: { loadState: LoadState }) {
  const labels: Record<LoadState, string> = {
    idle: "Gotowe",
    loading: "Ładowanie",
    loaded: "API OK",
    error: "API error",
  };

  return <span className={`status-badge state-${loadState}`}>{labels[loadState]}</span>;
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        spellCheck={false}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  allowEmpty = true,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  allowEmpty?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
          onChange(event.target.value)
        }
      >
        {allowEmpty ? <option value="">Wszystkie</option> : null}
        {options.map((option) => (
          <option key={option} value={option}>
            {labelForCode(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        min={1}
        max={500}
        type="number"
        value={value}
        onChange={(event) => {
          const nextValue = Number(event.target.value);
          onChange(Number.isFinite(nextValue) ? nextValue : 100);
        }}
      />
    </label>
  );
}

function SwitchField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="switch-field">
      <input
        checked={checked}
        type="checkbox"
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function BooleanPill({
  value,
  trueLabel,
  falseLabel,
}: {
  value: boolean;
  trueLabel: string;
  falseLabel: string;
}) {
  return (
    <span className={`pill ${value ? "pill-success" : "pill-danger"}`}>
      {value ? trueLabel : falseLabel}
    </span>
  );
}

function CodePill({ value }: { value: string | boolean | null }) {
  return <span className="pill pill-neutral">{labelForCode(value)}</span>;
}

function EmptyTable({
  isLoading,
  label,
}: {
  isLoading: boolean;
  label: ReactNode;
}) {
  return (
    <section className="empty-state">
      <strong>{isLoading ? "Ładowanie danych..." : label}</strong>
      <span>
        Jeśli backend działa, zawęź lub wyczyść filtry i odśwież kolejkę.
      </span>
    </section>
  );
}

function shipmentQueryParams(filters: ShipmentFilters): Record<string, QueryValue> {
  return {
    device_type: filters.device_type,
    variant_code: filters.variant_code,
    production_status: filters.production_status,
    primary_blocking_code: filters.primary_blocking_code,
    recommended_action: filters.recommended_action,
    latest_gate_result: filters.latest_gate_result,
    only_blocked: filters.only_blocked || undefined,
    only_ready: filters.only_ready || undefined,
    sort_by: filters.sort_by,
    sort_desc: filters.sort_desc,
    limit: clampLimit(filters.limit),
    offset: filters.offset > 0 ? filters.offset : undefined,
  };
}

function componentQueryParams(
  filters: ComponentFilters,
): Record<string, QueryValue> {
  return {
    device_type: filters.device_type,
    variant_code: filters.variant_code,
    production_status: filters.production_status,
    blocking_component_type: filters.blocking_component_type,
    primary_quality_status: filters.primary_quality_status,
    stale_bucket: filters.stale_bucket,
    recommended_action: filters.recommended_action,
    passes_component_quality_gate: optionalBoolean(
      filters.passes_component_quality_gate,
    ),
    only_blocking: filters.only_blocking || undefined,
    sort_by: filters.sort_by,
    sort_desc: filters.sort_desc,
    limit: clampLimit(filters.limit),
    offset: filters.offset > 0 ? filters.offset : undefined,
  };
}

function setExclusiveShipmentQueueFilter<Key extends "only_blocked" | "only_ready">(
  key: Key,
  checked: boolean,
  onChange: <FilterKey extends keyof ShipmentFilters>(
    filterKey: FilterKey,
    value: ShipmentFilters[FilterKey],
  ) => void,
) {
  onChange(key, checked);

  if (checked) {
    onChange(key === "only_blocked" ? "only_ready" : "only_blocked", false);
  }
}

function clampLimit(value: number): number {
  return Math.min(Math.max(Math.trunc(value), 1), 500);
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}
