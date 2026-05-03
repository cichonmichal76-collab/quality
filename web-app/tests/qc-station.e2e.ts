import { expect, test } from "@playwright/test";

test("qc station starts from login screen and supports RFID entry", async ({ page }) => {
  let barcodeLookupCount = 0;

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    const method = route.request().method();

    if (pathname === "/api/operators") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "ROW-OP-001",
            operator_id: "QCOP-DEMO-LOCAL",
            full_name: "Anna Kontrola",
            role: "QUALITY_INSPECTOR",
            login_name: "qc-demo-local",
            rfid_uid_hash: "QCRFID-DEMO-LOCAL",
            is_active: true,
            created_at: "2026-05-03T07:55:00Z",
          },
        ]),
      });
      return;
    }

    if (pathname === "/api/workstations") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "ROW-WS-001",
            workstation_id: "QCWS-DEMO-LOCAL",
            name: "QC Station Demo",
            area: "QA",
            station_type: "QC",
            is_active: true,
          },
        ]),
      });
      return;
    }

    if (pathname === "/api/qc-checklists") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "CHK-001",
            checklist_code: "QC-STATION-DEMO-LOCAL",
            name: "Kontrola wentylatora",
            process_stage: "COMPONENT_QC",
            version: "1.0",
            device_type: null,
            variant_code: null,
            component_type: null,
            skip_component_qc: false,
            reference_image_file_id: "FILE-REF-001",
            is_active: true,
            created_at: "2026-05-03T08:05:00Z",
          },
        ]),
      });
      return;
    }

    if (pathname === "/api/qc-waiting-items") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "ITEM-ROW-001",
            item_serial_number: "QCITEM-DEMO-LOCAL",
            barcode_value: "QCBC-DEMO-LOCAL",
            item_type: "FAN_MODULE",
            part_number: "PN-FAN-001",
            revision: "A",
            drawing_number: null,
            drawing_revision: null,
            production_order: null,
            material_batch: null,
            machine_id: null,
            created_by_operator_id: "QCOP-DEMO-LOCAL",
            current_status: "PRODUCED",
            produced_at: "2026-05-03T08:10:00Z",
            created_at: "2026-05-03T08:10:00Z",
          },
        ]),
      });
      return;
    }

    if (pathname === "/api/files/FILE-REF-001") {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: "demo-image",
      });
      return;
    }

    if (pathname === "/api/auth/rfid-login" && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "ROW-SESSION-001",
          work_session_id: "WS-QA-001",
          operator_id: "QCOP-DEMO-LOCAL",
          workstation_id: "QCWS-DEMO-LOCAL",
          machine_id: null,
          status: "ACTIVE",
          started_at: "2026-05-03T08:00:00Z",
          ended_at: null,
        }),
      });
      return;
    }

    if (pathname === "/api/qc-checklists/QC-STATION-DEMO-LOCAL/steps") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "STEP-001",
            checklist_id: "CHK-001",
            step_order: 1,
            title: "Zmierz szerokosc",
            instruction: "Uzyj suwmiarki cyfrowej.",
            control_area: "Obudowa wentylatora",
            evaluation_mode: "NUMERIC_RANGE",
            result_input_label: "Wynik szerokosci",
            region_x: 14,
            region_y: 18,
            region_width: 58,
            region_height: 34,
            requires_photo: false,
            requires_measurement: true,
            blocking_on_fail: true,
            expected_value: "25.0",
            unit: "mm",
            tolerance_min: 24.8,
            tolerance_max: 25.2,
          },
          {
            id: "STEP-002",
            checklist_id: "CHK-001",
            step_order: 2,
            title: "Zatwierdz etykiete",
            instruction: "Sprawdz zgodnosc nadruku z karta kontroli.",
            control_area: "Etykieta",
            evaluation_mode: "TEXT_MATCH",
            result_input_label: "Wpisz odczyt etykiety",
            region_x: 62,
            region_y: 60,
            region_width: 24,
            region_height: 18,
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
      return;
    }

    if (pathname === "/api/production-items/by-barcode/QCBC-DEMO-LOCAL") {
      barcodeLookupCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "ITEM-ROW-001",
          item_serial_number: "QCITEM-DEMO-LOCAL",
          barcode_value: "QCBC-DEMO-LOCAL",
          item_type: "FAN_MODULE",
          part_number: "PN-FAN-001",
          revision: "A",
          drawing_number: null,
          drawing_revision: null,
          production_order: null,
          material_batch: null,
          machine_id: null,
          created_by_operator_id: "QCOP-DEMO-LOCAL",
          current_status: barcodeLookupCount > 1 ? "QC_PASSED" : "PRODUCED",
          produced_at: "2026-05-03T08:10:00Z",
          created_at: "2026-05-03T08:10:00Z",
        }),
      });
      return;
    }

    if (pathname === "/api/qc-runs" && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          run_id: "QC-WEB-E2E-001",
          item_serial_number: "QCITEM-DEMO-LOCAL",
          barcode_value: "QCBC-DEMO-LOCAL",
          checklist_id: "CHK-001",
          process_stage: "COMPONENT_QC",
          work_session_id: "WS-QA-001",
          operator_id: "QCOP-DEMO-LOCAL",
          id: "QC-ROW-001",
          status: "IN_PROGRESS",
          result: null,
          started_at: "2026-05-03T08:20:00Z",
          ended_at: null,
        }),
      });
      return;
    }

    if (
      pathname.startsWith("/api/qc-runs/") &&
      pathname.endsWith("/result") &&
      method === "POST"
    ) {
      const requestBody = JSON.parse(route.request().postData() ?? "{}");
      const stepId = pathname.split("/").at(-2) ?? "STEP-UNKNOWN";

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: `STEP-RESULT-${stepId}`,
          qc_run_id: "QC-ROW-001",
          step_id: stepId,
          status: requestBody.measurement_value ? "PASS" : requestBody.status,
          measurement_value: requestBody.measurement_value ?? null,
          comment: requestBody.comment ?? null,
          mcu_snapshot: null,
          created_at: "2026-05-03T08:20:15Z",
        }),
      });
      return;
    }

    if (pathname.startsWith("/api/qc-runs/") && pathname.endsWith("/complete")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          run_id: "QC-WEB-E2E-001",
          item_serial_number: "QCITEM-DEMO-LOCAL",
          barcode_value: "QCBC-DEMO-LOCAL",
          checklist_id: "CHK-001",
          process_stage: "COMPONENT_QC",
          work_session_id: "WS-QA-001",
          operator_id: "QCOP-DEMO-LOCAL",
          id: "QC-ROW-001",
          status: "COMPLETED",
          result: "PASS",
          started_at: "2026-05-03T08:20:00Z",
          ended_at: "2026-05-03T08:20:40Z",
        }),
      });
      return;
    }

    await route.abort();
  });

  await page.goto("/qc-station");

  await expect(page.getByText("System kontroli jakosci")).toBeVisible();
  await expect(page.getByText("Logowanie RFID")).toBeVisible();

  await page.getByPlaceholder("Przyluz karte albo wpisz UID").fill("QCRFID-DEMO-LOCAL");
  await page.getByRole("button", { name: "Zaloguj przez RFID" }).click();

  await expect(page.getByRole("heading", { name: "Sesja stanowiskowa" })).toBeVisible();
  await expect(page.getByText("Anna Kontrola")).toBeVisible();
  await expect(page.getByText(/RFID rozpoznane/i)).toBeVisible();
  await expect(page.getByTestId("qc-waiting-list")).toBeVisible();
  await expect(page.getByAltText(/Wzorzec kontroli Kontrola wentylatora/i)).toBeVisible();
  await expect(page.getByText("K1")).toBeVisible();
  await expect(page.getByText("K2")).toBeVisible();

  await page.getByPlaceholder("np. BC-DEMO-001").fill("QCBC-DEMO-LOCAL");
  await page.getByRole("button", { name: "Pobierz detal" }).click();

  await expect(
    page
      .locator(".detail-card")
      .filter({ hasText: "Serial komponentu" })
      .getByText("QCITEM-DEMO-LOCAL", { exact: true }),
  ).toBeVisible();

  await page.getByPlaceholder("np. 24.95").fill("25.0");
  await page.getByPlaceholder("Wpisz odczyt lub wynik obserwacji").fill("A2-70");
  await page
    .getByPlaceholder("Opcjonalna notatka albo numer przyrzadu")
    .first()
    .fill("Pomiar w normie");
  await page
    .getByPlaceholder("Opcjonalna notatka albo numer przyrzadu")
    .nth(1)
    .fill("Etykieta czytelna");

  await page.getByRole("button", { name: "Zapisz kontrole QC" }).click();

  await expect(page.getByText(/Kontrola zakonczona PASS/)).toBeVisible();
  await expect(
    page
      .locator(".detail-card")
      .filter({ hasText: "Status biezacy" })
      .getByText(/QC passed|QC_PASSED/i),
  ).toBeVisible();
});

test("qc station pozwala pobrac detal z kolejki oczekujacych na QC", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    const method = route.request().method();

    if (pathname === "/api/operators") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "ROW-OP-001",
            operator_id: "QCOP-DEMO-LOCAL",
            full_name: "Anna Kontrola",
            role: "QUALITY_INSPECTOR",
            login_name: "qc-demo-local",
            rfid_uid_hash: "QCRFID-DEMO-LOCAL",
            is_active: true,
            created_at: "2026-05-03T07:55:00Z",
          },
        ]),
      });
      return;
    }

    if (pathname === "/api/workstations") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "ROW-WS-001",
            workstation_id: "QCWS-DEMO-LOCAL",
            name: "QC Station Demo",
            area: "QA",
            station_type: "QC",
            is_active: true,
          },
        ]),
      });
      return;
    }

    if (pathname === "/api/qc-checklists") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "CHK-001",
            checklist_code: "QC-STATION-DEMO-LOCAL",
            name: "Kontrola wentylatora",
            process_stage: "COMPONENT_QC",
            version: "1.0",
            device_type: null,
            variant_code: null,
            component_type: "FAN_MODULE",
            skip_component_qc: false,
            reference_image_file_id: null,
            is_active: true,
            created_at: "2026-05-03T08:05:00Z",
          },
        ]),
      });
      return;
    }

    if (pathname === "/api/qc-waiting-items") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "ITEM-ROW-QUEUE",
            item_serial_number: "QCITEM-DEMO-QUEUE",
            barcode_value: "QCBC-DEMO-QUEUE",
            item_type: "FAN_MODULE",
            part_number: "PN-FAN-002",
            revision: "B",
            drawing_number: null,
            drawing_revision: null,
            production_order: null,
            material_batch: null,
            machine_id: null,
            created_by_operator_id: "QCOP-DEMO-LOCAL",
            current_status: "PRODUCED",
            produced_at: "2026-05-03T08:15:00Z",
            created_at: "2026-05-03T08:15:00Z",
          },
        ]),
      });
      return;
    }

    if (pathname === "/api/auth/operator-login" && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "ROW-SESSION-003",
          work_session_id: "WS-QA-003",
          operator_id: "QCOP-DEMO-LOCAL",
          workstation_id: "QCWS-DEMO-LOCAL",
          machine_id: null,
          status: "ACTIVE",
          started_at: "2026-05-03T08:00:00Z",
          ended_at: null,
        }),
      });
      return;
    }

    if (pathname === "/api/qc-checklists/QC-STATION-DEMO-LOCAL/steps") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "STEP-001",
            checklist_id: "CHK-001",
            step_order: 1,
            title: "Ocena wizualna",
            instruction: "Porownaj detal ze wzorcem.",
            control_area: "Front",
            evaluation_mode: "MANUAL",
            result_input_label: null,
            region_x: null,
            region_y: null,
            region_width: null,
            region_height: null,
            requires_photo: false,
            requires_measurement: false,
            blocking_on_fail: true,
            expected_value: null,
            unit: null,
            tolerance_min: null,
            tolerance_max: null,
          },
        ]),
      });
      return;
    }

    await route.abort();
  });

  await page.goto("/qc-station");

  await page.getByPlaceholder("np. qc-demo-local").fill("qc-demo-local");
  await page.getByPlaceholder("Haslo operatora").fill("qc-demo-local-123");
  await page.getByRole("button", { name: "Wejdz do aplikacji" }).click();

  await expect(page.getByRole("heading", { name: "Sesja stanowiskowa" })).toBeVisible();
  await page.getByRole("button", { name: /QCITEM-DEMO-QUEUE/i }).click();

  await expect(
    page
      .locator(".detail-card")
      .filter({ hasText: "Serial komponentu" })
      .getByText("QCITEM-DEMO-QUEUE", { exact: true }),
  ).toBeVisible();
  await expect(page.getByPlaceholder("np. BC-DEMO-001")).toHaveValue("QCBC-DEMO-QUEUE");
});
