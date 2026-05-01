const CODE_LABELS: Record<string, string> = {
  ACTIVATE_OR_CONFIGURE_BOM: "Aktywuj lub skonfiguruj BOM",
  BLOCKED: "Zablokowane",
  BOM_OVER_INSTALLED_COMPONENTS: "Nadmiarowe komponenty BOM",
  BOM_REQUIRED_COMPONENTS_MISSING: "Brak wymaganych komponentów BOM",
  BOM_TEMPLATE_NOT_EFFECTIVE: "BOM nieaktywny",
  BOM_UNEXPECTED_COMPONENTS: "Nieoczekiwane komponenty BOM",
  COMPONENT_CRITICAL_OPEN_NCR: "Krytyczne NCR komponentu",
  COMPONENT_QC_NOT_PASSED: "QC komponentu niezaliczone",
  COMPLETE_ASSEMBLY: "Dokończ montaż",
  CREATED: "Utworzone",
  CRITICAL_NCR_OPEN: "Krytyczne NCR otwarte",
  CRITICAL_OPEN_NCR: "Krytyczne NCR otwarte",
  D1_TO_D3: "1-3 dni",
  D3_TO_D7: "3-7 dni",
  FINAL_TEST_NOT_PASSED: "Final test niezaliczony",
  FINAL_TEST_PASSED: "Final test zaliczony",
  FIX_ASSEMBLY_MISMATCH: "Napraw niezgodność montażu",
  GT_7D: "Powyżej 7 dni",
  LT_24H: "Poniżej 24h",
  MARK_READY_FOR_SHIPMENT: "Oznacz gotowe do wysyłki",
  NO_ACTION: "Bez akcji",
  NONE: "Brak decyzji",
  PASS: "PASS",
  QC_NOT_PASSED: "QC niezaliczone",
  READY_FOR_SHIPMENT: "Gotowe do wysyłki",
  RESOLVE_COMPONENT_NCR: "Zamknij NCR komponentu",
  RESOLVE_COMPONENT_QUALITY: "Rozwiąż jakość komponentu",
  RESOLVE_CRITICAL_NCR: "Zamknij krytyczne NCR",
  RUN_COMPONENT_QC_OR_REWORK: "Uruchom QC komponentu / rework",
  RUN_FINAL_TEST: "Uruchom final test",
  SHIPPED: "Wysłane",
};

export function humanizeCode(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b[a-z0-9]/g, (character) => character.toUpperCase());
}

export function labelForCode(
  value: string | boolean | null | undefined,
): string {
  if (value === true) {
    return "Tak";
  }

  if (value === false) {
    return "Nie";
  }

  if (!value) {
    return "Brak danych";
  }

  return CODE_LABELS[value] ?? humanizeCode(value);
}

export function formatNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat("pl-PL").format(value ?? 0);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "Brak danych";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Nieprawidłowa data";
  }

  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function percentage(part: number, total: number): string {
  if (total <= 0) {
    return "0%";
  }

  return `${Math.round((part / total) * 100)}%`;
}
