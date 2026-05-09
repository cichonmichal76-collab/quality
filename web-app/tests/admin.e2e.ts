import { expect, test } from "@playwright/test";
import {
  buildAdminChecklist,
  buildAdminOperator,
  buildAdminWorkstation,
  fulfillImage,
  fulfillJson,
} from "./admin.e2e-helpers";

test("admin page creates operator and updates workstation", async ({ page }) => {
  const operators = [buildAdminOperator()];
  const workstations = [buildAdminWorkstation()];

  await page.route("**/api/operators", async (route) => {
    if (route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      operators.unshift({
        ...buildAdminOperator({
          id: "OP-ROW-NEW",
          operator_id: String(payload.operator_id),
          full_name: String(payload.full_name),
          role: String(payload.role),
          login_name: String(payload.login_name ?? ""),
          rfid_uid_hash: String(payload.rfid_uid_hash ?? ""),
          is_active: Boolean(payload.is_active),
          created_at: "2026-05-03T10:00:00Z",
        }),
      });
      await fulfillJson(route, operators[0]);
      return;
    }

    await fulfillJson(route, operators);
  });

  await page.route("**/api/workstations", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    await fulfillJson(route, workstations);
  });

  await page.route("**/api/workstations/QCWS-001", async (route) => {
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    workstations[0] = {
      ...workstations[0],
      ...payload,
    };
    await fulfillJson(route, workstations[0]);
  });

  await page.goto("/admin");

  await expect(page.getByText("Lista operatorow")).toBeVisible();
  await page.getByPlaceholder("np. QCOP-LINIA-01").fill("QCOP-NEW-01");
  await page.getByPlaceholder("np. Jan Kowalski").fill("Jan Kowalski");
  await page.getByLabel("Rola").selectOption("QUALITY_MANAGER");
  await page.getByPlaceholder("np. qc-linia-01").fill("qc-new-01");
  await page.getByPlaceholder("np. Secret123!").fill("Secret123!");
  await page.getByPlaceholder("np. QCRFID-LINIA-01").fill("RFID-NEW-01");
  await page.getByRole("button", { name: "Dodaj operatora" }).click();

  await expect(page.getByText("Dodano operatora QCOP-NEW-01.")).toBeVisible();
  await expect(page.getByText("Jan Kowalski")).toBeVisible();

  await page.getByRole("button", { name: "Stanowiska QC" }).click();
  await page.getByRole("button", { name: "Edytuj" }).click();
  await page.getByLabel("Nazwa").fill("Stacja koncowa QC");
  await page.getByLabel("Obszar").fill("LAB");
  await page.getByLabel("Typ stanowiska").fill("FINAL_QC");
  await page.getByRole("checkbox", { name: "Stanowisko aktywne" }).uncheck();
  await page.getByRole("button", { name: "Zapisz stanowisko" }).click();

  await expect(page.getByText("Zapisano stanowisko QCWS-001.")).toBeVisible();
  await expect(page.getByText("Stacja koncowa QC")).toBeVisible();
  await expect(page.getByText("NIEAKTYWNE")).toBeVisible();
});

test("admin page configures product qc for bom component", async ({ page }) => {
  let configurationLoaded = false;
  let createdStepPayload: Record<string, unknown> | null = null;

  await page.route("**/api/operators", async (route) => {
    await fulfillJson(route, []);
  });

  await page.route("**/api/workstations", async (route) => {
    await fulfillJson(route, []);
  });

  await page.route(
    "**/api/qc-product-configurations/DEMO-OPS?variant_code=DEFAULT",
    async (route) => {
      await fulfillJson(route, {
        device_type: "DEMO-OPS",
        variant_code: "DEFAULT",
        items: [
          {
            component_type: "SCREW_M4",
            substitution_group: null,
            required_part_number: "M4-12",
            required_revision: null,
            required_drawing_number: null,
            required_drawing_revision: null,
            quantity_required: 4,
            is_required: true,
            checklist_code: configurationLoaded ? "QC-DEMO-OPS-DEFAULT-SCREW-M4" : null,
            checklist_name: configurationLoaded ? "Kontrola sruby M4" : null,
            checklist_version: configurationLoaded ? "1.0" : null,
            checklist_is_active: configurationLoaded,
            skip_component_qc: false,
            reference_image_file_id: configurationLoaded ? "FILE-001" : null,
            configured_step_count: configurationLoaded ? 1 : 0,
          },
        ],
      });
    },
  );

  await page.route("**/api/qc-checklists?device_type=DEMO-OPS**", async (route) => {
    await fulfillJson(route, [
      buildAdminChecklist({ reference_image_file_id: "FILE-001" }),
    ]);
  });

  await page.route("**/api/qc-checklists/QC-DEMO-OPS-DEFAULT-SCREW-M4/steps", async (route) => {
    if (route.request().method() === "POST") {
      createdStepPayload = route.request().postDataJSON() as Record<string, unknown>;
      configurationLoaded = true;
      await fulfillJson(route, {
          id: "STEP-001",
          checklist_id: "CHK-001",
          step_order: 1,
          title: "Zweryfikuj oznaczenie",
          instruction: "Porownaj oznaczenie z wzorcem.",
          control_area: "Glowka sruby",
          evaluation_mode: "TEXT_MATCH",
          result_input_label: "Wpisz oznaczenie",
          region_x: 62,
          region_y: 58,
          region_width: 20,
          region_height: 16,
          requires_photo: false,
          requires_measurement: false,
          blocking_on_fail: true,
          expected_value: "A2-70",
          unit: null,
          tolerance_min: null,
          tolerance_max: null,
        });
      return;
    }
    await fulfillJson(route, [
        {
          id: "STEP-001",
          checklist_id: "CHK-001",
          step_order: 1,
          title: "Zweryfikuj oznaczenie",
          instruction: "Porownaj oznaczenie z wzorcem.",
          control_area: "Glowka sruby",
          evaluation_mode: "TEXT_MATCH",
          result_input_label: "Wpisz oznaczenie",
          region_x: 62,
          region_y: 58,
          region_width: 20,
          region_height: 16,
          requires_photo: false,
          requires_measurement: false,
          blocking_on_fail: true,
          expected_value: "A2-70",
          unit: null,
          tolerance_min: null,
          tolerance_max: null,
        },
      ]);
  });

  await page.route("**/api/qc-checklists", async (route) => {
    if (route.request().method() === "POST") {
      configurationLoaded = true;
      await fulfillJson(route, buildAdminChecklist());
      return;
    }

    await route.fallback();
  });

  await page.route(
    "**/api/qc-checklists/QC-DEMO-OPS-DEFAULT-SCREW-M4/reference-image",
    async (route) => {
      await fulfillJson(route, buildAdminChecklist({ reference_image_file_id: "FILE-001" }));
    },
  );

  await page.route("**/api/files/FILE-001", async (route) => {
    await fulfillImage(route);
  });

  await page.goto("/admin");

  await page.getByRole("button", { name: "Produkt QC" }).click();
  await page.getByLabel("Typ produktu").fill("DEMO-OPS");
  await page.getByRole("button", { name: "Pobierz komponenty BOM" }).click();

  await expect(page.locator(".status-badge", { hasText: "BRAK KONFIGURACJI" })).toBeVisible();
  await page.getByRole("button", { name: "Skonfiguruj" }).click();
  await page.getByLabel("Nazwa checklisty").fill("Kontrola sruby M4");
  await page.getByRole("button", { name: "Dodaj krok" }).click();
  await page.getByPlaceholder("np. Sprawdz dlugosc sruby").fill("Zweryfikuj oznaczenie");
  await page
    .getByPlaceholder("Opisz procedure i sposob kontroli dla operatora.")
    .fill("Porownaj oznaczenie z wzorcem.");
  await page.getByPlaceholder("np. Glowka sruby / gwint / etykieta").fill("Glowka sruby");
  await page.getByLabel("Tryb oceny").selectOption("TEXT_MATCH");
  await page.getByPlaceholder("np. Wpisz odczyt oznaczenia").fill("Wpisz oznaczenie");
  await page.getByPlaceholder("np. A2-70 albo Czytelna etykieta").fill("A2-70");
  await page.getByLabel("Zdjecie referencyjne elementu").setInputFiles({
    name: "screw.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2m3f4AAAAASUVORK5CYII=",
      "base64",
    ),
  });
  const stage = page.getByTestId("qc-reference-stage");
  await expect(stage).toBeVisible();
  await page.getByRole("button", { name: "Ustaw z obrazu" }).click();
  const stageBounds = await stage.boundingBox();
  if (!stageBounds) {
    throw new Error("Brak wymiarow sceny obrazu referencyjnego.");
  }
  await stage.dispatchEvent("mousedown", {
    button: 0,
    clientX: stageBounds.x + stageBounds.width * 0.2,
    clientY: stageBounds.y + stageBounds.height * 0.2,
  });
  await stage.dispatchEvent("mousemove", {
    button: 0,
    clientX: stageBounds.x + stageBounds.width * 0.7,
    clientY: stageBounds.y + stageBounds.height * 0.6,
  });
  await stage.dispatchEvent("mouseup", {
    button: 0,
    clientX: stageBounds.x + stageBounds.width * 0.7,
    clientY: stageBounds.y + stageBounds.height * 0.6,
  });
  const regionX = Number(await page.getByPlaceholder("np. 12").inputValue());
  const regionY = Number(await page.getByPlaceholder("np. 18").inputValue());
  const regionWidth = Number(await page.getByPlaceholder("np. 36").inputValue());
  const regionHeight = Number(await page.getByPlaceholder("np. 24").inputValue());
  expect(regionX).toBeGreaterThan(19);
  expect(regionX).toBeLessThan(21);
  expect(regionY).toBeGreaterThan(0);
  expect(regionWidth).toBeGreaterThan(49);
  expect(regionWidth).toBeLessThan(51);
  expect(regionHeight).toBeGreaterThan(0);

  const activeRegion = page.locator("[data-testid^='qc-reference-region-']").first();
  await activeRegion.dispatchEvent("mousedown", {
    button: 0,
    clientX: stageBounds.x + stageBounds.width * 0.35,
    clientY: stageBounds.y + stageBounds.height * 0.3,
  });
  await stage.dispatchEvent("mousemove", {
    button: 0,
    clientX: stageBounds.x + stageBounds.width * 0.45,
    clientY: stageBounds.y + stageBounds.height * 0.4,
  });
  await stage.dispatchEvent("mouseup", {
    button: 0,
    clientX: stageBounds.x + stageBounds.width * 0.45,
    clientY: stageBounds.y + stageBounds.height * 0.4,
  });

  const movedRegionX = Number(await page.getByPlaceholder("np. 12").inputValue());
  const movedRegionY = Number(await page.getByPlaceholder("np. 18").inputValue());
  expect(movedRegionX).toBeGreaterThan(regionX);
  expect(movedRegionY).toBeGreaterThan(regionY);

  const resizeHandle = page.getByLabel("Zmien rozmiar z prawego dolnego rogu");
  await resizeHandle.dispatchEvent("mousedown", {
    button: 0,
    clientX: stageBounds.x + stageBounds.width * 0.8,
    clientY: stageBounds.y + stageBounds.height * 0.8,
  });
  await stage.dispatchEvent("mousemove", {
    button: 0,
    clientX: stageBounds.x + stageBounds.width * 0.9,
    clientY: stageBounds.y + stageBounds.height * 0.9,
  });
  await stage.dispatchEvent("mouseup", {
    button: 0,
    clientX: stageBounds.x + stageBounds.width * 0.9,
    clientY: stageBounds.y + stageBounds.height * 0.9,
  });

  const resizedWidth = Number(await page.getByPlaceholder("np. 36").inputValue());
  const resizedHeight = Number(await page.getByPlaceholder("np. 24").inputValue());
  expect(resizedWidth).toBeGreaterThan(regionWidth);
  expect(resizedHeight).toBeGreaterThan(regionHeight);

  await page.getByRole("button", { name: "Zapisz konfiguracje produktu QC" }).click();

  await expect(page.getByText(/Zapisano konfiguracje QC dla SCREW_M4/)).toBeVisible();
  await expect(page.getByText("SKONFIGUROWANY")).toBeVisible();
  expect(Number(createdStepPayload?.region_x)).toBeGreaterThan(19);
  expect(Number(createdStepPayload?.region_y)).toBeGreaterThan(0);
  expect(Number(createdStepPayload?.region_width)).toBeGreaterThan(regionWidth);
  expect(Number(createdStepPayload?.region_height)).toBeGreaterThan(regionHeight);
});
