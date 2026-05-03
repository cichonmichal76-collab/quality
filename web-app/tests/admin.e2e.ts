import { expect, test } from "@playwright/test";

test("admin page creates operator and updates workstation", async ({ page }) => {
  const operators = [
    {
      id: "OP-ROW-001",
      operator_id: "QCOP-EXISTING",
      full_name: "Istniejacy operator",
      role: "QUALITY_INSPECTOR",
      login_name: "qc-existing",
      rfid_uid_hash: "RFID-EXISTING",
      is_active: true,
      created_at: "2026-05-03T08:00:00Z",
    },
  ];
  const workstations = [
    {
      id: "WS-ROW-001",
      workstation_id: "QCWS-001",
      name: "Stacja QC 1",
      area: "QA",
      station_type: "QC",
      is_active: true,
    },
  ];

  await page.route("**/api/operators", async (route) => {
    if (route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      operators.unshift({
        id: "OP-ROW-NEW",
        operator_id: String(payload.operator_id),
        full_name: String(payload.full_name),
        role: String(payload.role),
        login_name: String(payload.login_name ?? ""),
        rfid_uid_hash: String(payload.rfid_uid_hash ?? ""),
        is_active: Boolean(payload.is_active),
        created_at: "2026-05-03T10:00:00Z",
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(operators[0]),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(operators),
    });
  });

  await page.route("**/api/workstations", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(workstations),
    });
  });

  await page.route("**/api/workstations/QCWS-001", async (route) => {
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    workstations[0] = {
      ...workstations[0],
      ...payload,
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(workstations[0]),
    });
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

  await page.route("**/api/operators", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route("**/api/workstations", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route(
    "**/api/qc-product-configurations/DEMO-OPS?variant_code=DEFAULT",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
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
        }),
      });
    },
  );

  await page.route("**/api/qc-checklists?device_type=DEMO-OPS**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "CHK-001",
          checklist_code: "QC-DEMO-OPS-DEFAULT-SCREW-M4",
          name: "Kontrola sruby M4",
          process_stage: "COMPONENT_QC",
          version: "1.0",
          device_type: "DEMO-OPS",
          variant_code: "DEFAULT",
          component_type: "SCREW_M4",
          skip_component_qc: false,
          reference_image_file_id: "FILE-001",
          is_active: true,
          created_at: "2026-05-03T11:00:00Z",
        },
      ]),
    });
  });

  await page.route("**/api/qc-checklists/QC-DEMO-OPS-DEFAULT-SCREW-M4/steps", async (route) => {
    if (route.request().method() === "POST") {
      configurationLoaded = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
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
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
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
      ]),
    });
  });

  await page.route("**/api/qc-checklists", async (route) => {
    if (route.request().method() === "POST") {
      configurationLoaded = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "CHK-001",
          checklist_code: "QC-DEMO-OPS-DEFAULT-SCREW-M4",
          name: "Kontrola sruby M4",
          process_stage: "COMPONENT_QC",
          version: "1.0",
          device_type: "DEMO-OPS",
          variant_code: "DEFAULT",
          component_type: "SCREW_M4",
          skip_component_qc: false,
          reference_image_file_id: null,
          is_active: true,
          created_at: "2026-05-03T11:00:00Z",
        }),
      });
      return;
    }

    await route.fallback();
  });

  await page.route(
    "**/api/qc-checklists/QC-DEMO-OPS-DEFAULT-SCREW-M4/reference-image",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "CHK-001",
          checklist_code: "QC-DEMO-OPS-DEFAULT-SCREW-M4",
          name: "Kontrola sruby M4",
          process_stage: "COMPONENT_QC",
          version: "1.0",
          device_type: "DEMO-OPS",
          variant_code: "DEFAULT",
          component_type: "SCREW_M4",
          skip_component_qc: false,
          reference_image_file_id: "FILE-001",
          is_active: true,
          created_at: "2026-05-03T11:00:00Z",
        }),
      });
    },
  );

  await page.route("**/api/files/FILE-001", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: "demo-image",
    });
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
  await page.getByPlaceholder("np. 12").fill("62");
  await page.getByPlaceholder("np. 18").fill("58");
  await page.getByPlaceholder("np. 36").fill("20");
  await page.getByPlaceholder("np. 24").fill("16");
  await page.getByLabel("Zdjecie referencyjne elementu").setInputFiles({
    name: "screw.png",
    mimeType: "image/png",
    buffer: Buffer.from("demo-image"),
  });
  await expect(page.getByText("K1")).toBeVisible();

  await page.getByRole("button", { name: "Zapisz konfiguracje produktu QC" }).click();

  await expect(page.getByText(/Zapisano konfiguracje QC dla SCREW_M4/)).toBeVisible();
  await expect(page.getByText("SKONFIGUROWANY")).toBeVisible();
});
