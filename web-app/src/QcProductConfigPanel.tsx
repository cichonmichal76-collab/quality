import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import {
  createQcChecklist,
  createQcChecklistStep,
  deleteQcChecklistStep,
  getQcProductConfiguration,
  joinApiUrl,
  listQcChecklists,
  listQcChecklistSteps,
  updateQcChecklist,
  updateQcChecklistStep,
  uploadQcChecklistReferenceImage,
} from "./api";
import type {
  LoadState,
  QcChecklistRead,
  QcProductComponentConfigRead,
  QcProductConfigurationRead,
  QcStepCreatePayload,
  QcStepRead,
} from "./api";
import { QcReferenceImage } from "./QcReferenceImage";
import { labelForCode } from "./dashboard";

const PROCESS_STAGE_OPTIONS = ["COMPONENT_QC", "MECHANICAL_QC", "ELECTRONICS_QC"] as const;
const EVALUATION_MODE_OPTIONS = ["MANUAL", "NUMERIC_RANGE", "TEXT_MATCH"] as const;

type EvaluationMode = (typeof EVALUATION_MODE_OPTIONS)[number];

interface QcProductConfigPanelProps {
  apiBaseUrl: string;
}

interface ChecklistEditorState {
  checklistCode: string;
  name: string;
  processStage: string;
  version: string;
  skipComponentQc: boolean;
  isActive: boolean;
  referenceImageFileId: string | null;
}

interface StepEditorState {
  localId: string;
  id: string | null;
  title: string;
  instruction: string;
  controlArea: string;
  evaluationMode: EvaluationMode;
  resultInputLabel: string;
  regionX: string;
  regionY: string;
  regionWidth: string;
  regionHeight: string;
  requiresPhoto: boolean;
  blockingOnFail: boolean;
  expectedValue: string;
  unit: string;
  toleranceMin: string;
  toleranceMax: string;
}

export function QcProductConfigPanel({ apiBaseUrl }: QcProductConfigPanelProps) {
  const [deviceType, setDeviceType] = useState("");
  const [variantCode, setVariantCode] = useState("DEFAULT");
  const [configurationState, setConfigurationState] = useState<LoadState>("idle");
  const [configurationError, setConfigurationError] = useState<string | null>(null);
  const [configuration, setConfiguration] = useState<QcProductConfigurationRead | null>(null);
  const [selectedComponentType, setSelectedComponentType] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<LoadState>("idle");
  const [editorError, setEditorError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<LoadState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [checklistForm, setChecklistForm] = useState<ChecklistEditorState | null>(null);
  const [stepDrafts, setStepDrafts] = useState<StepEditorState[]>([]);
  const [deletedStepIds, setDeletedStepIds] = useState<string[]>([]);
  const [selectedReferenceImage, setSelectedReferenceImage] = useState<File | null>(null);
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(null);

  const selectedComponent =
    configuration?.items.find((item) => item.component_type === selectedComponentType) ?? null;
  const controlledCount =
    configuration?.items.filter((item) => item.checklist_code && !item.skip_component_qc).length ??
    0;
  const skippedCount =
    configuration?.items.filter((item) => item.skip_component_qc).length ?? 0;
  const unconfiguredCount =
    configuration?.items.filter((item) => !item.checklist_code).length ?? 0;

  useEffect(() => {
    if (!selectedReferenceImage) {
      setReferencePreviewUrl(null);
      return;
    }

    if (typeof URL.createObjectURL !== "function") {
      setReferencePreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(selectedReferenceImage);
    setReferencePreviewUrl(objectUrl);
    return () => {
      if (typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [selectedReferenceImage]);

  const checklistPreviewUrl = useMemo(() => {
    if (referencePreviewUrl) {
      return referencePreviewUrl;
    }
    if (!checklistForm?.referenceImageFileId || !apiBaseUrl.trim()) {
      return null;
    }
    return joinApiUrl(
      apiBaseUrl.trim(),
      `/files/${encodeURIComponent(checklistForm.referenceImageFileId)}`,
    );
  }, [apiBaseUrl, checklistForm?.referenceImageFileId, referencePreviewUrl]);

  const referenceOverlayAreas = useMemo(
    () => buildDraftOverlayAreas(stepDrafts),
    [stepDrafts],
  );

  async function handleLoadConfiguration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await reloadConfiguration();
  }

  async function reloadConfiguration(componentTypeToRestore?: string) {
    const trimmedApiBaseUrl = apiBaseUrl.trim();
    const trimmedDeviceType = deviceType.trim();
    const normalizedVariantCode = normalizeVariantCode(variantCode);

    setConfigurationError(null);
    setSaveError(null);
    setSaveSuccess(null);

    if (!trimmedApiBaseUrl) {
      setConfigurationState("error");
      setConfigurationError("Podaj adres API.");
      return;
    }

    if (!trimmedDeviceType) {
      setConfigurationState("error");
      setConfigurationError("Podaj typ produktu, aby pobrac konfiguracje BOM.");
      return;
    }

    setConfigurationState("loading");

    try {
      const payload = await getQcProductConfiguration(
        trimmedApiBaseUrl,
        trimmedDeviceType,
        normalizedVariantCode,
      );
      setConfiguration(payload);
      setConfigurationState("loaded");

      const componentType =
        componentTypeToRestore ??
        selectedComponentType ??
        payload.items[0]?.component_type ??
        null;
      if (componentType) {
        const matchingItem =
          payload.items.find((item) => item.component_type === componentType) ?? null;
        if (matchingItem) {
          await loadComponentEditor(
            matchingItem,
            payload.device_type,
            payload.variant_code,
          );
          return;
        }
      }

      setSelectedComponentType(null);
      setChecklistForm(null);
      setStepDrafts([]);
      setDeletedStepIds([]);
      setSelectedReferenceImage(null);
      setEditorState("idle");
      setEditorError(null);
    } catch (error) {
      setConfigurationState("error");
      setConfigurationError(
        getErrorMessage(error, "Nie udalo sie pobrac konfiguracji produktu QC."),
      );
      setConfiguration(null);
      setSelectedComponentType(null);
      setChecklistForm(null);
      setStepDrafts([]);
      setDeletedStepIds([]);
      setSelectedReferenceImage(null);
      setEditorState("idle");
      setEditorError(null);
    }
  }

  async function loadComponentEditor(
    component: QcProductComponentConfigRead,
    boundDeviceType = configuration?.device_type ?? deviceType.trim(),
    boundVariantCode = configuration?.variant_code ?? normalizeVariantCode(variantCode),
  ) {
    const trimmedApiBaseUrl = apiBaseUrl.trim();
    setSelectedComponentType(component.component_type);
    setEditorState("loading");
    setEditorError(null);
    setSaveError(null);
    setSaveSuccess(null);
    setSelectedReferenceImage(null);
    setDeletedStepIds([]);

    try {
      if (!component.checklist_code) {
        setChecklistForm({
          checklistCode: createDefaultChecklistCode(
            boundDeviceType,
            boundVariantCode,
            component.component_type,
          ),
          name: createDefaultChecklistName(component.component_type),
          processStage: "COMPONENT_QC",
          version: "1.0",
          skipComponentQc: false,
          isActive: true,
          referenceImageFileId: null,
        });
        setStepDrafts([]);
        setEditorState("loaded");
        return;
      }

      const checklistRows = await listQcChecklists(trimmedApiBaseUrl, {
        device_type: boundDeviceType,
        variant_code: boundVariantCode,
        component_type: component.component_type,
      });
      const checklist =
        checklistRows.find((row) => row.checklist_code === component.checklist_code) ?? null;
      if (!checklist) {
        throw new Error("Nie znaleziono checklisty przypisanej do tego komponentu.");
      }

      const steps = await listQcChecklistSteps(trimmedApiBaseUrl, checklist.checklist_code);
      setChecklistForm(buildChecklistEditorState(checklist));
      setStepDrafts(steps.map(buildStepEditorState));
      setEditorState("loaded");
    } catch (error) {
      setChecklistForm(null);
      setStepDrafts([]);
      setEditorState("error");
      setEditorError(
        getErrorMessage(error, "Nie udalo sie zaladowac konfiguracji kontrolnej komponentu."),
      );
    }
  }

  function handleChecklistFieldChange<K extends keyof ChecklistEditorState>(
    field: K,
    value: ChecklistEditorState[K],
  ) {
    setChecklistForm((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        [field]: value,
      };
    });
  }

  function handleStepFieldChange<K extends keyof StepEditorState>(
    localId: string,
    field: K,
    value: StepEditorState[K],
  ) {
    setStepDrafts((current) =>
      current.map((step) => {
        if (step.localId !== localId) {
          return step;
        }
        if (field === "evaluationMode") {
          const nextMode = value as EvaluationMode;
          return normalizeStepDraft({
            ...step,
            evaluationMode: nextMode,
          });
        }
        return {
          ...step,
          [field]: value,
        };
      }),
    );
  }

  function handleRemoveStep(localId: string) {
    setStepDrafts((current) => {
      const removed = current.find((step) => step.localId === localId);
      if (removed?.id) {
        setDeletedStepIds((existing) =>
          existing.includes(removed.id as string)
            ? existing
            : [...existing, removed.id as string],
        );
      }
      return current.filter((step) => step.localId !== localId);
    });
  }

  function handleAddStep() {
    setStepDrafts((current) => [
      ...current,
      createEmptyStepEditor(current.length + 1),
    ]);
  }

  async function handleSaveConfiguration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedApiBaseUrl = apiBaseUrl.trim();
    const trimmedDeviceType = configuration?.device_type ?? deviceType.trim();
    const normalizedVariantCode = configuration?.variant_code ?? normalizeVariantCode(variantCode);

    setSaveError(null);
    setSaveSuccess(null);

    if (!trimmedApiBaseUrl) {
      setSaveState("error");
      setSaveError("Podaj adres API.");
      return;
    }
    if (!selectedComponent || !checklistForm) {
      setSaveState("error");
      setSaveError("Wybierz komponent z BOM do konfiguracji.");
      return;
    }

    const normalizedChecklistCode = sanitizeChecklistCode(checklistForm.checklistCode);
    if (!normalizedChecklistCode) {
      setSaveState("error");
      setSaveError("Kod checklisty jest wymagany.");
      return;
    }
    if (!checklistForm.name.trim()) {
      setSaveState("error");
      setSaveError("Nazwa checklisty jest wymagana.");
      return;
    }
    if (!checklistForm.version.trim()) {
      setSaveState("error");
      setSaveError("Wersja checklisty jest wymagana.");
      return;
    }
    if (!checklistForm.skipComponentQc && stepDrafts.length === 0) {
      setSaveState("error");
      setSaveError("Dodaj przynajmniej jeden krok kontroli albo zaznacz pominiecie kontroli.");
      return;
    }

    const preparedSteps: QcStepCreatePayload[] = [];
    for (const [index, step] of stepDrafts.entries()) {
      const prepared = buildStepPayload(step, index + 1);
      if ("error" in prepared) {
        setSaveState("error");
        setSaveError(prepared.error);
        return;
      }
      preparedSteps.push(prepared.payload);
    }

    setSaveState("loading");

    try {
      const checklistPayload = {
        name: checklistForm.name.trim(),
        process_stage: checklistForm.processStage,
        version: checklistForm.version.trim(),
        device_type: trimmedDeviceType,
        variant_code: normalizedVariantCode,
        component_type: selectedComponent.component_type,
        skip_component_qc: checklistForm.skipComponentQc,
        is_active: checklistForm.isActive,
      };

      let effectiveChecklistCode = normalizedChecklistCode;
      if (selectedComponent.checklist_code) {
        await updateQcChecklist(
          trimmedApiBaseUrl,
          selectedComponent.checklist_code,
          checklistPayload,
        );
        effectiveChecklistCode = selectedComponent.checklist_code;
      } else {
        const createdChecklist = await createQcChecklist(trimmedApiBaseUrl, {
          checklist_code: normalizedChecklistCode,
          ...checklistPayload,
        });
        effectiveChecklistCode = createdChecklist.checklist_code;
      }

      for (const deletedStepId of deletedStepIds) {
        await deleteQcChecklistStep(
          trimmedApiBaseUrl,
          effectiveChecklistCode,
          deletedStepId,
        );
      }

      for (const [index, step] of stepDrafts.entries()) {
        const payload = preparedSteps[index]!;
        if (step.id) {
          await updateQcChecklistStep(
            trimmedApiBaseUrl,
            effectiveChecklistCode,
            step.id,
            payload,
          );
          continue;
        }
        await createQcChecklistStep(trimmedApiBaseUrl, effectiveChecklistCode, payload);
      }

      if (selectedReferenceImage) {
        await uploadQcChecklistReferenceImage(
          trimmedApiBaseUrl,
          effectiveChecklistCode,
          selectedReferenceImage,
          "QC-ADMIN",
        );
      }

      await reloadConfiguration(selectedComponent.component_type);
      setSelectedReferenceImage(null);
      setDeletedStepIds([]);
      setSaveState("loaded");
      setSaveSuccess(
        `Zapisano konfiguracje QC dla ${selectedComponent.component_type} w produkcie ${trimmedDeviceType}.`,
      );
    } catch (error) {
      setSaveState("error");
      setSaveError(
        getErrorMessage(error, "Nie udalo sie zapisac konfiguracji produktu QC."),
      );
    }
  }

  return (
    <section className="admin-grid">
      <div className="filters-card admin-list-card">
        <div className="section-heading">
          <h2>Konfiguracja komponentow z BOM</h2>
          <span className={`status-badge state-${configurationState}`}>
            {configurationState === "loading"
              ? "Ladowanie"
              : configurationState === "loaded"
                ? "BOM OK"
                : configurationState === "error"
                  ? "Blad"
                  : "Gotowe"}
          </span>
        </div>
        <form className="admin-form-grid" onSubmit={handleLoadConfiguration}>
          <label className="field">
            <span>Typ produktu</span>
            <input
              value={deviceType}
              onChange={(event) => setDeviceType(event.target.value)}
              placeholder="np. DEMO-OPS"
            />
          </label>
          <label className="field">
            <span>Wariant BOM</span>
            <input
              value={variantCode}
              onChange={(event) => setVariantCode(event.target.value)}
              placeholder="DEFAULT"
            />
          </label>
          <div className="details-inline-actions">
            <button className="primary-button" type="submit">
              Pobierz komponenty BOM
            </button>
          </div>
        </form>

        {configurationError ? (
          <div className="error-banner" role="alert">
            <strong>Nie udalo sie zaladowac konfiguracji produktu.</strong>
            <span>{configurationError}</span>
          </div>
        ) : null}

        {configuration ? (
          <>
            <div className="summary-grid">
              <div className="metric-card">
                <span>Komponenty BOM</span>
                <strong>{configuration.items.length}</strong>
                <small>Produkt {configuration.device_type}</small>
              </div>
              <div className="metric-card">
                <span>Konfigurowane</span>
                <strong>{controlledCount}</strong>
                <small>Skip: {skippedCount}</small>
              </div>
              <div className="metric-card">
                <span>Brak konfiguracji</span>
                <strong>{unconfiguredCount}</strong>
                <small>Wariant {configuration.variant_code}</small>
              </div>
            </div>

            <div className="admin-list">
              {configuration.items.map((item) => (
                <article
                  key={item.component_type}
                  className={`detail-inline-card admin-row ${selectedComponentType === item.component_type ? "is-selected" : ""}`}
                >
                  <div className="detail-inline-header">
                    <strong>{labelForCode(item.component_type)}</strong>
                    <span
                      className={`status-badge ${
                        item.skip_component_qc
                          ? "state-warning"
                          : item.checklist_code
                            ? ""
                            : "state-error"
                      }`}
                    >
                      {item.skip_component_qc
                        ? "POMIN KONTROLE"
                        : item.checklist_code
                          ? "SKONFIGUROWANY"
                          : "BRAK KONFIGURACJI"}
                    </span>
                  </div>
                  <p>
                    Typ {item.component_type} | ilosc {item.quantity_required}
                    {item.is_required ? " | wymagany" : " | opcjonalny"}
                  </p>
                  <p>
                    Checklista {item.checklist_code ?? "-"} | kroki {item.configured_step_count}
                  </p>
                  <div className="details-inline-actions">
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() =>
                        loadComponentEditor(
                          item,
                          configuration.device_type,
                          configuration.variant_code,
                        )
                      }
                    >
                      {item.checklist_code ? "Edytuj konfiguracje" : "Skonfiguruj"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="empty-state">
            <strong>Brak pobranej konfiguracji produktu</strong>
            <span>
              Podaj typ produktu i wariant, aby pobrac wszystkie skladniki z BOM i
              zdecydowac, ktore maja przechodzic QC, a ktore beda pomijane.
            </span>
          </div>
        )}
      </div>

      <div className="filters-card admin-form-card">
        <div className="section-heading">
          <h2>Edytor kontroli komponentu</h2>
          <span className={`status-badge state-${editorState}`}>
            {editorState === "loading"
              ? "Ladowanie"
              : editorState === "loaded"
                ? "Gotowe"
                : editorState === "error"
                  ? "Blad"
                  : "Wybierz komponent"}
          </span>
        </div>

        {editorError ? (
          <div className="error-banner" role="alert">
            <strong>Nie udalo sie zaladowac edytora komponentu.</strong>
            <span>{editorError}</span>
          </div>
        ) : null}

        {saveError ? (
          <div className="error-banner" role="alert">
            <strong>Nie udalo sie zapisac konfiguracji QC.</strong>
            <span>{saveError}</span>
          </div>
        ) : null}

        {saveSuccess ? (
          <section className="qc-auth-banner" role="status">
            <strong>{saveSuccess}</strong>
          </section>
        ) : null}

        {!selectedComponent || !checklistForm ? (
          <div className="empty-state">
            <strong>Nie wybrano komponentu</strong>
            <span>
              Kliknij skladnik z listy BOM, aby ustawic, czy ma przechodzic kontrole,
              dodac zdjecie referencyjne i zdefiniowac parametry PASS/Negative.
            </span>
          </div>
        ) : (
          <form className="admin-form-grid" onSubmit={handleSaveConfiguration}>
            <div className="detail-inline-card">
              <div className="detail-inline-header">
                <strong>{labelForCode(selectedComponent.component_type)}</strong>
                <span className="status-badge">
                  {selectedComponent.is_required ? "WYMAGANY" : "OPCJONALNY"}
                </span>
              </div>
              <p>
                Produkt {configuration?.device_type ?? deviceType.trim()} | wariant{" "}
                {configuration?.variant_code ?? normalizeVariantCode(variantCode)}
              </p>
              <p>
                Numer czesci {selectedComponent.required_part_number ?? "-"} | grupa{" "}
                {selectedComponent.substitution_group ?? "-"}
              </p>
            </div>

            <label className="field">
              <span>Kod checklisty</span>
              <input
                value={checklistForm.checklistCode}
                onChange={(event) =>
                  handleChecklistFieldChange(
                    "checklistCode",
                    sanitizeChecklistCode(event.target.value),
                  )
                }
                placeholder="np. QC-DEMO-OPS-SCREW-M4"
                disabled={selectedComponent.checklist_code !== null}
              />
            </label>
            <label className="field">
              <span>Nazwa checklisty</span>
              <input
                value={checklistForm.name}
                onChange={(event) =>
                  handleChecklistFieldChange("name", event.target.value)
                }
                placeholder="np. Kontrola sruby M4"
              />
            </label>
            <label className="field">
              <span>Etap procesu</span>
              <select
                value={checklistForm.processStage}
                onChange={(event) =>
                  handleChecklistFieldChange("processStage", event.target.value)
                }
              >
                {PROCESS_STAGE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {labelForCode(option)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Wersja</span>
              <input
                value={checklistForm.version}
                onChange={(event) =>
                  handleChecklistFieldChange("version", event.target.value)
                }
                placeholder="1.0"
              />
            </label>
            <label className="field checkbox-field">
              <input
                type="checkbox"
                checked={checklistForm.skipComponentQc}
                onChange={(event) =>
                  handleChecklistFieldChange("skipComponentQc", event.target.checked)
                }
              />
              <span>
                Pomin kontrole dla tego komponentu
              </span>
            </label>
            <label className="field checkbox-field">
              <input
                type="checkbox"
                checked={checklistForm.isActive}
                onChange={(event) =>
                  handleChecklistFieldChange("isActive", event.target.checked)
                }
              />
              <span>Checklista aktywna</span>
            </label>

            <label className="field">
              <span>Zdjecie referencyjne elementu</span>
              <input
                type="file"
                accept="image/*"
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  setSelectedReferenceImage(event.target.files?.[0] ?? null);
                }}
              />
            </label>

            {checklistPreviewUrl ? (
              <div className="detail-inline-card qc-reference-image-card">
                <div className="detail-inline-header">
                  <strong>Podglad wzorca kontroli</strong>
                  <span className="status-badge">
                    {selectedReferenceImage ? "NOWY PLIK" : "ZAPISANY"}
                  </span>
                </div>
                <QcReferenceImage
                  imageUrl={checklistPreviewUrl}
                  imageAlt={`Wzorzec kontroli ${selectedComponent.component_type}`}
                  areas={referenceOverlayAreas}
                  caption={
                    selectedReferenceImage
                      ? `Nowy plik: ${selectedReferenceImage.name}`
                      : `ID pliku: ${checklistForm.referenceImageFileId}`
                  }
                />
              </div>
            ) : null}

            <div className="section-heading">
              <h3>Kroki kontroli</h3>
              <button className="ghost-button" type="button" onClick={handleAddStep}>
                Dodaj krok
              </button>
            </div>

            {checklistForm.skipComponentQc ? (
              <div className="empty-state">
                <strong>Kontrola jest pomijana</strong>
                <span>
                  Taki komponent nie bedzie wymagac `QC_PASSED` przy montazu ani w gate
                  jakosci. Nadal mozesz zostawic kroki jako dokumentacje, ale system
                  nie bedzie ich wymagal.
                </span>
              </div>
            ) : null}

            {stepDrafts.length === 0 ? (
              <div className="empty-state">
                <strong>Brak krokow kontrolnych</strong>
                <span>
                  Dodaj opis kontroli, obszar, sposob oceny i wartosci graniczne dla
                  operatora QC.
                </span>
              </div>
            ) : (
              <div className="qc-step-list">
                {stepDrafts.map((step, index) => {
                  const isNumeric = step.evaluationMode === "NUMERIC_RANGE";
                  const isTextMatch = step.evaluationMode === "TEXT_MATCH";
                  return (
                    <article key={step.localId} className="qc-step-card">
                      <div className="qc-step-card-header">
                        <div>
                          <p className="eyebrow">Krok {index + 1}</p>
                          <h3>{step.title || "Nowy krok kontroli"}</h3>
                        </div>
                        <div className="details-inline-actions">
                          <span className="status-badge">
                            {labelForCode(step.evaluationMode)}
                          </span>
                          <button
                            className="ghost-button"
                            type="button"
                            onClick={() => handleRemoveStep(step.localId)}
                          >
                            Usun krok
                          </button>
                        </div>
                      </div>

                      <div className="qc-step-form-grid">
                        <label className="field">
                          <span>Tytul kroku</span>
                          <input
                            value={step.title}
                            onChange={(event) =>
                              handleStepFieldChange(step.localId, "title", event.target.value)
                            }
                            placeholder="np. Sprawdz dlugosc sruby"
                          />
                        </label>
                        <label className="field">
                          <span>Tryb oceny</span>
                          <select
                            value={step.evaluationMode}
                            onChange={(event) =>
                              handleStepFieldChange(
                                step.localId,
                                "evaluationMode",
                                event.target.value as EvaluationMode,
                              )
                            }
                          >
                            {EVALUATION_MODE_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {labelForCode(option)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field qc-step-comment-field">
                          <span>Opis co trzeba skontrolowac</span>
                          <textarea
                            value={step.instruction}
                            onChange={(event) =>
                              handleStepFieldChange(
                                step.localId,
                                "instruction",
                                event.target.value,
                              )
                            }
                            rows={3}
                            placeholder="Opisz procedure i sposob kontroli dla operatora."
                          />
                        </label>
                        <label className="field">
                          <span>Obszar kontroli</span>
                          <input
                            value={step.controlArea}
                            onChange={(event) =>
                              handleStepFieldChange(
                                step.localId,
                                "controlArea",
                                event.target.value,
                              )
                            }
                            placeholder="np. Glowka sruby / gwint / etykieta"
                          />
                        </label>
                        <label className="field">
                          <span>Etykieta pola wyniku</span>
                          <input
                            value={step.resultInputLabel}
                            onChange={(event) =>
                              handleStepFieldChange(
                                step.localId,
                                "resultInputLabel",
                                event.target.value,
                              )
                            }
                            placeholder={
                              isNumeric
                                ? "np. Wpisz dlugosc"
                                : isTextMatch
                                  ? "np. Wpisz odczyt oznaczenia"
                                  : "np. Wynik kontroli"
                            }
                          />
                        </label>
                        <div className="field qc-step-comment-field">
                          <span>Obszar na obrazie referencyjnym (%)</span>
                          <div className="qc-step-region-grid">
                            <label className="field">
                              <span>X</span>
                              <input
                                value={step.regionX}
                                onChange={(event) =>
                                  handleStepFieldChange(
                                    step.localId,
                                    "regionX",
                                    event.target.value,
                                  )
                                }
                                inputMode="decimal"
                                placeholder="np. 12"
                              />
                            </label>
                            <label className="field">
                              <span>Y</span>
                              <input
                                value={step.regionY}
                                onChange={(event) =>
                                  handleStepFieldChange(
                                    step.localId,
                                    "regionY",
                                    event.target.value,
                                  )
                                }
                                inputMode="decimal"
                                placeholder="np. 18"
                              />
                            </label>
                            <label className="field">
                              <span>Szerokosc</span>
                              <input
                                value={step.regionWidth}
                                onChange={(event) =>
                                  handleStepFieldChange(
                                    step.localId,
                                    "regionWidth",
                                    event.target.value,
                                  )
                                }
                                inputMode="decimal"
                                placeholder="np. 36"
                              />
                            </label>
                            <label className="field">
                              <span>Wysokosc</span>
                              <input
                                value={step.regionHeight}
                                onChange={(event) =>
                                  handleStepFieldChange(
                                    step.localId,
                                    "regionHeight",
                                    event.target.value,
                                  )
                                }
                                inputMode="decimal"
                                placeholder="np. 24"
                              />
                            </label>
                          </div>
                          <p className="qc-step-region-summary">
                            Wpisz prostokat jako procent zdjecia: punkt startu `X/Y` i rozmiar
                            `Szerokosc/Wysokosc`. Puste pola oznaczaja brak wizualnego obszaru.
                          </p>
                        </div>
                        <label className="field checkbox-field">
                          <input
                            type="checkbox"
                            checked={step.requiresPhoto}
                            onChange={(event) =>
                              handleStepFieldChange(
                                step.localId,
                                "requiresPhoto",
                                event.target.checked,
                              )
                            }
                          />
                          <span>Wymagaj zdjecia z kontroli</span>
                        </label>
                        <label className="field checkbox-field">
                          <input
                            type="checkbox"
                            checked={step.blockingOnFail}
                            onChange={(event) =>
                              handleStepFieldChange(
                                step.localId,
                                "blockingOnFail",
                                event.target.checked,
                              )
                            }
                          />
                          <span>Negatywny wynik blokuje dalszy etap</span>
                        </label>

                        {isNumeric ? (
                          <>
                            <label className="field">
                              <span>Wartosc oczekiwana</span>
                              <input
                                value={step.expectedValue}
                                onChange={(event) =>
                                  handleStepFieldChange(
                                    step.localId,
                                    "expectedValue",
                                    event.target.value,
                                  )
                                }
                                placeholder="np. 12.0"
                              />
                            </label>
                            <label className="field">
                              <span>Jednostka</span>
                              <input
                                value={step.unit}
                                onChange={(event) =>
                                  handleStepFieldChange(step.localId, "unit", event.target.value)
                                }
                                placeholder="np. mm"
                              />
                            </label>
                            <label className="field">
                              <span>Minimum</span>
                              <input
                                value={step.toleranceMin}
                                onChange={(event) =>
                                  handleStepFieldChange(
                                    step.localId,
                                    "toleranceMin",
                                    event.target.value,
                                  )
                                }
                                inputMode="decimal"
                                placeholder="np. 11.8"
                              />
                            </label>
                            <label className="field">
                              <span>Maksimum</span>
                              <input
                                value={step.toleranceMax}
                                onChange={(event) =>
                                  handleStepFieldChange(
                                    step.localId,
                                    "toleranceMax",
                                    event.target.value,
                                  )
                                }
                                inputMode="decimal"
                                placeholder="np. 12.2"
                              />
                            </label>
                          </>
                        ) : null}

                        {isTextMatch ? (
                          <label className="field">
                            <span>Wartosc oczekiwana</span>
                            <input
                              value={step.expectedValue}
                              onChange={(event) =>
                                handleStepFieldChange(
                                  step.localId,
                                  "expectedValue",
                                  event.target.value,
                                )
                              }
                              placeholder="np. A2-70 albo Czytelna etykieta"
                            />
                          </label>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            <div className="details-inline-actions">
              <button
                className="primary-button"
                type="submit"
                disabled={saveState === "loading"}
              >
                {saveState === "loading"
                  ? "Zapisuje konfiguracje..."
                  : "Zapisz konfiguracje produktu QC"}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

function buildChecklistEditorState(checklist: QcChecklistRead): ChecklistEditorState {
  return {
    checklistCode: checklist.checklist_code,
    name: checklist.name,
    processStage: checklist.process_stage,
    version: checklist.version,
    skipComponentQc: checklist.skip_component_qc,
    isActive: checklist.is_active,
    referenceImageFileId: checklist.reference_image_file_id,
  };
}

function buildStepEditorState(step: QcStepRead): StepEditorState {
  return {
    localId: step.id,
    id: step.id,
    title: step.title,
    instruction: step.instruction ?? "",
    controlArea: step.control_area ?? "",
    evaluationMode: normalizeEvaluationMode(step.evaluation_mode, step.requires_measurement),
    resultInputLabel: step.result_input_label ?? "",
    regionX: step.region_x != null ? String(step.region_x) : "",
    regionY: step.region_y != null ? String(step.region_y) : "",
    regionWidth: step.region_width != null ? String(step.region_width) : "",
    regionHeight: step.region_height != null ? String(step.region_height) : "",
    requiresPhoto: step.requires_photo,
    blockingOnFail: step.blocking_on_fail,
    expectedValue: step.expected_value ?? "",
    unit: step.unit ?? "",
    toleranceMin: step.tolerance_min !== null ? String(step.tolerance_min) : "",
    toleranceMax: step.tolerance_max !== null ? String(step.tolerance_max) : "",
  };
}

function createEmptyStepEditor(stepOrder: number): StepEditorState {
  return {
    localId: `new-step-${stepOrder}-${Math.random().toString(36).slice(2, 10)}`,
    id: null,
    title: "",
    instruction: "",
    controlArea: "",
    evaluationMode: "MANUAL",
    resultInputLabel: "",
    regionX: "",
    regionY: "",
    regionWidth: "",
    regionHeight: "",
    requiresPhoto: false,
    blockingOnFail: true,
    expectedValue: "",
    unit: "",
    toleranceMin: "",
    toleranceMax: "",
  };
}

function normalizeStepDraft(step: StepEditorState): StepEditorState {
  if (step.evaluationMode === "MANUAL") {
    return {
      ...step,
      expectedValue: "",
      unit: "",
      toleranceMin: "",
      toleranceMax: "",
    };
  }
  if (step.evaluationMode === "TEXT_MATCH") {
    return {
      ...step,
      unit: "",
      toleranceMin: "",
      toleranceMax: "",
    };
  }
  return step;
}

function buildStepPayload(
  step: StepEditorState,
  stepOrder: number,
): { payload: QcStepCreatePayload } | { error: string } {
  const title = step.title.trim();
  if (!title) {
    return { error: `Krok ${stepOrder} musi miec tytul.` };
  }

  const instruction = normalizeOptionalString(step.instruction);
  const controlArea = normalizeOptionalString(step.controlArea);
  const resultInputLabel = normalizeOptionalString(step.resultInputLabel);
  const expectedValue = normalizeOptionalString(step.expectedValue);
  const unit = normalizeOptionalString(step.unit);
  const toleranceMin = parseOptionalNumber(step.toleranceMin);
  const toleranceMax = parseOptionalNumber(step.toleranceMax);
  const regionX = parseOptionalNumber(step.regionX);
  const regionY = parseOptionalNumber(step.regionY);
  const regionWidth = parseOptionalNumber(step.regionWidth);
  const regionHeight = parseOptionalNumber(step.regionHeight);

  if (step.evaluationMode === "TEXT_MATCH" && !expectedValue) {
    return {
      error: `Krok "${title}" w trybie TEXT_MATCH wymaga wartosci oczekiwanej.`,
    };
  }

  if (step.evaluationMode === "NUMERIC_RANGE") {
    if (toleranceMin === null && toleranceMax === null) {
      return {
        error: `Krok "${title}" w trybie NUMERIC_RANGE wymaga minimum albo maksimum.`,
      };
    }
    if (toleranceMin !== null && toleranceMax !== null && toleranceMin > toleranceMax) {
      return {
        error: `Krok "${title}" ma minimum wieksze od maksimum.`,
      };
    }
  }

  const providedRegionValues = [regionX, regionY, regionWidth, regionHeight].filter(
    (value) => value !== null,
  );
  if (providedRegionValues.length > 0 && providedRegionValues.length < 4) {
    return {
      error: `Krok "${title}" wymaga kompletu pol obszaru obrazu: X, Y, szerokosc i wysokosc.`,
    };
  }

  return {
    payload: {
      step_order: stepOrder,
      title,
      instruction,
      control_area: controlArea,
      evaluation_mode: step.evaluationMode,
      result_input_label: resultInputLabel,
      region_x: regionX,
      region_y: regionY,
      region_width: regionWidth,
      region_height: regionHeight,
      requires_photo: step.requiresPhoto,
      blocking_on_fail: step.blockingOnFail,
      expected_value: expectedValue,
      unit,
      tolerance_min: step.evaluationMode === "NUMERIC_RANGE" ? toleranceMin : null,
      tolerance_max: step.evaluationMode === "NUMERIC_RANGE" ? toleranceMax : null,
    },
  };
}

function buildDraftOverlayAreas(stepDrafts: StepEditorState[]) {
  return stepDrafts.flatMap((step, index) => {
    const regionX = parseOptionalNumber(step.regionX);
    const regionY = parseOptionalNumber(step.regionY);
    const regionWidth = parseOptionalNumber(step.regionWidth);
    const regionHeight = parseOptionalNumber(step.regionHeight);

    if (
      regionX === null ||
      regionY === null ||
      regionWidth === null ||
      regionHeight === null
    ) {
      return [];
    }

    return [
      {
        id: step.localId,
        label: `K${index + 1}`,
        title: step.title || `Krok ${index + 1}`,
        x: regionX,
        y: regionY,
        width: regionWidth,
        height: regionHeight,
      },
    ];
  });
}

function normalizeEvaluationMode(
  evaluationMode: string,
  requiresMeasurement: boolean,
): EvaluationMode {
  const normalized = evaluationMode.toUpperCase();
  if (normalized === "TEXT_MATCH" || normalized === "NUMERIC_RANGE") {
    return normalized;
  }
  if (requiresMeasurement) {
    return "NUMERIC_RANGE";
  }
  return "MANUAL";
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) {
    return null;
  }
  const numericValue = Number(trimmed);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeVariantCode(value: string): string {
  const trimmed = value.trim();
  return trimmed ? trimmed : "DEFAULT";
}

function createDefaultChecklistCode(
  deviceType: string,
  variantCode: string,
  componentType: string,
): string {
  return sanitizeChecklistCode(
    `QC-${deviceType}-${variantCode}-${componentType}`,
  );
}

function createDefaultChecklistName(componentType: string): string {
  return `Kontrola ${labelForCode(componentType).toLowerCase()}`;
}

function sanitizeChecklistCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
