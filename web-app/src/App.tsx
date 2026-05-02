import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, ReactNode } from "react";

import {
  buildQuery,
  completeQcRun,
  createFinalTest,
  createQcRun,
  fetchJson,
  joinApiUrl,
  listOperators,
  listWorkSessions,
  optionalBoolean,
  scanAssemblyComponent,
  updateDeviceStatus,
  updateNonconformityStatus,
} from "./api";
import type {
  DeviceBomComponentCoverage,
  AuditEvent,
  DashboardMode,
  DeviceComponentQuality,
  DeviceComponentQualityQueue,
  DeviceShipmentQueue,
  DeviceShipmentReadiness,
  LoadState,
  OperatorRead,
  QueryValue,
  WorkSessionRead,
} from "./api";
import {
  formatDateTime,
  formatNumber,
  labelForCode,
  percentage,
} from "./dashboard";

import "./App.css";

const API_STORAGE_KEY = "servicetrace.web.apiBaseUrl";
const VIEW_STORAGE_KEY = "servicetrace.web.activeView";
const SHIPMENT_FILTERS_STORAGE_KEY = "servicetrace.web.shipmentFilters";
const COMPONENT_FILTERS_STORAGE_KEY = "servicetrace.web.componentFilters";
const FINAL_TEST_SESSION_STORAGE_KEY =
  "servicetrace.web.finalTestWorkSessionId";
const PRODUCTION_SESSION_STORAGE_KEY =
  "servicetrace.web.productionWorkSessionId";
const QUALITY_SESSION_STORAGE_KEY =
  "servicetrace.web.qualityWorkSessionId";
const DEFAULT_API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
const TEXT_FILTER_DEBOUNCE_MS = 250;
const FINAL_TEST_ALLOWED_ROLES = new Set([
  "ADMIN",
  "FINAL_TEST_OPERATOR",
  "QUALITY_MANAGER",
]);
const PRODUCTION_ACTION_ALLOWED_ROLES = new Set([
  "ADMIN",
  "PRODUCTION_OPERATOR",
  "QUALITY_INSPECTOR",
]);
const QUALITY_ACTION_ALLOWED_ROLES = new Set([
  "ADMIN",
  "QUALITY_INSPECTOR",
  "QUALITY_MANAGER",
]);

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
const SHIPMENT_GATE_RESULT_OPTIONS = ["PASS", "BLOCKED", "NONE"];

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

const URL_VIEW_KEY = "view";
const URL_DEVICE_SERIAL_KEY = "device_serial";
const URL_DEVICE_TYPE_KEY = "device_type";
const URL_DEVICE_VARIANT_KEY = "device_variant";
const URL_SHIPMENT_PREFIX = "ship_";
const URL_COMPONENT_PREFIX = "comp_";
const DEVICE_DETAILS_PATH_PREFIX = "/devices/";

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

interface DeviceSelection {
  serialNumber: string;
  deviceType: string;
  variantCode: string;
}

interface DeviceDetailsPayload {
  shipment: DeviceShipmentReadiness;
  component: DeviceComponentQuality;
  shipmentGateHistory: AuditEvent[];
}

interface ActionWorkSessionOption {
  workSessionId: string;
  operatorId: string;
  workstationId: string;
  machineId: string | null;
  role: string;
  label: string;
}

interface DashboardUrlState {
  activeView: DashboardMode | null;
  hasShipmentFilters: boolean;
  hasComponentFilters: boolean;
  searchParams: URLSearchParams;
  isDevicePage: boolean;
  devicePageSerial: string | null;
}

const SHIPMENT_TEXT_FILTER_KEYS: Array<keyof ShipmentFilters> = [
  "device_type",
  "variant_code",
];

const COMPONENT_TEXT_FILTER_KEYS: Array<keyof ComponentFilters> = [
  "device_type",
  "variant_code",
  "blocking_component_type",
];

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
  const dashboardUrlState = readDashboardUrlState();
  const isDevicePage = dashboardUrlState.isDevicePage;
  const [activeView, setActiveView] = useState<DashboardMode>(() => {
    return dashboardUrlState.activeView ?? readStoredDashboardMode();
  });
  const [apiBaseUrl, setApiBaseUrl] = useState(() => {
    return localStorage.getItem(API_STORAGE_KEY) ?? DEFAULT_API_BASE_URL;
  });
  const [shipmentFilters, setShipmentFilters] = useState(() => {
    return readShipmentFiltersFromUrl(
      dashboardUrlState.searchParams,
      dashboardUrlState.hasShipmentFilters,
    );
  });
  const [componentFilters, setComponentFilters] = useState(() => {
    return readComponentFiltersFromUrl(
      dashboardUrlState.searchParams,
      dashboardUrlState.hasComponentFilters,
    );
  });
  const [
    shipmentRequestFilters,
    flushShipmentRequestFilters,
    shipmentFiltersPending,
  ] =
    useDebouncedRequestFilters(
      shipmentFilters,
      SHIPMENT_TEXT_FILTER_KEYS,
      TEXT_FILTER_DEBOUNCE_MS,
    );
  const [
    componentRequestFilters,
    flushComponentRequestFilters,
    componentFiltersPending,
  ] =
    useDebouncedRequestFilters(
      componentFilters,
      COMPONENT_TEXT_FILTER_KEYS,
      TEXT_FILTER_DEBOUNCE_MS,
    );
  const [shipmentData, setShipmentData] = useState<DeviceShipmentQueue | null>(
    null,
  );
  const [componentData, setComponentData] =
    useState<DeviceComponentQualityQueue | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<DeviceSelection | null>(
    () =>
      readSelectedDeviceFromUrl(
        dashboardUrlState.searchParams,
        dashboardUrlState.devicePageSerial,
      ),
  );
  const [deviceDetails, setDeviceDetails] = useState<DeviceDetailsPayload | null>(
    null,
  );
  const [deviceDetailsState, setDeviceDetailsState] =
    useState<LoadState>("idle");
  const [deviceDetailsError, setDeviceDetailsError] = useState<string | null>(
    null,
  );
  const [deviceActionState, setDeviceActionState] = useState<LoadState>("idle");
  const [deviceActionError, setDeviceActionError] = useState<string | null>(
    null,
  );
  const [deviceActionSuccess, setDeviceActionSuccess] = useState<string | null>(
    null,
  );
  const [workSessions, setWorkSessions] = useState<WorkSessionRead[]>([]);
  const [operators, setOperators] = useState<OperatorRead[]>([]);
  const [actionContextState, setActionContextState] =
    useState<LoadState>("idle");
  const [actionContextError, setActionContextError] = useState<string | null>(
    null,
  );
  const [selectedFinalTestSessionId, setSelectedFinalTestSessionId] =
    useState(() => localStorage.getItem(FINAL_TEST_SESSION_STORAGE_KEY) ?? "");
  const [selectedProductionSessionId, setSelectedProductionSessionId] =
    useState(() => localStorage.getItem(PRODUCTION_SESSION_STORAGE_KEY) ?? "");
  const [selectedQualitySessionId, setSelectedQualitySessionId] = useState(
    () => localStorage.getItem(QUALITY_SESSION_STORAGE_KEY) ?? "",
  );
  const [selectedAssemblyComponentType, setSelectedAssemblyComponentType] =
    useState("");
  const [assemblyBarcodeValue, setAssemblyBarcodeValue] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const activePath =
    activeView === "shipment" ? "/shipment-readiness" : "/component-quality";
  const activeRequestFilters =
    activeView === "shipment"
      ? shipmentRequestFilters
      : componentRequestFilters;
  const selectedDeviceSerial = selectedDevice?.serialNumber ?? null;
  const requiresCompleteAssemblyAction =
    deviceDetails?.shipment.recommended_action === "COMPLETE_ASSEMBLY";
  const requiresFinalTestAction =
    deviceDetails?.shipment.recommended_action === "RUN_FINAL_TEST";
  const requiresComponentQcAction =
    deviceDetails?.component.recommended_action === "RUN_COMPONENT_QC_OR_REWORK";
  const requiresOperatorActionContext =
    requiresCompleteAssemblyAction ||
    requiresFinalTestAction ||
    requiresComponentQcAction;
  const finalTestSessionOptions = buildActionWorkSessionOptions(
    workSessions,
    operators,
    FINAL_TEST_ALLOWED_ROLES,
  );
  const productionSessionOptions = buildActionWorkSessionOptions(
    workSessions,
    operators,
    PRODUCTION_ACTION_ALLOWED_ROLES,
  );
  const qualitySessionOptions = buildActionWorkSessionOptions(
    workSessions,
    operators,
    QUALITY_ACTION_ALLOWED_ROLES,
  );
  const selectedFinalTestSession =
    finalTestSessionOptions.find(
      (session) => session.workSessionId === selectedFinalTestSessionId,
    ) ??
    finalTestSessionOptions[0] ??
    null;
  const selectedProductionSession =
    productionSessionOptions.find(
      (session) => session.workSessionId === selectedProductionSessionId,
    ) ??
    productionSessionOptions[0] ??
    null;
  const selectedQualitySession =
    qualitySessionOptions.find(
      (session) => session.workSessionId === selectedQualitySessionId,
    ) ??
    qualitySessionOptions[0] ??
    null;
  const dashboardHref = buildDashboardLocationHref({
    pathname: "/",
    activeView,
    shipmentFilters,
    componentFilters,
    selectedDevice,
  });
  const selectedDevicePageHref = selectedDevice
    ? buildDashboardLocationHref({
        pathname: buildDeviceDetailsPath(selectedDevice.serialNumber),
        activeView,
        shipmentFilters,
        componentFilters,
        selectedDevice,
      })
    : null;
  const assemblyComponentTypeOptions = buildAssemblyComponentTypeOptions(
    deviceDetails?.shipment.bom_compliance.component_coverage ?? [],
  );

  const clearActiveViewData = (view: DashboardMode) => {
    if (view === "shipment") {
      setShipmentData(null);
      return;
    }

    setComponentData(null);
  };

  const selectDevice = (device: {
    device_serial_number: string;
    device_type: string;
    device_variant_code: string;
  }) => {
    setSelectedDevice({
      serialNumber: device.device_serial_number,
      deviceType: device.device_type,
      variantCode: device.device_variant_code,
    });
  };

  useEffect(() => {
    localStorage.setItem(API_STORAGE_KEY, apiBaseUrl);
  }, [apiBaseUrl]);

  useEffect(() => {
    localStorage.setItem(VIEW_STORAGE_KEY, activeView);
  }, [activeView]);

  useEffect(() => {
    const nextSearch = buildDashboardUrlSearch({
      activeView,
      shipmentFilters,
      componentFilters,
      selectedDevice,
    });
    const currentSearch = window.location.search;

    if (nextSearch === currentSearch) {
      return;
    }

    const nextUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }, [activeView, componentFilters, selectedDevice, shipmentFilters]);

  useEffect(() => {
    localStorage.setItem(
      SHIPMENT_FILTERS_STORAGE_KEY,
      JSON.stringify(shipmentFilters),
    );
  }, [shipmentFilters]);

  useEffect(() => {
    localStorage.setItem(
      COMPONENT_FILTERS_STORAGE_KEY,
      JSON.stringify(componentFilters),
    );
  }, [componentFilters]);

  useEffect(() => {
    if (selectedFinalTestSessionId) {
      localStorage.setItem(
        FINAL_TEST_SESSION_STORAGE_KEY,
        selectedFinalTestSessionId,
      );
      return;
    }

    localStorage.removeItem(FINAL_TEST_SESSION_STORAGE_KEY);
  }, [selectedFinalTestSessionId]);

  useEffect(() => {
    if (selectedProductionSessionId) {
      localStorage.setItem(
        PRODUCTION_SESSION_STORAGE_KEY,
        selectedProductionSessionId,
      );
      return;
    }

    localStorage.removeItem(PRODUCTION_SESSION_STORAGE_KEY);
  }, [selectedProductionSessionId]);

  useEffect(() => {
    if (selectedQualitySessionId) {
      localStorage.setItem(
        QUALITY_SESSION_STORAGE_KEY,
        selectedQualitySessionId,
      );
      return;
    }

    localStorage.removeItem(QUALITY_SESSION_STORAGE_KEY);
  }, [selectedQualitySessionId]);

  useEffect(() => {
    if (!apiBaseUrl.trim()) {
      clearActiveViewData(activeView);
      setLoadState("error");
      setErrorMessage("Podaj bazowy adres API.");
      return;
    }

    const controller = new AbortController();
    let isCurrentRequest = true;
    const params =
      activeView === "shipment"
        ? shipmentQueryParams(activeRequestFilters as ShipmentFilters)
        : componentQueryParams(activeRequestFilters as ComponentFilters);
    const url = joinApiUrl(apiBaseUrl.trim(), activePath) + buildQuery(params);

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
    activePath,
    activeRequestFilters,
    apiBaseUrl,
    refreshVersion,
  ]);

  useEffect(() => {
    if (!selectedDeviceSerial) {
      setDeviceDetails(null);
      setDeviceDetailsState("idle");
      setDeviceDetailsError(null);
      return;
    }

    if (!apiBaseUrl.trim()) {
      setDeviceDetails(null);
      setDeviceDetailsState("error");
      setDeviceDetailsError("Podaj bazowy adres API.");
      return;
    }

    const controller = new AbortController();
    let isCurrentRequest = true;
    const encodedSerial = encodeURIComponent(selectedDeviceSerial);
    const shipmentUrl = joinApiUrl(
      apiBaseUrl.trim(),
      `/devices/${encodedSerial}/shipment-readiness`,
    );
    const componentUrl = joinApiUrl(
      apiBaseUrl.trim(),
      `/devices/${encodedSerial}/component-quality`,
    );
    const historyUrl =
      joinApiUrl(
        apiBaseUrl.trim(),
        `/devices/${encodedSerial}/shipment-gate-history`,
      ) + buildQuery({ limit: 10 });

    setDeviceDetails(null);
    setDeviceDetailsState("loading");
    setDeviceDetailsError(null);

    Promise.all([
      fetchJson<DeviceShipmentReadiness>(shipmentUrl, controller.signal),
      fetchJson<DeviceComponentQuality>(componentUrl, controller.signal),
      fetchJson<AuditEvent[]>(historyUrl, controller.signal),
    ])
      .then(([shipment, component, shipmentGateHistory]) => {
        if (!isCurrentRequest) {
          return;
        }

        setDeviceDetails({
          shipment,
          component,
          shipmentGateHistory,
        });
        setDeviceDetailsState("loaded");
      })
      .catch((error: unknown) => {
        if (!isCurrentRequest || isAbortError(error)) {
          return;
        }

        setDeviceDetails(null);
        setDeviceDetailsState("error");
        setDeviceDetailsError(
          error instanceof Error ? error.message : String(error),
        );
      });

    return () => {
      isCurrentRequest = false;
      controller.abort();
    };
  }, [apiBaseUrl, refreshVersion, selectedDeviceSerial]);

  useEffect(() => {
    if (!selectedDeviceSerial || !requiresOperatorActionContext) {
      setWorkSessions([]);
      setOperators([]);
      setActionContextState("idle");
      setActionContextError(null);
      return;
    }

    if (!apiBaseUrl.trim()) {
      setWorkSessions([]);
      setOperators([]);
      setActionContextState("error");
      setActionContextError("Podaj bazowy adres API.");
      return;
    }

    const controller = new AbortController();
    let isCurrentRequest = true;

    setActionContextState("loading");
    setActionContextError(null);

    Promise.all([
      listWorkSessions(apiBaseUrl.trim(), controller.signal),
      listOperators(apiBaseUrl.trim(), controller.signal),
    ])
      .then(([sessionRows, operatorRows]) => {
        if (!isCurrentRequest) {
          return;
        }

        setWorkSessions(sessionRows);
        setOperators(operatorRows);
        setActionContextState("loaded");
      })
      .catch((error: unknown) => {
        if (!isCurrentRequest || isAbortError(error)) {
          return;
        }

        setWorkSessions([]);
        setOperators([]);
        setActionContextState("error");
        setActionContextError(
          error instanceof Error ? error.message : String(error),
        );
      });

    return () => {
      isCurrentRequest = false;
      controller.abort();
    };
  }, [apiBaseUrl, requiresOperatorActionContext, selectedDeviceSerial]);

  useEffect(() => {
    if (finalTestSessionOptions.length === 0) {
      if (selectedFinalTestSessionId !== "") {
        setSelectedFinalTestSessionId("");
      }
      return;
    }

    const isSelectedSessionAvailable = finalTestSessionOptions.some(
      (session) => session.workSessionId === selectedFinalTestSessionId,
    );
    if (!isSelectedSessionAvailable) {
      setSelectedFinalTestSessionId(finalTestSessionOptions[0].workSessionId);
    }
  }, [finalTestSessionOptions, selectedFinalTestSessionId]);

  useEffect(() => {
    if (productionSessionOptions.length === 0) {
      if (selectedProductionSessionId !== "") {
        setSelectedProductionSessionId("");
      }
      return;
    }

    const isSelectedSessionAvailable = productionSessionOptions.some(
      (session) => session.workSessionId === selectedProductionSessionId,
    );
    if (!isSelectedSessionAvailable) {
      setSelectedProductionSessionId(productionSessionOptions[0].workSessionId);
    }
  }, [productionSessionOptions, selectedProductionSessionId]);

  useEffect(() => {
    if (qualitySessionOptions.length === 0) {
      if (selectedQualitySessionId !== "") {
        setSelectedQualitySessionId("");
      }
      return;
    }

    const isSelectedSessionAvailable = qualitySessionOptions.some(
      (session) => session.workSessionId === selectedQualitySessionId,
    );
    if (!isSelectedSessionAvailable) {
      setSelectedQualitySessionId(qualitySessionOptions[0].workSessionId);
    }
  }, [qualitySessionOptions, selectedQualitySessionId]);

  useEffect(() => {
    setDeviceActionState("idle");
    setDeviceActionError(null);
    setDeviceActionSuccess(null);
    setAssemblyBarcodeValue("");
  }, [selectedDeviceSerial]);

  useEffect(() => {
    if (!selectedDevice || !deviceDetails) {
      return;
    }

    if (
      selectedDevice.deviceType !== "" &&
      selectedDevice.variantCode !== ""
    ) {
      return;
    }

    setSelectedDevice({
      serialNumber: selectedDevice.serialNumber,
      deviceType: deviceDetails.shipment.device_type,
      variantCode: deviceDetails.shipment.device_variant_code,
    });
  }, [deviceDetails, selectedDevice]);

  useEffect(() => {
    if (assemblyComponentTypeOptions.length === 0) {
      if (selectedAssemblyComponentType !== "") {
        setSelectedAssemblyComponentType("");
      }
      return;
    }

    if (!assemblyComponentTypeOptions.includes(selectedAssemblyComponentType)) {
      setSelectedAssemblyComponentType(assemblyComponentTypeOptions[0]);
    }
  }, [assemblyComponentTypeOptions, selectedAssemblyComponentType]);

  const updateSelectedDeviceProductionStatus = async (
    productionStatus: string,
    successMessage: string,
  ) => {
    if (!selectedDeviceSerial || deviceActionState === "loading") {
      return;
    }

    if (!apiBaseUrl.trim()) {
      setDeviceActionState("error");
      setDeviceActionError("Podaj bazowy adres API.");
      setDeviceActionSuccess(null);
      return;
    }

    setDeviceActionState("loading");
    setDeviceActionError(null);
    setDeviceActionSuccess(null);

    try {
      await updateDeviceStatus(
        apiBaseUrl.trim(),
        selectedDeviceSerial,
        productionStatus,
      );
      setDeviceActionState("loaded");
      setDeviceActionSuccess(successMessage);
      setRefreshVersion((previous) => previous + 1);
    } catch (error: unknown) {
      setDeviceActionState("error");
      setDeviceActionError(
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  const markSelectedDeviceReadyForShipment = async () => {
    await updateSelectedDeviceProductionStatus(
      "READY_FOR_SHIPMENT",
      "Urządzenie oznaczone jako gotowe do wysyłki.",
    );
  };

  const markSelectedDeviceShipped = async () => {
    await updateSelectedDeviceProductionStatus(
      "SHIPPED",
      "Urządzenie oznaczone jako wysłane.",
    );
  };

  const completeSelectedAssembly = async () => {
    if (!selectedDeviceSerial || deviceActionState === "loading") {
      return;
    }

    if (!apiBaseUrl.trim()) {
      setDeviceActionState("error");
      setDeviceActionError("Podaj bazowy adres API.");
      setDeviceActionSuccess(null);
      return;
    }

    if (!selectedProductionSession) {
      setDeviceActionState("error");
      setDeviceActionError(
        "Wybierz aktywną sesję montażową z uprawnioną rolą.",
      );
      setDeviceActionSuccess(null);
      return;
    }

    if (!selectedAssemblyComponentType) {
      setDeviceActionState("error");
      setDeviceActionError("Wybierz typ komponentu do montażu.");
      setDeviceActionSuccess(null);
      return;
    }

    const normalizedBarcode = assemblyBarcodeValue.trim();
    if (normalizedBarcode === "") {
      setDeviceActionState("error");
      setDeviceActionError("Podaj barcode komponentu do montażu.");
      setDeviceActionSuccess(null);
      return;
    }

    setDeviceActionState("loading");
    setDeviceActionError(null);
    setDeviceActionSuccess(null);

    try {
      await scanAssemblyComponent(apiBaseUrl.trim(), selectedDeviceSerial, {
        child_barcode_value: normalizedBarcode,
        component_type: selectedAssemblyComponentType,
        installed_by: selectedProductionSession.operatorId,
        workstation_id: selectedProductionSession.workstationId,
        work_session_id: selectedProductionSession.workSessionId,
      });
      setDeviceActionState("loaded");
      setDeviceActionSuccess(
        `Zamontowano komponent ${labelForCode(
          selectedAssemblyComponentType,
        )} z barcode ${normalizedBarcode}.`,
      );
      setAssemblyBarcodeValue("");
      setRefreshVersion((previous) => previous + 1);
    } catch (error: unknown) {
      setDeviceActionState("error");
      setDeviceActionError(
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  const recordSelectedDeviceFinalTest = async (result: "PASS" | "FAIL") => {
    if (!selectedDeviceSerial || deviceActionState === "loading") {
      return;
    }

    if (!apiBaseUrl.trim()) {
      setDeviceActionState("error");
      setDeviceActionError("Podaj bazowy adres API.");
      setDeviceActionSuccess(null);
      return;
    }

    if (!selectedFinalTestSession) {
      setDeviceActionState("error");
      setDeviceActionError(
        "Wybierz aktywną sesję final test z uprawnioną rolą.",
      );
      setDeviceActionSuccess(null);
      return;
    }

    setDeviceActionState("loading");
    setDeviceActionError(null);
    setDeviceActionSuccess(null);

    try {
      await createFinalTest(apiBaseUrl.trim(), {
        test_run_id: buildClientRunId("FT-WEB", selectedDeviceSerial),
        device_serial_number: selectedDeviceSerial,
        result,
        work_session_id: selectedFinalTestSession.workSessionId,
      });
      setDeviceActionState("loaded");
      setDeviceActionSuccess(
        result === "PASS"
          ? "Zapisano final test PASS."
          : "Zapisano final test FAIL i otwarto krytyczne NCR.",
      );
      setRefreshVersion((previous) => previous + 1);
    } catch (error: unknown) {
      setDeviceActionState("error");
      setDeviceActionError(
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  const recordSelectedComponentQc = async (result: "PASS" | "FAIL") => {
    if (!selectedDeviceSerial || deviceActionState === "loading") {
      return;
    }

    if (!apiBaseUrl.trim()) {
      setDeviceActionState("error");
      setDeviceActionError("Podaj bazowy adres API.");
      setDeviceActionSuccess(null);
      return;
    }

    if (!selectedQualitySession) {
      setDeviceActionState("error");
      setDeviceActionError(
        "Wybierz aktywną sesję jakościową z uprawnioną rolą.",
      );
      setDeviceActionSuccess(null);
      return;
    }

    const blockingComponent =
      (deviceDetails?.component.components ?? []).find(
        (componentRow) =>
          componentRow.component_serial_number ===
          deviceDetails?.component.primary_blocking_component_serial_number,
      ) ?? null;
    if (!blockingComponent) {
      setDeviceActionState("error");
      setDeviceActionError(
        "Nie znaleziono blokującego komponentu do akcji QC.",
      );
      setDeviceActionSuccess(null);
      return;
    }

    setDeviceActionState("loading");
    setDeviceActionError(null);
    setDeviceActionSuccess(null);

    try {
      const qcRun = await createQcRun(apiBaseUrl.trim(), {
        run_id: buildClientRunId("QC-WEB", blockingComponent.component_serial_number),
        device_serial_number: selectedDeviceSerial,
        item_serial_number: blockingComponent.component_serial_number,
        barcode_value: blockingComponent.child_barcode_value,
        process_stage: "COMPONENT_QC",
        work_session_id: selectedQualitySession.workSessionId,
      });
      await completeQcRun(apiBaseUrl.trim(), qcRun.run_id, result);
      setDeviceActionState("loaded");
      setDeviceActionSuccess(
        result === "PASS"
          ? "Zapisano komponentowy QC PASS."
          : "Zapisano komponentowy QC FAIL i otwarto krytyczne NCR.",
      );
      setRefreshVersion((previous) => previous + 1);
    } catch (error: unknown) {
      setDeviceActionState("error");
      setDeviceActionError(
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  const closeSelectedNonconformities = async (
    ncrIds: string[],
    scopeLabel: string,
  ) => {
    if (ncrIds.length === 0 || deviceActionState === "loading") {
      return;
    }

    if (!apiBaseUrl.trim()) {
      setDeviceActionState("error");
      setDeviceActionError("Podaj bazowy adres API.");
      setDeviceActionSuccess(null);
      return;
    }

    setDeviceActionState("loading");
    setDeviceActionError(null);
    setDeviceActionSuccess(null);

    try {
      await Promise.all(
        ncrIds.map((ncrId) =>
          updateNonconformityStatus(
            apiBaseUrl.trim(),
            ncrId,
            "CLOSED",
            `Zamknięte z panelu operacyjnego dla ${selectedDeviceSerial}.`,
          ),
        ),
      );
      setDeviceActionState("loaded");
      setDeviceActionSuccess(
        `Zamknięto ${formatNumber(ncrIds.length)} krytyczne NCR ${scopeLabel}.`,
      );
      setRefreshVersion((previous) => previous + 1);
    } catch (error: unknown) {
      setDeviceActionState("error");
      setDeviceActionError(
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  const closeSelectedDeviceCriticalNcrs = async () => {
    await closeSelectedNonconformities(
      deviceDetails?.shipment.critical_open_ncr_ids ?? [],
      "urządzenia",
    );
  };

  const closeSelectedComponentCriticalNcrs = async () => {
    const ncrIds = Array.from(
      new Set(
        (deviceDetails?.component.components ?? []).flatMap(
          (component) => component.critical_open_ncr_ids,
        ),
      ),
    );
    await closeSelectedNonconformities(ncrIds, "komponentów");
  };

  const updateShipmentFilter = <Key extends keyof ShipmentFilters>(
    key: Key,
    value: ShipmentFilters[Key],
  ) => {
    setShipmentFilters((previous) => {
      const normalizedValue =
        key === "limit"
          ? (clampLimit(value as number) as ShipmentFilters[Key])
          : value;
      const next = reconcileShipmentFilterChange(
        previous,
        key,
        normalizedValue,
      );
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

  const resetStoredDashboardState = () => {
    localStorage.removeItem(API_STORAGE_KEY);
    localStorage.removeItem(VIEW_STORAGE_KEY);
    localStorage.removeItem(SHIPMENT_FILTERS_STORAGE_KEY);
    localStorage.removeItem(COMPONENT_FILTERS_STORAGE_KEY);
    localStorage.removeItem(FINAL_TEST_SESSION_STORAGE_KEY);
    localStorage.removeItem(QUALITY_SESSION_STORAGE_KEY);

    flushShipmentRequestFilters(DEFAULT_SHIPMENT_FILTERS);
    flushComponentRequestFilters(DEFAULT_COMPONENT_FILTERS);
    setApiBaseUrl(DEFAULT_API_BASE_URL);
    setActiveView("shipment");
    setShipmentFilters(DEFAULT_SHIPMENT_FILTERS);
    setComponentFilters(DEFAULT_COMPONENT_FILTERS);
    setSelectedFinalTestSessionId("");
    setSelectedProductionSessionId("");
    setSelectedQualitySessionId("");
    setSelectedAssemblyComponentType("");
    setAssemblyBarcodeValue("");

    if (!isDevicePage) {
      setSelectedDevice(null);
      setDeviceDetails(null);
      setDeviceDetailsState("idle");
      setDeviceDetailsError(null);
    }
  };

  const flushActiveRequestFilters = () => {
    if (activeView === "shipment") {
      flushShipmentRequestFilters();
      return;
    }

    flushComponentRequestFilters();
  };

  const deviceDetailsViewProps = selectedDevice
    ? {
        device: selectedDevice,
        details: deviceDetails,
        loadState: deviceDetailsState,
        errorMessage: deviceDetailsError,
        actionState: deviceActionState,
        actionErrorMessage: deviceActionError,
        actionSuccessMessage: deviceActionSuccess,
        actionContextState,
        actionContextError,
        finalTestSessionOptions,
        selectedFinalTestSessionId:
          selectedFinalTestSession?.workSessionId ?? "",
        onSelectFinalTestSession: setSelectedFinalTestSessionId,
        productionSessionOptions,
        selectedProductionSessionId:
          selectedProductionSession?.workSessionId ?? "",
        onSelectProductionSession: setSelectedProductionSessionId,
        assemblyComponentTypeOptions,
        selectedAssemblyComponentType,
        onSelectAssemblyComponentType: setSelectedAssemblyComponentType,
        assemblyBarcodeValue,
        onChangeAssemblyBarcode: setAssemblyBarcodeValue,
        qualitySessionOptions,
        selectedQualitySessionId: selectedQualitySession?.workSessionId ?? "",
        onSelectQualitySession: setSelectedQualitySessionId,
        onMarkReadyForShipment: markSelectedDeviceReadyForShipment,
        onMarkShipped: markSelectedDeviceShipped,
        onCompleteAssembly: completeSelectedAssembly,
        onRecordFinalTestPass: () => recordSelectedDeviceFinalTest("PASS"),
        onRecordFinalTestFail: () => recordSelectedDeviceFinalTest("FAIL"),
        onRecordComponentQcPass: () => recordSelectedComponentQc("PASS"),
        onRecordComponentQcFail: () => recordSelectedComponentQc("FAIL"),
        onCloseDeviceCriticalNcrs: closeSelectedDeviceCriticalNcrs,
        onCloseComponentCriticalNcrs: closeSelectedComponentCriticalNcrs,
      }
    : null;

  return (
    <main className="app-shell">
      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Operacje ServiceTrace</p>
          <h1>Panel gotowości wysyłki i jakości komponentów</h1>
          <p>
            Jedno miejsce do pilnowania blokad BOM, final testu, NCR i jakości
            zamontowanych komponentów przed wysyłką urządzeń.
          </p>
        </div>
        <section className="control-deck" aria-label="Ustawienia API">
          <StatusBadge loadState={loadState} />
          <label className="api-field">
            <span>Adres bazowy API</span>
            <input
              value={apiBaseUrl}
              onChange={(event) => {
                flushActiveRequestFilters();
                setApiBaseUrl(event.target.value);
              }}
              spellCheck={false}
            />
          </label>
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              flushActiveRequestFilters();
              setRefreshVersion((value) => value + 1);
            }}
          >
            Odśwież
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={resetStoredDashboardState}
          >
            Wyczyść zapisany stan
          </button>
        </section>
      </header>

      {isDevicePage && selectedDevice && deviceDetailsViewProps ? (
        <section className="workspace">
          <div className="device-page-bar">
            <a className="ghost-button button-link" href={dashboardHref}>
              Wróć do dashboardu
            </a>
            <span className="empty-copy">
              Pełny widok urządzenia zachowuje kontekst filtrów i aktywnej
              kolejki, więc możesz wrócić dokładnie do miejsca, z którego
              wszedłeś.
            </span>
          </div>
          <DeviceDetailsPage
            {...deviceDetailsViewProps}
            devicePageHref={selectedDevicePageHref}
          />
        </section>
      ) : (
        <section className="workspace">
          <nav className="view-switch" aria-label="Widok panelu">
            <button
              className={activeView === "shipment" ? "is-active" : ""}
              type="button"
              onClick={() => {
                flushShipmentRequestFilters();
                setActiveView("shipment");
              }}
            >
              Wysyłka
            </button>
            <button
              className={activeView === "components" ? "is-active" : ""}
              type="button"
              onClick={() => {
                flushComponentRequestFilters();
                setActiveView("components");
              }}
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
                onCommitTextFilters={flushShipmentRequestFilters}
                hasPendingTextFilters={shipmentFiltersPending}
              />
              <ShipmentDashboard
                data={shipmentData}
                isLoading={loadState === "loading"}
                onPageChange={(offset) => updateShipmentFilter("offset", offset)}
                fallbackLimit={shipmentFilters.limit}
                onSelectDevice={selectDevice}
                selectedDeviceSerial={selectedDeviceSerial}
              />
            </>
          ) : (
            <>
              <ComponentFiltersPanel
                filters={componentFilters}
                onChange={updateComponentFilter}
                onReset={() => setComponentFilters(DEFAULT_COMPONENT_FILTERS)}
                onCommitTextFilters={flushComponentRequestFilters}
                hasPendingTextFilters={componentFiltersPending}
              />
              <ComponentDashboard
                data={componentData}
                isLoading={loadState === "loading"}
                onPageChange={(offset) => updateComponentFilter("offset", offset)}
                fallbackLimit={componentFilters.limit}
                onSelectDevice={selectDevice}
                selectedDeviceSerial={selectedDeviceSerial}
              />
            </>
          )}

          {selectedDevice && deviceDetailsViewProps ? (
            <DeviceDetailsDrawer
              {...deviceDetailsViewProps}
              devicePageHref={selectedDevicePageHref}
              onClose={() => setSelectedDevice(null)}
            />
          ) : null}
        </section>
      )}
    </main>
  );
}

function ShipmentFiltersPanel({
  filters,
  onChange,
  onReset,
  onCommitTextFilters,
  hasPendingTextFilters,
}: {
  filters: ShipmentFilters;
  onChange: <Key extends keyof ShipmentFilters>(
    key: Key,
    value: ShipmentFilters[Key],
  ) => void;
  onReset: () => void;
  onCommitTextFilters: () => void;
  hasPendingTextFilters: boolean;
}) {
  const actionOptions: SelectOption[] = SHIPMENT_ACTION_OPTIONS.map((option) => ({
    value: option,
    disabled:
      (filters.only_ready && option !== "MARK_READY_FOR_SHIPMENT") ||
      (filters.only_blocked && option === "MARK_READY_FOR_SHIPMENT"),
  }));

  return (
    <section className="filters-card" aria-label="Filtry wysyłki">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Kontrola kolejki</p>
          <h2>Filtry wysyłki</h2>
        </div>
        <div className="section-actions">
          {hasPendingTextFilters ? (
            <span className="pending-chip">Oczekuje na zastosowanie</span>
          ) : null}
          <button className="ghost-button" type="button" onClick={onReset}>
            Wyczyść
          </button>
        </div>
      </div>
      <div className="filters-grid">
        <TextField
          label="Typ urządzenia"
          value={filters.device_type}
          onChange={(value) => onChange("device_type", value)}
          onCommit={onCommitTextFilters}
          placeholder="np. ZSS-VENT"
        />
        <TextField
          label="Wariant"
          value={filters.variant_code}
          onChange={(value) => onChange("variant_code", value)}
          onCommit={onCommitTextFilters}
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
          disabled={filters.only_ready}
        />
        <SelectField
          label="Akcja"
          value={filters.recommended_action}
          options={actionOptions}
          onChange={(value) => onChange("recommended_action", value)}
        />
        <SelectField
          label="Ostatni gate"
          value={filters.latest_gate_result}
          options={SHIPMENT_GATE_RESULT_OPTIONS}
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
  onCommitTextFilters,
  hasPendingTextFilters,
}: {
  filters: ComponentFilters;
  onChange: <Key extends keyof ComponentFilters>(
    key: Key,
    value: ComponentFilters[Key],
  ) => void;
  onReset: () => void;
  onCommitTextFilters: () => void;
  hasPendingTextFilters: boolean;
}) {
  return (
    <section className="filters-card" aria-label="Filtry jakości komponentów">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Triage jakości</p>
          <h2>Filtry komponentów</h2>
        </div>
        <div className="section-actions">
          {hasPendingTextFilters ? (
            <span className="pending-chip">Oczekuje na zastosowanie</span>
          ) : null}
          <button className="ghost-button" type="button" onClick={onReset}>
            Wyczyść
          </button>
        </div>
      </div>
      <div className="filters-grid">
        <TextField
          label="Typ urządzenia"
          value={filters.device_type}
          onChange={(value) => onChange("device_type", value)}
          onCommit={onCommitTextFilters}
          placeholder="np. ZSS-VENT"
        />
        <TextField
          label="Wariant"
          value={filters.variant_code}
          onChange={(value) => onChange("variant_code", value)}
          onCommit={onCommitTextFilters}
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
          onCommit={onCommitTextFilters}
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
  onSelectDevice,
  selectedDeviceSerial,
}: {
  data: DeviceShipmentQueue | null;
  isLoading: boolean;
  onPageChange: (offset: number) => void;
  fallbackLimit: number;
  onSelectDevice: (device: DeviceShipmentReadiness) => void;
  selectedDeviceSerial: string | null;
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

      <ShipmentTable
        devices={data?.devices ?? []}
        isLoading={isLoading}
        onSelectDevice={onSelectDevice}
        selectedDeviceSerial={selectedDeviceSerial}
      />
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
  onSelectDevice,
  selectedDeviceSerial,
}: {
  data: DeviceComponentQualityQueue | null;
  isLoading: boolean;
  onPageChange: (offset: number) => void;
  fallbackLimit: number;
  onSelectDevice: (device: DeviceComponentQuality) => void;
  selectedDeviceSerial: string | null;
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
          title="Główny status jakości"
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

      <ComponentTable
        devices={data?.devices ?? []}
        isLoading={isLoading}
        onSelectDevice={onSelectDevice}
        selectedDeviceSerial={selectedDeviceSerial}
      />
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
  onSelectDevice,
  selectedDeviceSerial,
}: {
  devices: DeviceShipmentReadiness[];
  isLoading: boolean;
  onSelectDevice: (device: DeviceShipmentReadiness) => void;
  selectedDeviceSerial: string | null;
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
              <th>Final test i BOM</th>
              <th>Aktualizacja</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((device) => {
              const isSelected =
                selectedDeviceSerial === device.device_serial_number;

              return (
              <tr
                key={device.device_serial_number}
                className={isSelected ? "table-row-selected" : undefined}
              >
                <td className="serial-cell">
                  <button
                    className={`row-link ${isSelected ? "is-selected" : ""}`}
                    type="button"
                    onClick={() => onSelectDevice(device)}
                    aria-pressed={isSelected}
                  >
                    {device.device_serial_number}
                  </button>
                </td>
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
                  <span>Final test: {labelForCode(device.final_test_passed)}</span>
                  <span>
                    BOM: {labelForCode(device.bom_compliance.passes_bom_gate)}
                  </span>
                </td>
                <td>{formatDateTime(device.device_updated_at)}</td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ComponentTable({
  devices,
  isLoading,
  onSelectDevice,
  selectedDeviceSerial,
}: {
  devices: DeviceComponentQuality[];
  isLoading: boolean;
  onSelectDevice: (device: DeviceComponentQuality) => void;
  selectedDeviceSerial: string | null;
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
              <th>Główny status jakości</th>
              <th>Blokujący komponent</th>
              <th>Akcja</th>
              <th>Wiek danych</th>
              <th>Aktualizacja</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((device) => {
              const isSelected =
                selectedDeviceSerial === device.device_serial_number;

              return (
              <tr
                key={device.device_serial_number}
                className={isSelected ? "table-row-selected" : undefined}
              >
                <td className="serial-cell">
                  <button
                    className={`row-link ${isSelected ? "is-selected" : ""}`}
                    type="button"
                    onClick={() => onSelectDevice(device)}
                    aria-pressed={isSelected}
                  >
                    {device.device_serial_number}
                  </button>
                </td>
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
                    trueLabel="Zaliczone"
                    falseLabel="Blokada"
                  />
                </td>
                <td>
                  <strong>
                    {formatNumber(device.blocked_components)} blok. /{" "}
                    {formatNumber(device.passing_components)} zal.
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
            )})}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface DeviceDetailsViewProps {
  device: DeviceSelection;
  details: DeviceDetailsPayload | null;
  loadState: LoadState;
  errorMessage: string | null;
  actionState: LoadState;
  actionErrorMessage: string | null;
  actionSuccessMessage: string | null;
  actionContextState: LoadState;
  actionContextError: string | null;
  finalTestSessionOptions: ActionWorkSessionOption[];
  selectedFinalTestSessionId: string;
  onSelectFinalTestSession: (workSessionId: string) => void;
  productionSessionOptions: ActionWorkSessionOption[];
  selectedProductionSessionId: string;
  onSelectProductionSession: (workSessionId: string) => void;
  assemblyComponentTypeOptions: string[];
  selectedAssemblyComponentType: string;
  onSelectAssemblyComponentType: (componentType: string) => void;
  assemblyBarcodeValue: string;
  onChangeAssemblyBarcode: (barcodeValue: string) => void;
  qualitySessionOptions: ActionWorkSessionOption[];
  selectedQualitySessionId: string;
  onSelectQualitySession: (workSessionId: string) => void;
  onMarkReadyForShipment: () => void;
  onMarkShipped: () => void;
  onCompleteAssembly: () => void;
  onRecordFinalTestPass: () => void;
  onRecordFinalTestFail: () => void;
  onRecordComponentQcPass: () => void;
  onRecordComponentQcFail: () => void;
  onCloseDeviceCriticalNcrs: () => void;
  onCloseComponentCriticalNcrs: () => void;
}

function DeviceDetailsDrawer({
  device,
  details,
  loadState,
  errorMessage,
  actionState,
  actionErrorMessage,
  actionSuccessMessage,
  actionContextState,
  actionContextError,
  finalTestSessionOptions,
  selectedFinalTestSessionId,
  onSelectFinalTestSession,
  productionSessionOptions,
  selectedProductionSessionId,
  onSelectProductionSession,
  assemblyComponentTypeOptions,
  selectedAssemblyComponentType,
  onSelectAssemblyComponentType,
  assemblyBarcodeValue,
  onChangeAssemblyBarcode,
  qualitySessionOptions,
  selectedQualitySessionId,
  onSelectQualitySession,
  onMarkReadyForShipment,
  onMarkShipped,
  onCompleteAssembly,
  onRecordFinalTestPass,
  onRecordFinalTestFail,
  onRecordComponentQcPass,
  onRecordComponentQcFail,
  onCloseDeviceCriticalNcrs,
  onCloseComponentCriticalNcrs,
  devicePageHref,
  onClose,
}: DeviceDetailsViewProps & {
  devicePageHref: string | null;
  onClose: () => void;
}) {
  return (
    <>
      <button
        className="drawer-backdrop"
        type="button"
        aria-label="Zamknij szczegóły urządzenia"
        onClick={onClose}
      />
      <aside
        className="details-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="device-details-title"
      >
        <DeviceDetailsSurface
          device={device}
          details={details}
          loadState={loadState}
          errorMessage={errorMessage}
          actionState={actionState}
          actionErrorMessage={actionErrorMessage}
          actionSuccessMessage={actionSuccessMessage}
          actionContextState={actionContextState}
          actionContextError={actionContextError}
          finalTestSessionOptions={finalTestSessionOptions}
          selectedFinalTestSessionId={selectedFinalTestSessionId}
          onSelectFinalTestSession={onSelectFinalTestSession}
          productionSessionOptions={productionSessionOptions}
          selectedProductionSessionId={selectedProductionSessionId}
          onSelectProductionSession={onSelectProductionSession}
          assemblyComponentTypeOptions={assemblyComponentTypeOptions}
          selectedAssemblyComponentType={selectedAssemblyComponentType}
          onSelectAssemblyComponentType={onSelectAssemblyComponentType}
          assemblyBarcodeValue={assemblyBarcodeValue}
          onChangeAssemblyBarcode={onChangeAssemblyBarcode}
          qualitySessionOptions={qualitySessionOptions}
          selectedQualitySessionId={selectedQualitySessionId}
          onSelectQualitySession={onSelectQualitySession}
          onMarkReadyForShipment={onMarkReadyForShipment}
          onMarkShipped={onMarkShipped}
          onCompleteAssembly={onCompleteAssembly}
          onRecordFinalTestPass={onRecordFinalTestPass}
          onRecordFinalTestFail={onRecordFinalTestFail}
          onRecordComponentQcPass={onRecordComponentQcPass}
          onRecordComponentQcFail={onRecordComponentQcFail}
          onCloseDeviceCriticalNcrs={onCloseDeviceCriticalNcrs}
          onCloseComponentCriticalNcrs={onCloseComponentCriticalNcrs}
          titleId="device-details-title"
          headerEyebrow="Szczegóły urządzenia"
          headerActions={
            <>
              {devicePageHref ? (
                <a className="ghost-button button-link" href={devicePageHref}>
                  Pełna strona
                </a>
              ) : null}
              <button className="ghost-button" type="button" onClick={onClose}>
                Zamknij
              </button>
            </>
          }
        />
      </aside>
    </>
  );
}

function DeviceDetailsPage({
  devicePageHref: _devicePageHref,
  ...props
}: DeviceDetailsViewProps & {
  devicePageHref: string | null;
}) {
  return (
    <article className="details-page">
      <div className="details-page-shell">
        <DeviceDetailsSurface
          {...props}
          titleId="device-details-page-title"
          headerEyebrow="Pełny widok urządzenia"
          headerActions={null}
        />
      </div>
    </article>
  );
}

function DeviceDetailsSurface({
  device,
  details,
  loadState,
  errorMessage,
  actionState,
  actionErrorMessage,
  actionSuccessMessage,
  actionContextState,
  actionContextError,
  finalTestSessionOptions,
  selectedFinalTestSessionId,
  onSelectFinalTestSession,
  productionSessionOptions,
  selectedProductionSessionId,
  onSelectProductionSession,
  assemblyComponentTypeOptions,
  selectedAssemblyComponentType,
  onSelectAssemblyComponentType,
  assemblyBarcodeValue,
  onChangeAssemblyBarcode,
  qualitySessionOptions,
  selectedQualitySessionId,
  onSelectQualitySession,
  onMarkReadyForShipment,
  onMarkShipped,
  onCompleteAssembly,
  onRecordFinalTestPass,
  onRecordFinalTestFail,
  onRecordComponentQcPass,
  onRecordComponentQcFail,
  onCloseDeviceCriticalNcrs,
  onCloseComponentCriticalNcrs,
  titleId,
  headerEyebrow,
  headerActions,
}: DeviceDetailsViewProps & {
  titleId: string;
  headerEyebrow: string;
  headerActions: ReactNode;
}) {
  const shipment = details?.shipment ?? null;
  const component = details?.component ?? null;
  const deviceType = device.deviceType || shipment?.device_type || component?.device_type || "Brak danych";
  const deviceVariant =
    device.variantCode ||
    shipment?.device_variant_code ||
    component?.device_variant_code ||
    "Brak danych";
  const bomCoverage = shipment?.bom_compliance.component_coverage ?? [];
  const componentRows = component?.components ?? [];
  const historyRows = details?.shipmentGateHistory ?? [];
  const componentCriticalNcrIds = Array.from(
    new Set(componentRows.flatMap((item) => item.critical_open_ncr_ids)),
  );
  const canCompleteAssembly =
    shipment !== null && shipment.recommended_action === "COMPLETE_ASSEMBLY";
  const canMarkReadyForShipment =
    shipment !== null &&
    shipment.production_status !== "READY_FOR_SHIPMENT" &&
    shipment.can_transition_to_ready_for_shipment &&
    shipment.recommended_action === "MARK_READY_FOR_SHIPMENT";
  const canRecordFinalTest =
    shipment !== null && shipment.recommended_action === "RUN_FINAL_TEST";
  const canRecordComponentQc =
    component !== null &&
    component.recommended_action === "RUN_COMPONENT_QC_OR_REWORK" &&
    component.primary_blocking_component_serial_number !== null;
  const canMarkShipped =
    shipment?.production_status === "READY_FOR_SHIPMENT";
  const isAlreadyShipped = shipment?.production_status === "SHIPPED";
  const deviceCriticalNcrCount = shipment?.critical_open_ncr_ids.length ?? 0;
  const componentCriticalNcrCount = componentCriticalNcrIds.length;

  return (
    <>
      <div className="details-drawer-header">
        <div>
          <p className="eyebrow">{headerEyebrow}</p>
          <h2 id={titleId}>{device.serialNumber}</h2>
          <p className="details-subtitle">
            {deviceType} · {deviceVariant}
          </p>
        </div>
        {headerActions ? (
          <div className="details-header-actions">{headerActions}</div>
        ) : null}
      </div>

      {loadState === "loading" ? (
        <section className="details-section">
          <strong>Ładowanie szczegółów urządzenia...</strong>
          <span className="empty-copy">
            Pobieram bramkę wysyłki, BOM, jakość komponentów i historię gate.
          </span>
        </section>
      ) : errorMessage ? (
        <section className="details-section error-banner" role="alert">
          <strong>Nie udało się pobrać szczegółów urządzenia.</strong>
          <span>{errorMessage}</span>
        </section>
      ) : shipment && component ? (
        <div className="details-content">
          <section className="details-grid">
            <DetailCard
              label="Status produkcji"
              value={labelForCode(shipment.production_status)}
            />
            <DetailCard
              label="Rekomendowana akcja"
              value={labelForCode(shipment.recommended_action)}
            />
            <DetailCard
              label="Wysyłka"
              value={
                shipment.can_transition_to_ready_for_shipment
                  ? "Gotowe"
                  : "Blokada"
              }
            />
            <DetailCard
              label="Gate komponentów"
              value={
                component.passes_component_quality_gate
                  ? "Zaliczone"
                  : "Blokada"
              }
            />
            <DetailCard
              label="Final test"
              value={labelForCode(shipment.final_test_passed)}
            />
            <DetailCard
              label="Świeżość danych"
              value={labelForCode(component.stale_bucket)}
            />
          </section>

            <DetailsSection title="Działania operacyjne">
              {actionSuccessMessage ? (
                <div className="action-banner action-banner-success" role="status">
                  <strong>Akcja wykonana.</strong>
                  <span>{actionSuccessMessage}</span>
                </div>
              ) : null}
              {actionErrorMessage ? (
                <div className="error-banner" role="alert">
                  <strong>Nie udało się wykonać akcji.</strong>
                  <span>{actionErrorMessage}</span>
                </div>
              ) : null}
              {canMarkReadyForShipment ? (
                <div className="action-row">
                  <div className="action-copy">
                    <strong>Urządzenie przechodzi shipment gate.</strong>
                    <span>
                      Możesz od razu nadać status <code>READY_FOR_SHIPMENT</code>
                      i odświeżyć kolejki bez wychodzenia z dashboardu.
                    </span>
                  </div>
                  <button
                    className="primary-button action-button"
                    type="button"
                    onClick={onMarkReadyForShipment}
                    disabled={actionState === "loading"}
                  >
                    {actionState === "loading"
                      ? "Oznaczam..."
                      : "Oznacz gotowe do wysyłki"}
                  </button>
                </div>
              ) : canMarkShipped ? (
                <div className="action-row">
                  <div className="action-copy">
                    <strong>Urządzenie jest gotowe do wysyłki.</strong>
                    <span>
                      Ostatni krok możesz zamknąć bezpośrednio tutaj, nadając
                      status <code>SHIPPED</code>.
                    </span>
                  </div>
                  <button
                    className="primary-button action-button"
                    type="button"
                    onClick={onMarkShipped}
                    disabled={actionState === "loading"}
                  >
                    {actionState === "loading"
                      ? "Oznaczam..."
                      : "Oznacz jako wysłane"}
                  </button>
                </div>
              ) : canCompleteAssembly ? (
                <div className="action-row">
                  <div className="action-copy">
                    <strong>Urządzenie wymaga domknięcia montażu.</strong>
                    <span>
                      Wybierz aktywną sesję montażową, typ brakującego
                      komponentu i zeskanowany barcode. Panel wykona od razu
                      <code> scan-component </code>
                      dla bieżącego urządzenia.
                    </span>
                    <label className="field action-field">
                      <span>Sesja montażu</span>
                      <select
                        value={selectedProductionSessionId}
                        onChange={(event) =>
                          onSelectProductionSession(event.target.value)
                        }
                        disabled={
                          actionState === "loading" ||
                          actionContextState === "loading" ||
                          productionSessionOptions.length === 0
                        }
                      >
                        {productionSessionOptions.length === 0 ? (
                          <option value="">
                            {actionContextState === "loading"
                              ? "Ładowanie aktywnych sesji..."
                              : "Brak aktywnej sesji montażowej"}
                          </option>
                        ) : (
                          productionSessionOptions.map((session) => (
                            <option
                              key={session.workSessionId}
                              value={session.workSessionId}
                            >
                              {session.label}
                            </option>
                          ))
                        )}
                      </select>
                    </label>
                    <label className="field action-field">
                      <span>Typ komponentu</span>
                      <select
                        value={selectedAssemblyComponentType}
                        onChange={(event) =>
                          onSelectAssemblyComponentType(event.target.value)
                        }
                        disabled={
                          actionState === "loading" ||
                          assemblyComponentTypeOptions.length === 0
                        }
                      >
                        {assemblyComponentTypeOptions.length === 0 ? (
                          <option value="">
                            Brak brakujących komponentów BOM do montażu
                          </option>
                        ) : (
                          assemblyComponentTypeOptions.map((componentType) => (
                            <option key={componentType} value={componentType}>
                              {labelForCode(componentType)}
                            </option>
                          ))
                        )}
                      </select>
                    </label>
                    <label className="field action-field">
                      <span>Barcode komponentu</span>
                      <input
                        value={assemblyBarcodeValue}
                        onChange={(event) =>
                          onChangeAssemblyBarcode(event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") {
                            return;
                          }

                          event.preventDefault();
                          onCompleteAssembly();
                        }}
                        disabled={actionState === "loading"}
                        placeholder="np. BC-FAN-777"
                        spellCheck={false}
                      />
                    </label>
                    {actionContextError ? (
                      <span className="action-hint">{actionContextError}</span>
                    ) : productionSessionOptions.length === 0 &&
                      actionContextState !== "loading" ? (
                      <span className="action-hint">
                        Brak aktywnej sesji z rolą montażową. Uruchom sesję
                        `PRODUCTION_OPERATOR`, `QUALITY_INSPECTOR` albo `ADMIN`.
                      </span>
                    ) : assemblyComponentTypeOptions.length === 0 ? (
                      <span className="action-hint">
                        Drawer nie widzi już brakującego komponentu BOM do
                        montażu. Odśwież szczegóły albo sprawdź, czy blocker nie
                        zmienił się na inny workflow.
                      </span>
                    ) : null}
                  </div>
                  <button
                    className="primary-button action-button"
                    type="button"
                    onClick={onCompleteAssembly}
                    disabled={
                      actionState === "loading" ||
                      actionContextState === "loading" ||
                      selectedProductionSessionId === "" ||
                      selectedAssemblyComponentType === "" ||
                      assemblyBarcodeValue.trim() === ""
                    }
                  >
                    {actionState === "loading"
                      ? "Montuję..."
                      : "Zamontuj komponent"}
                  </button>
                </div>
              ) : canRecordFinalTest ? (
                <div className="action-row">
                  <div className="action-copy">
                    <strong>Urządzenie wymaga final testu.</strong>
                    <span>
                      Wybierz aktywną sesję operatora final test i zapisz
                      bezpośrednio wynik <code>PASS</code> albo <code>FAIL</code>.
                    </span>
                    <label className="field action-field">
                      <span>Sesja final test</span>
                      <select
                        value={selectedFinalTestSessionId}
                        onChange={(event) =>
                          onSelectFinalTestSession(event.target.value)
                        }
                        disabled={
                          actionState === "loading" ||
                          actionContextState === "loading" ||
                          finalTestSessionOptions.length === 0
                        }
                      >
                        {finalTestSessionOptions.length === 0 ? (
                          <option value="">
                            {actionContextState === "loading"
                              ? "Ładowanie aktywnych sesji..."
                              : "Brak aktywnej sesji final test"}
                          </option>
                        ) : (
                          finalTestSessionOptions.map((session) => (
                            <option
                              key={session.workSessionId}
                              value={session.workSessionId}
                            >
                              {session.label}
                            </option>
                          ))
                        )}
                      </select>
                    </label>
                    {actionContextError ? (
                      <span className="action-hint">{actionContextError}</span>
                    ) : finalTestSessionOptions.length === 0 &&
                      actionContextState !== "loading" ? (
                      <span className="action-hint">
                        Brak aktywnej sesji z rolą final test. Uruchom sesję
                        `FINAL_TEST_OPERATOR` albo `QUALITY_MANAGER`.
                      </span>
                    ) : null}
                  </div>
                  <div className="action-buttons">
                    <button
                      className="primary-button action-button"
                      type="button"
                      onClick={onRecordFinalTestPass}
                      disabled={
                        actionState === "loading" ||
                        actionContextState === "loading" ||
                        selectedFinalTestSessionId === ""
                      }
                    >
                      {actionState === "loading"
                        ? "Zapisuję..."
                        : "Zapisz final test PASS"}
                    </button>
                    <button
                      className="ghost-button action-button"
                      type="button"
                      onClick={onRecordFinalTestFail}
                      disabled={
                        actionState === "loading" ||
                        actionContextState === "loading" ||
                        selectedFinalTestSessionId === ""
                      }
                    >
                      {actionState === "loading"
                        ? "Zapisuję..."
                        : "Zapisz final test FAIL"}
                    </button>
                  </div>
                </div>
              ) : canRecordComponentQc ? (
                <div className="action-row">
                  <div className="action-copy">
                    <strong>Blokujący komponent wymaga QC albo reworku.</strong>
                    <span>
                      Wybierz aktywną sesję jakościową i zapisz wynik{" "}
                      <code>PASS</code> albo <code>FAIL</code> dla komponentu{" "}
                      <code>
                        {component.primary_blocking_component_serial_number}
                      </code>{" "}
                      typu{" "}
                      <code>
                        {labelForCode(component.primary_blocking_component_type)}
                      </code>.
                    </span>
                    <label className="field action-field">
                      <span>Sesja QC komponentów</span>
                      <select
                        value={selectedQualitySessionId}
                        onChange={(event) =>
                          onSelectQualitySession(event.target.value)
                        }
                        disabled={
                          actionState === "loading" ||
                          actionContextState === "loading" ||
                          qualitySessionOptions.length === 0
                        }
                      >
                        {qualitySessionOptions.length === 0 ? (
                          <option value="">
                            {actionContextState === "loading"
                              ? "Ładowanie aktywnych sesji..."
                              : "Brak aktywnej sesji jakościowej"}
                          </option>
                        ) : (
                          qualitySessionOptions.map((session) => (
                            <option
                              key={session.workSessionId}
                              value={session.workSessionId}
                            >
                              {session.label}
                            </option>
                          ))
                        )}
                      </select>
                    </label>
                    {actionContextError ? (
                      <span className="action-hint">{actionContextError}</span>
                    ) : qualitySessionOptions.length === 0 &&
                      actionContextState !== "loading" ? (
                      <span className="action-hint">
                        Brak aktywnej sesji z rolą jakościową. Uruchom sesję
                        `QUALITY_INSPECTOR` albo `QUALITY_MANAGER`.
                      </span>
                    ) : null}
                  </div>
                  <div className="action-buttons">
                    <button
                      className="primary-button action-button"
                      type="button"
                      onClick={onRecordComponentQcPass}
                      disabled={
                        actionState === "loading" ||
                        actionContextState === "loading" ||
                        selectedQualitySessionId === ""
                      }
                    >
                      {actionState === "loading"
                        ? "Zapisuję..."
                        : "Zapisz komponentowy QC PASS"}
                    </button>
                    <button
                      className="ghost-button action-button"
                      type="button"
                      onClick={onRecordComponentQcFail}
                      disabled={
                        actionState === "loading" ||
                        actionContextState === "loading" ||
                        selectedQualitySessionId === ""
                      }
                    >
                      {actionState === "loading"
                        ? "Zapisuję..."
                        : "Zapisz komponentowy QC FAIL"}
                    </button>
                  </div>
                </div>
              ) : isAlreadyShipped ? (
                <div className="action-banner action-banner-success">
                  <strong>Urządzenie ma już status wysłane.</strong>
                  <span>
                    Dashboard zachowuje tu pełną historię gate i kontekst jakości,
                    ale ten etap operacyjny jest już zamknięty.
                  </span>
                </div>
              ) : (
                <div className="action-banner">
                  <strong>
                    Ten panel obsługuje już bezpośrednie akcje operacyjne.
                  </strong>
                  <span>
                    Obecna rekomendacja to{" "}
                    <code>{labelForCode(shipment.recommended_action)}</code>.
                    Dla tego typu akcji dashboard pokazuje pełny kontekst i blokady,
                    a kolejne workflow operacyjne dołączymy w następnych krokach.
                  </span>
                </div>
              )}
              {deviceCriticalNcrCount > 0 ? (
                <div className="action-row">
                  <div className="action-copy">
                    <strong>Aktywne krytyczne NCR urządzenia.</strong>
                    <span>
                      Możesz zamknąć {formatNumber(deviceCriticalNcrCount)} blokujące
                      NCR bezpośrednio z dashboardu i od razu odświeżyć shipment
                      gate.
                    </span>
                  </div>
                  <button
                    className="ghost-button action-button"
                    type="button"
                    onClick={onCloseDeviceCriticalNcrs}
                    disabled={actionState === "loading"}
                  >
                    {actionState === "loading"
                      ? "Zamykam..."
                      : "Zamknij krytyczne NCR urządzenia"}
                  </button>
                </div>
              ) : null}
              {componentCriticalNcrCount > 0 ? (
                <div className="action-row">
                  <div className="action-copy">
                    <strong>Aktywne krytyczne NCR komponentów.</strong>
                    <span>
                      Możesz zamknąć {formatNumber(componentCriticalNcrCount)} NCR
                      blokujące komponenty i natychmiast przeliczyć stan jakości.
                    </span>
                  </div>
                  <button
                    className="ghost-button action-button"
                    type="button"
                    onClick={onCloseComponentCriticalNcrs}
                    disabled={actionState === "loading"}
                  >
                    {actionState === "loading"
                      ? "Zamykam..."
                      : "Zamknij krytyczne NCR komponentów"}
                  </button>
                </div>
              ) : null}
            </DetailsSection>

            <DetailsSection title="Bramka wysyłki">
              <DetailsKeyGrid
                items={[
                  {
                    label: "Główna blokada",
                    value: labelForCode(shipment.primary_blocking_code),
                  },
                  {
                    label: "Komunikat",
                    value: shipment.primary_blocking_message ?? "Bez blokady",
                  },
                  {
                    label: "Krytyczne NCR urządzenia",
                    value:
                      shipment.critical_open_ncr_ids.length > 0
                        ? shipment.critical_open_ncr_ids.join(", ")
                        : "Brak",
                  },
                  {
                    label: "Ostatnia decyzja gate",
                    value: shipment.latest_shipment_gate_decision
                      ? `${labelForCode(
                          shipment.latest_shipment_gate_decision.result,
                        )} · ${formatDateTime(
                          shipment.latest_shipment_gate_decision.created_at,
                        )}`
                      : "Brak decyzji",
                  },
                ]}
              />
              <div className="details-stack">
                <strong>Powody blokady</strong>
                <TagList
                  items={shipment.blocking_reasons}
                  emptyLabel="Brak aktywnych powodów blokady."
                />
              </div>
              <div className="details-stack">
                <strong>Kontrole bramki</strong>
                {shipment.blocking_checks && shipment.blocking_checks.length > 0 ? (
                  <div className="detail-inline-grid">
                    {shipment.blocking_checks.map((check) => (
                      <article
                        className="detail-inline-card"
                        key={`${check.code}-${check.message ?? ""}`}
                      >
                        <div className="detail-inline-header">
                          <CodePill value={check.code} />
                          <BooleanPill
                            value={check.is_blocking}
                            trueLabel="Blokuje"
                            falseLabel="OK"
                          />
                        </div>
                        <p>{check.message ?? "Bez komunikatu."}</p>
                        <TagList
                          items={check.details}
                          emptyLabel="Brak dodatkowych szczegółów."
                          compact
                        />
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="empty-copy">Brak zapisanych kontroli gate.</p>
                )}
              </div>
            </DetailsSection>

            <DetailsSection title="BOM">
              <DetailsKeyGrid
                items={[
                  {
                    label: "Przechodzi BOM",
                    value: labelForCode(shipment.bom_compliance.passes_bom_gate),
                  },
                  {
                    label: "Źródło BOM",
                    value: labelForCode(
                      shipment.bom_compliance.resolution_source ?? null,
                    ),
                  },
                  {
                    label: "Wersja BOM",
                    value:
                      shipment.bom_compliance.resolved_version ?? "Brak danych",
                  },
                  {
                    label: "Status BOM",
                    value: labelForCode(
                      shipment.bom_compliance.resolved_status ?? null,
                    ),
                  },
                ]}
              />
              <div className="detail-inline-grid">
                <InlineListCard
                  title="Brakujące komponenty BOM"
                  items={shipment.bom_compliance.missing_required_components}
                  emptyLabel="Brak brakujących komponentów."
                />
                <InlineListCard
                  title="Nadmiarowe komponenty BOM"
                  items={shipment.bom_compliance.over_installed_components}
                  emptyLabel="Brak nadmiarowych komponentów."
                />
                <InlineListCard
                  title="Nieoczekiwane komponenty BOM"
                  items={shipment.bom_compliance.unexpected_component_types}
                  emptyLabel="Brak nieoczekiwanych komponentów."
                />
              </div>
              <div className="details-stack">
                <strong>Pokrycie BOM</strong>
                {bomCoverage.length > 0 ? (
                  <div className="detail-inline-grid">
                    {bomCoverage.map((coverage) => (
                      <article
                        className="detail-inline-card"
                        key={`${coverage.component_type}-${coverage.status}`}
                      >
                        <div className="detail-inline-header">
                          <CodePill value={coverage.component_type} />
                          <CodePill value={coverage.status} />
                        </div>
                        <p>
                          Wymagane {formatNumber(coverage.required_quantity)} ·
                          zamontowane {formatNumber(coverage.installed_quantity)}
                        </p>
                        <TagList
                          items={coverage.allowed_component_types ?? []}
                          emptyLabel={
                            coverage.substitution_group
                              ? `Grupa ${coverage.substitution_group}`
                              : coverage.is_required
                                ? "Pozycja wymagana"
                                : "Pozycja opcjonalna"
                          }
                          compact
                        />
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="empty-copy">Brak pozycji coverage dla tego BOM.</p>
                )}
              </div>
            </DetailsSection>

            <DetailsSection title="Kontrola jakości komponentów">
              <DetailsKeyGrid
                items={[
                  {
                    label: "Główny status jakości",
                    value: labelForCode(component.primary_quality_status),
                  },
                  {
                    label: "Blokujący komponent",
                    value: labelForCode(
                      component.primary_blocking_component_type,
                    ),
                  },
                  {
                    label: "Serial blokującego komponentu",
                    value:
                      component.primary_blocking_component_serial_number ??
                      "Brak serialu",
                  },
                  {
                    label: "Komponenty blokujące",
                    value: formatNumber(component.blocked_components),
                  },
                ]}
              />
              <div className="details-stack">
                <strong>Zamontowane komponenty</strong>
                {componentRows.length > 0 ? (
                  <div className="detail-component-list">
                    {componentRows.map((item) => (
                      <article
                        className="detail-component-card"
                        key={item.component_serial_number}
                      >
                        <div className="detail-inline-header">
                          <CodePill value={item.component_type} />
                          <CodePill value={item.quality_status} />
                        </div>
                        <strong>{item.component_serial_number}</strong>
                        <span>Barcode: {item.child_barcode_value}</span>
                        <span>
                          QC snapshot: {labelForCode(item.component_qc_passed)}
                        </span>
                        <span>
                          Blokuje wysyłkę: {labelForCode(item.blocks_shipment)}
                        </span>
                        <TagList
                          items={item.critical_open_ncr_ids}
                          emptyLabel="Brak krytycznych NCR."
                          compact
                        />
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="empty-copy">
                    Brak szczegółów zamontowanych komponentów.
                  </p>
                )}
              </div>
            </DetailsSection>

            <DetailsSection title="Historia shipment gate">
              {historyRows.length > 0 ? (
                <div className="detail-history-list">
                  {historyRows.map((event) => (
                    <article className="detail-history-card" key={event.id}>
                      <div className="detail-inline-header">
                        <CodePill value={event.event_type} />
                        <CodePill value={event.result} />
                      </div>
                      <strong>{formatDateTime(event.created_at)}</strong>
                      <p>{event.message ?? "Bez komunikatu."}</p>
                      <span>
                        Żądany status:{" "}
                        {labelForCode(
                          typeof event.payload?.requested_status === "string"
                            ? event.payload.requested_status
                            : null,
                        )}
                      </span>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="empty-copy">Brak historii shipment gate.</p>
              )}
            </DetailsSection>
          </div>
      ) : (
        <section className="details-section">
          <strong>Nie znaleziono danych szczegółowych.</strong>
        </section>
      )}
    </>
  );
}

function DetailsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="details-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function DetailsKeyGrid({
  items,
}: {
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="details-key-grid">
      {items.map((item) => (
        <article className="detail-key-card" key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </article>
      ))}
    </div>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="detail-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function InlineListCard({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: string[];
  emptyLabel: string;
}) {
  return (
    <article className="detail-inline-card">
      <strong>{title}</strong>
      <TagList items={items} emptyLabel={emptyLabel} compact />
    </article>
  );
}

function TagList({
  items,
  emptyLabel,
  compact = false,
}: {
  items: string[];
  emptyLabel: string;
  compact?: boolean;
}) {
  if (items.length === 0) {
    return <p className="empty-copy">{emptyLabel}</p>;
  }

  return (
    <div className={`tag-list ${compact ? "is-compact" : ""}`}>
      {items.map((item) => (
        <span className="tag-chip" key={item}>
          {labelForCode(item)}
        </span>
      ))}
    </div>
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
        operatorId: session.operator_id,
        workstationId: session.workstation_id,
        machineId: session.machine_id,
        role: operator.role,
        label: `${operator.full_name} (${operator.operator_id}) · ${formatOperatorRole(
          operator.role,
        )} · ${session.workstation_id}`,
      };
    })
    .filter((session): session is ActionWorkSessionOption => session !== null);
}

function buildAssemblyComponentTypeOptions(
  componentCoverage: DeviceBomComponentCoverage[],
): string[] {
  const options: string[] = [];

  for (const coverageRow of componentCoverage) {
    if (
      !coverageRow.is_required ||
      coverageRow.installed_quantity >= coverageRow.required_quantity
    ) {
      continue;
    }

    const allowedComponentTypes =
      coverageRow.allowed_component_types &&
      coverageRow.allowed_component_types.length > 0
        ? coverageRow.allowed_component_types
        : [coverageRow.component_type];

    for (const componentType of allowedComponentTypes) {
      if (!options.includes(componentType)) {
        options.push(componentType);
      }
    }
  }

  return options;
}

function formatOperatorRole(role: string): string {
  return role
    .toLowerCase()
    .split("_")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function buildClientRunId(prefix: string, serialNumber: string): string {
  const normalizedSerial = serialNumber
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase()
    .slice(-18);

  return `${prefix}-${normalizedSerial || "DEVICE"}-${Date.now().toString(36).toUpperCase()}`;
}

function StatusBadge({ loadState }: { loadState: LoadState }) {
  const labels: Record<LoadState, string> = {
    idle: "Gotowe",
    loading: "Ładowanie",
    loaded: "API OK",
    error: "Błąd API",
  };

  return <span className={`status-badge state-${loadState}`}>{labels[loadState]}</span>;
}

function TextField({
  label,
  value,
  onChange,
  onCommit,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onCommit?: () => void;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") {
            return;
          }

          event.preventDefault();
          onCommit?.();
        }}
        placeholder={placeholder}
        spellCheck={false}
      />
    </label>
  );
}

type SelectOption = {
  value: string;
  disabled?: boolean;
};

function SelectField({
  label,
  value,
  options,
  onChange,
  allowEmpty = true,
  disabled = false,
}: {
  label: string;
  value: string;
  options: Array<string | SelectOption>;
  onChange: (value: string) => void;
  allowEmpty?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        disabled={disabled}
        value={value}
        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
          onChange(event.target.value)
        }
      >
        {allowEmpty ? <option value="">Wszystkie</option> : null}
        {options.map((option) => {
          const normalizedOption =
            typeof option === "string"
              ? { value: option, disabled: false }
              : { value: option.value, disabled: option.disabled ?? false };

          return (
            <option
              key={normalizedOption.value}
              value={normalizedOption.value}
              disabled={normalizedOption.disabled}
            >
              {labelForCode(normalizedOption.value)}
            </option>
          );
        })}
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

function reconcileShipmentFilterChange<Key extends keyof ShipmentFilters>(
  previous: ShipmentFilters,
  key: Key,
  value: ShipmentFilters[Key],
): ShipmentFilters {
  const next = {
    ...previous,
    [key]: value,
  } as ShipmentFilters;

  if (key === "only_blocked" && next.only_blocked) {
    next.only_ready = false;
    if (next.recommended_action === "MARK_READY_FOR_SHIPMENT") {
      next.recommended_action = "";
    }
    return next;
  }

  if (key === "only_ready" && next.only_ready) {
    next.only_blocked = false;
    next.primary_blocking_code = "";
    if (
      next.recommended_action !== "" &&
      next.recommended_action !== "MARK_READY_FOR_SHIPMENT"
    ) {
      next.recommended_action = "";
    }
    return next;
  }

  if (key === "primary_blocking_code" && next.primary_blocking_code !== "") {
    next.only_ready = false;
    return next;
  }

  if (key === "recommended_action") {
    if (next.recommended_action === "MARK_READY_FOR_SHIPMENT") {
      next.only_blocked = false;
    } else if (next.recommended_action !== "") {
      next.only_ready = false;
    }
  }

  return next;
}

function sanitizeShipmentFilters(filters: ShipmentFilters): ShipmentFilters {
  const next = { ...filters };

  if (next.only_ready) {
    next.only_blocked = false;
    next.primary_blocking_code = "";
    if (
      next.recommended_action !== "" &&
      next.recommended_action !== "MARK_READY_FOR_SHIPMENT"
    ) {
      next.recommended_action = "";
    }
  }

  if (
    next.only_blocked &&
    next.recommended_action === "MARK_READY_FOR_SHIPMENT"
  ) {
    next.recommended_action = "";
  }

  return next;
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

function readStoredDashboardMode(): DashboardMode {
  const storedValue = localStorage.getItem(VIEW_STORAGE_KEY);
  return storedValue === "components" ? "components" : "shipment";
}

function readDashboardUrlState(): DashboardUrlState {
  const searchParams = new URLSearchParams(window.location.search);
  const devicePageSerial = readDevicePageSerial(window.location.pathname);

  return {
    activeView:
      searchParams.get(URL_VIEW_KEY) === "components"
        ? "components"
        : searchParams.get(URL_VIEW_KEY) === "shipment"
          ? "shipment"
          : null,
    hasShipmentFilters: hasUrlFilterPrefix(searchParams, URL_SHIPMENT_PREFIX),
    hasComponentFilters: hasUrlFilterPrefix(searchParams, URL_COMPONENT_PREFIX),
    searchParams,
    isDevicePage: devicePageSerial !== null,
    devicePageSerial,
  };
}

function readShipmentFiltersFromUrl(
  searchParams: URLSearchParams,
  hasShipmentFilters: boolean,
): ShipmentFilters {
  const baseFilters = hasShipmentFilters
    ? DEFAULT_SHIPMENT_FILTERS
    : readStoredShipmentFilters();

  return sanitizeShipmentFilters({
    device_type: readSearchString(
      searchParams,
      `${URL_SHIPMENT_PREFIX}device_type`,
      baseFilters.device_type,
    ),
    variant_code: readSearchString(
      searchParams,
      `${URL_SHIPMENT_PREFIX}variant_code`,
      baseFilters.variant_code,
    ),
    production_status: readSearchOption(
      searchParams,
      `${URL_SHIPMENT_PREFIX}production_status`,
      PRODUCTION_STATUS_OPTIONS,
      baseFilters.production_status,
    ),
    primary_blocking_code: readSearchOption(
      searchParams,
      `${URL_SHIPMENT_PREFIX}primary_blocking_code`,
      SHIPMENT_BLOCKING_OPTIONS,
      baseFilters.primary_blocking_code,
    ),
    recommended_action: readSearchOption(
      searchParams,
      `${URL_SHIPMENT_PREFIX}recommended_action`,
      SHIPMENT_ACTION_OPTIONS,
      baseFilters.recommended_action,
    ),
    latest_gate_result: readSearchOption(
      searchParams,
      `${URL_SHIPMENT_PREFIX}latest_gate_result`,
      SHIPMENT_GATE_RESULT_OPTIONS,
      baseFilters.latest_gate_result,
    ),
    only_blocked: readSearchBoolean(
      searchParams,
      `${URL_SHIPMENT_PREFIX}only_blocked`,
      baseFilters.only_blocked,
    ),
    only_ready: readSearchBoolean(
      searchParams,
      `${URL_SHIPMENT_PREFIX}only_ready`,
      baseFilters.only_ready,
    ),
    sort_by: readSearchOption(
      searchParams,
      `${URL_SHIPMENT_PREFIX}sort_by`,
      SHIPMENT_SORT_OPTIONS,
      baseFilters.sort_by,
    ),
    sort_desc: readSearchBoolean(
      searchParams,
      `${URL_SHIPMENT_PREFIX}sort_desc`,
      baseFilters.sort_desc,
    ),
    limit: clampLimit(
      readSearchNumber(
        searchParams,
        `${URL_SHIPMENT_PREFIX}limit`,
        baseFilters.limit,
      ),
    ),
    offset: clampOffset(
      readSearchNumber(
        searchParams,
        `${URL_SHIPMENT_PREFIX}offset`,
        baseFilters.offset,
      ),
    ),
  });
}

function readComponentFiltersFromUrl(
  searchParams: URLSearchParams,
  hasComponentFilters: boolean,
): ComponentFilters {
  const baseFilters = hasComponentFilters
    ? DEFAULT_COMPONENT_FILTERS
    : readStoredComponentFilters();

  return {
    device_type: readSearchString(
      searchParams,
      `${URL_COMPONENT_PREFIX}device_type`,
      baseFilters.device_type,
    ),
    variant_code: readSearchString(
      searchParams,
      `${URL_COMPONENT_PREFIX}variant_code`,
      baseFilters.variant_code,
    ),
    production_status: readSearchOption(
      searchParams,
      `${URL_COMPONENT_PREFIX}production_status`,
      PRODUCTION_STATUS_OPTIONS,
      baseFilters.production_status,
    ),
    blocking_component_type: readSearchString(
      searchParams,
      `${URL_COMPONENT_PREFIX}blocking_component_type`,
      baseFilters.blocking_component_type,
    ),
    primary_quality_status: readSearchOption(
      searchParams,
      `${URL_COMPONENT_PREFIX}primary_quality_status`,
      COMPONENT_STATUS_OPTIONS,
      baseFilters.primary_quality_status,
    ),
    stale_bucket: readSearchOption(
      searchParams,
      `${URL_COMPONENT_PREFIX}stale_bucket`,
      COMPONENT_STALE_OPTIONS,
      baseFilters.stale_bucket,
    ),
    recommended_action: readSearchOption(
      searchParams,
      `${URL_COMPONENT_PREFIX}recommended_action`,
      COMPONENT_ACTION_OPTIONS,
      baseFilters.recommended_action,
    ),
    passes_component_quality_gate: readSearchOptionalBooleanString(
      searchParams,
      `${URL_COMPONENT_PREFIX}passes_component_quality_gate`,
      baseFilters.passes_component_quality_gate,
    ),
    only_blocking: readSearchBoolean(
      searchParams,
      `${URL_COMPONENT_PREFIX}only_blocking`,
      baseFilters.only_blocking,
    ),
    sort_by: readSearchOption(
      searchParams,
      `${URL_COMPONENT_PREFIX}sort_by`,
      COMPONENT_SORT_OPTIONS,
      baseFilters.sort_by,
    ),
    sort_desc: readSearchBoolean(
      searchParams,
      `${URL_COMPONENT_PREFIX}sort_desc`,
      baseFilters.sort_desc,
    ),
    limit: clampLimit(
      readSearchNumber(
        searchParams,
        `${URL_COMPONENT_PREFIX}limit`,
        baseFilters.limit,
      ),
    ),
    offset: clampOffset(
      readSearchNumber(
        searchParams,
        `${URL_COMPONENT_PREFIX}offset`,
        baseFilters.offset,
      ),
    ),
  };
}

function readSelectedDeviceFromUrl(
  searchParams: URLSearchParams,
  devicePageSerial: string | null = null,
): DeviceSelection | null {
  const serialNumber =
    devicePageSerial ??
    searchParams.get(URL_DEVICE_SERIAL_KEY)?.trim() ??
    "";

  if (serialNumber === "") {
    return null;
  }

  return {
    serialNumber,
    deviceType: searchParams.get(URL_DEVICE_TYPE_KEY)?.trim() ?? "",
    variantCode: searchParams.get(URL_DEVICE_VARIANT_KEY)?.trim() ?? "",
  };
}

function readStoredShipmentFilters(): ShipmentFilters {
  const storedValue = readStoredObject(SHIPMENT_FILTERS_STORAGE_KEY);

  return sanitizeShipmentFilters({
    device_type: readStoredString(
      storedValue.device_type,
      DEFAULT_SHIPMENT_FILTERS.device_type,
    ),
    variant_code: readStoredString(
      storedValue.variant_code,
      DEFAULT_SHIPMENT_FILTERS.variant_code,
    ),
    production_status: readStoredOption(
      storedValue.production_status,
      PRODUCTION_STATUS_OPTIONS,
      DEFAULT_SHIPMENT_FILTERS.production_status,
    ),
    primary_blocking_code: readStoredOption(
      storedValue.primary_blocking_code,
      SHIPMENT_BLOCKING_OPTIONS,
      DEFAULT_SHIPMENT_FILTERS.primary_blocking_code,
    ),
    recommended_action: readStoredOption(
      storedValue.recommended_action,
      SHIPMENT_ACTION_OPTIONS,
      DEFAULT_SHIPMENT_FILTERS.recommended_action,
    ),
    latest_gate_result: readStoredOption(
      storedValue.latest_gate_result,
      SHIPMENT_GATE_RESULT_OPTIONS,
      DEFAULT_SHIPMENT_FILTERS.latest_gate_result,
    ),
    only_blocked: readStoredBoolean(
      storedValue.only_blocked,
      DEFAULT_SHIPMENT_FILTERS.only_blocked,
    ),
    only_ready: readStoredBoolean(
      storedValue.only_ready,
      DEFAULT_SHIPMENT_FILTERS.only_ready,
    ),
    sort_by: readStoredOption(
      storedValue.sort_by,
      SHIPMENT_SORT_OPTIONS,
      DEFAULT_SHIPMENT_FILTERS.sort_by,
    ),
    sort_desc: readStoredBoolean(
      storedValue.sort_desc,
      DEFAULT_SHIPMENT_FILTERS.sort_desc,
    ),
    limit: clampLimit(
      readStoredNumber(storedValue.limit, DEFAULT_SHIPMENT_FILTERS.limit),
    ),
    offset: clampOffset(
      readStoredNumber(storedValue.offset, DEFAULT_SHIPMENT_FILTERS.offset),
    ),
  });
}

function readStoredComponentFilters(): ComponentFilters {
  const storedValue = readStoredObject(COMPONENT_FILTERS_STORAGE_KEY);

  return {
    device_type: readStoredString(
      storedValue.device_type,
      DEFAULT_COMPONENT_FILTERS.device_type,
    ),
    variant_code: readStoredString(
      storedValue.variant_code,
      DEFAULT_COMPONENT_FILTERS.variant_code,
    ),
    production_status: readStoredOption(
      storedValue.production_status,
      PRODUCTION_STATUS_OPTIONS,
      DEFAULT_COMPONENT_FILTERS.production_status,
    ),
    blocking_component_type: readStoredString(
      storedValue.blocking_component_type,
      DEFAULT_COMPONENT_FILTERS.blocking_component_type,
    ),
    primary_quality_status: readStoredOption(
      storedValue.primary_quality_status,
      COMPONENT_STATUS_OPTIONS,
      DEFAULT_COMPONENT_FILTERS.primary_quality_status,
    ),
    stale_bucket: readStoredOption(
      storedValue.stale_bucket,
      COMPONENT_STALE_OPTIONS,
      DEFAULT_COMPONENT_FILTERS.stale_bucket,
    ),
    recommended_action: readStoredOption(
      storedValue.recommended_action,
      COMPONENT_ACTION_OPTIONS,
      DEFAULT_COMPONENT_FILTERS.recommended_action,
    ),
    passes_component_quality_gate: readStoredOptionalBooleanString(
      storedValue.passes_component_quality_gate,
      DEFAULT_COMPONENT_FILTERS.passes_component_quality_gate,
    ),
    only_blocking: readStoredBoolean(
      storedValue.only_blocking,
      DEFAULT_COMPONENT_FILTERS.only_blocking,
    ),
    sort_by: readStoredOption(
      storedValue.sort_by,
      COMPONENT_SORT_OPTIONS,
      DEFAULT_COMPONENT_FILTERS.sort_by,
    ),
    sort_desc: readStoredBoolean(
      storedValue.sort_desc,
      DEFAULT_COMPONENT_FILTERS.sort_desc,
    ),
    limit: clampLimit(
      readStoredNumber(storedValue.limit, DEFAULT_COMPONENT_FILTERS.limit),
    ),
    offset: clampOffset(
      readStoredNumber(storedValue.offset, DEFAULT_COMPONENT_FILTERS.offset),
    ),
  };
}

function readStoredObject(storageKey: string): Record<string, unknown> {
  const rawValue = localStorage.getItem(storageKey);

  if (!rawValue) {
    return {};
  }

  try {
    const parsedValue = JSON.parse(rawValue);
    return isRecord(parsedValue) ? parsedValue : {};
  } catch {
    return {};
  }
}

function readStoredString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function readStoredOption(
  value: unknown,
  allowedValues: string[],
  fallback: string,
): string {
  return typeof value === "string" && allowedValues.includes(value)
    ? value
    : fallback;
}

function readStoredBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readStoredNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readStoredOptionalBooleanString(
  value: unknown,
  fallback: OptionalBooleanString,
): OptionalBooleanString {
  return value === "" || value === "true" || value === "false"
    ? value
    : fallback;
}

function buildDashboardUrlSearch({
  activeView,
  shipmentFilters,
  componentFilters,
  selectedDevice,
}: {
  activeView: DashboardMode;
  shipmentFilters: ShipmentFilters;
  componentFilters: ComponentFilters;
  selectedDevice: DeviceSelection | null;
}): string {
  const searchParams = new URLSearchParams();

  searchParams.set(URL_VIEW_KEY, activeView);
  writeShipmentFiltersToSearchParams(searchParams, shipmentFilters);
  writeComponentFiltersToSearchParams(searchParams, componentFilters);

  if (selectedDevice) {
    searchParams.set(URL_DEVICE_SERIAL_KEY, selectedDevice.serialNumber);

    if (selectedDevice.deviceType.trim() !== "") {
      searchParams.set(URL_DEVICE_TYPE_KEY, selectedDevice.deviceType);
    }

    if (selectedDevice.variantCode.trim() !== "") {
      searchParams.set(URL_DEVICE_VARIANT_KEY, selectedDevice.variantCode);
    }
  }

  const search = searchParams.toString();
  return search ? `?${search}` : "";
}

function buildDashboardLocationHref({
  pathname,
  activeView,
  shipmentFilters,
  componentFilters,
  selectedDevice,
}: {
  pathname: string;
  activeView: DashboardMode;
  shipmentFilters: ShipmentFilters;
  componentFilters: ComponentFilters;
  selectedDevice: DeviceSelection | null;
}): string {
  return `${pathname}${buildDashboardUrlSearch({
    activeView,
    shipmentFilters,
    componentFilters,
    selectedDevice,
  })}`;
}

function buildDeviceDetailsPath(serialNumber: string): string {
  return `${DEVICE_DETAILS_PATH_PREFIX}${encodeURIComponent(serialNumber)}`;
}

function readDevicePageSerial(pathname: string): string | null {
  if (!pathname.startsWith(DEVICE_DETAILS_PATH_PREFIX)) {
    return null;
  }

  const encodedSerial = pathname
    .slice(DEVICE_DETAILS_PATH_PREFIX.length)
    .split("/")[0]
    ?.trim();
  if (!encodedSerial) {
    return null;
  }

  try {
    return decodeURIComponent(encodedSerial);
  } catch {
    return encodedSerial;
  }
}

function writeShipmentFiltersToSearchParams(
  searchParams: URLSearchParams,
  filters: ShipmentFilters,
): void {
  searchParams.set(`${URL_SHIPMENT_PREFIX}sort_by`, filters.sort_by);
  searchParams.set(
    `${URL_SHIPMENT_PREFIX}sort_desc`,
    String(filters.sort_desc),
  );
  searchParams.set(`${URL_SHIPMENT_PREFIX}limit`, String(clampLimit(filters.limit)));
  searchParams.set(
    `${URL_SHIPMENT_PREFIX}offset`,
    String(clampOffset(filters.offset)),
  );
  searchParams.set(
    `${URL_SHIPMENT_PREFIX}only_blocked`,
    String(filters.only_blocked),
  );
  searchParams.set(`${URL_SHIPMENT_PREFIX}only_ready`, String(filters.only_ready));
  setOptionalSearchString(
    searchParams,
    `${URL_SHIPMENT_PREFIX}device_type`,
    filters.device_type,
  );
  setOptionalSearchString(
    searchParams,
    `${URL_SHIPMENT_PREFIX}variant_code`,
    filters.variant_code,
  );
  setOptionalSearchString(
    searchParams,
    `${URL_SHIPMENT_PREFIX}production_status`,
    filters.production_status,
  );
  setOptionalSearchString(
    searchParams,
    `${URL_SHIPMENT_PREFIX}primary_blocking_code`,
    filters.primary_blocking_code,
  );
  setOptionalSearchString(
    searchParams,
    `${URL_SHIPMENT_PREFIX}recommended_action`,
    filters.recommended_action,
  );
  setOptionalSearchString(
    searchParams,
    `${URL_SHIPMENT_PREFIX}latest_gate_result`,
    filters.latest_gate_result,
  );
}

function writeComponentFiltersToSearchParams(
  searchParams: URLSearchParams,
  filters: ComponentFilters,
): void {
  searchParams.set(`${URL_COMPONENT_PREFIX}sort_by`, filters.sort_by);
  searchParams.set(
    `${URL_COMPONENT_PREFIX}sort_desc`,
    String(filters.sort_desc),
  );
  searchParams.set(
    `${URL_COMPONENT_PREFIX}limit`,
    String(clampLimit(filters.limit)),
  );
  searchParams.set(
    `${URL_COMPONENT_PREFIX}offset`,
    String(clampOffset(filters.offset)),
  );
  searchParams.set(
    `${URL_COMPONENT_PREFIX}only_blocking`,
    String(filters.only_blocking),
  );
  setOptionalSearchString(
    searchParams,
    `${URL_COMPONENT_PREFIX}device_type`,
    filters.device_type,
  );
  setOptionalSearchString(
    searchParams,
    `${URL_COMPONENT_PREFIX}variant_code`,
    filters.variant_code,
  );
  setOptionalSearchString(
    searchParams,
    `${URL_COMPONENT_PREFIX}production_status`,
    filters.production_status,
  );
  setOptionalSearchString(
    searchParams,
    `${URL_COMPONENT_PREFIX}blocking_component_type`,
    filters.blocking_component_type,
  );
  setOptionalSearchString(
    searchParams,
    `${URL_COMPONENT_PREFIX}primary_quality_status`,
    filters.primary_quality_status,
  );
  setOptionalSearchString(
    searchParams,
    `${URL_COMPONENT_PREFIX}stale_bucket`,
    filters.stale_bucket,
  );
  setOptionalSearchString(
    searchParams,
    `${URL_COMPONENT_PREFIX}recommended_action`,
    filters.recommended_action,
  );
  setOptionalSearchString(
    searchParams,
    `${URL_COMPONENT_PREFIX}passes_component_quality_gate`,
    filters.passes_component_quality_gate,
  );
}

function hasUrlFilterPrefix(
  searchParams: URLSearchParams,
  prefix: string,
): boolean {
  return Array.from(searchParams.keys()).some((key) => key.startsWith(prefix));
}

function setOptionalSearchString(
  searchParams: URLSearchParams,
  key: string,
  value: string,
): void {
  const normalizedValue = value.trim();

  if (normalizedValue === "") {
    return;
  }

  searchParams.set(key, normalizedValue);
}

function readSearchString(
  searchParams: URLSearchParams,
  key: string,
  fallback: string,
): string {
  const value = searchParams.get(key);
  return value === null ? fallback : value;
}

function readSearchOption(
  searchParams: URLSearchParams,
  key: string,
  allowedValues: string[],
  fallback: string,
): string {
  const value = searchParams.get(key);
  return value !== null && allowedValues.includes(value) ? value : fallback;
}

function readSearchBoolean(
  searchParams: URLSearchParams,
  key: string,
  fallback: boolean,
): boolean {
  const value = searchParams.get(key);

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return fallback;
}

function readSearchNumber(
  searchParams: URLSearchParams,
  key: string,
  fallback: number,
): number {
  const value = searchParams.get(key);

  if (value === null) {
    return fallback;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function readSearchOptionalBooleanString(
  searchParams: URLSearchParams,
  key: string,
  fallback: OptionalBooleanString,
): OptionalBooleanString {
  const value = searchParams.get(key);
  return value === "" || value === "true" || value === "false"
    ? value
    : fallback;
}

function clampOffset(value: number): number {
  return Math.max(Math.trunc(value), 0);
}

function useDebouncedRequestFilters<T extends object>(
  filters: T,
  textKeys: Array<keyof T>,
  delayMs: number,
): [T, (nextFilters?: T) => void, boolean] {
  const [requestFilters, setRequestFilters] = useState(filters);
  const [hasPendingTextChanges, setHasPendingTextChanges] = useState(false);
  const previousFiltersRef = useRef(filters);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = (nextFilters: T = filters) => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    previousFiltersRef.current = nextFilters;
    setRequestFilters(nextFilters);
    setHasPendingTextChanges(false);
  };

  useEffect(() => {
    const previousFilters = previousFiltersRef.current;
    const changedKeys = (Object.keys(filters) as Array<keyof T>).filter(
      (key) => !Object.is(filters[key], previousFilters[key]),
    );

    if (changedKeys.length === 0) {
      return;
    }

    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const onlyTextChanges = changedKeys.every((key) => textKeys.includes(key));

    if (onlyTextChanges) {
      setHasPendingTextChanges(true);
      timeoutRef.current = setTimeout(() => {
        previousFiltersRef.current = filters;
        setRequestFilters(filters);
        setHasPendingTextChanges(false);
        timeoutRef.current = null;
      }, delayMs);
    } else {
      setRequestFilters(filters);
      setHasPendingTextChanges(false);
    }

    previousFiltersRef.current = filters;
  }, [delayMs, filters, textKeys]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return [requestFilters, flush, hasPendingTextChanges];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
