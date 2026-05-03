import { expect, test } from "@playwright/test";

test("qc station supports barcode lookup and qc completion", async ({ page }) => {
  let barcodeLookupCount = 0;

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;

    if (pathname === "/api/work-sessions") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "ROW-WS-001",
            work_session_id: "WS-QA-001",
            operator_id: "OP-QA-001",
            workstation_id: "QC-ST-01",
            machine_id: null,
            status: "ACTIVE",
            started_at: "2026-05-03T08:00:00Z",
            ended_at: null,
          },
        ]),
      });
      return;
    }

    if (pathname === "/api/operators") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "ROW-OP-001",
            operator_id: "OP-QA-001",
            full_name: "Anna Kontrola",
            role: "QUALITY_INSPECTOR",
            rfid_uid_hash: null,
            is_active: true,
            created_at: "2026-05-03T07:55:00Z",
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
            checklist_code: "QC-COMP-001",
            name: "Kontrola wentylatora",
            process_stage: "COMPONENT_QC",
            version: "1.0",
            is_active: true,
            created_at: "2026-05-03T08:05:00Z",
          },
        ]),
      });
      return;
    }

    if (pathname === "/api/qc-checklists/QC-COMP-001/steps") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "STEP-001",
            checklist_id: "CHK-001",
            step_order: 1,
            title: "Zmierz szerokość",
            instruction: "Użyj suwmiarki cyfrowej.",
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
            title: "Zatwierdź etykietę",
            instruction: "Sprawdź zgodność nadruku z kartą kontroli.",
            requires_photo: false,
            requires_measurement: false,
            blocking_on_fail: true,
            expected_value: "Czytelna",
            unit: null,
            tolerance_min: null,
            tolerance_max: null,
          },
        ]),
      });
      return;
    }

    if (pathname === "/api/production-items/by-barcode/BC-FAN-001") {
      barcodeLookupCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "ITEM-ROW-001",
          item_serial_number: "FAN-001",
          barcode_value: "BC-FAN-001",
          item_type: "FAN_MODULE",
          part_number: "PN-FAN-001",
          revision: "A",
          drawing_number: null,
          drawing_revision: null,
          production_order: null,
          material_batch: null,
          machine_id: null,
          created_by_operator_id: "OP-QA-001",
          current_status: barcodeLookupCount > 1 ? "QC_PASSED" : "PRODUCED",
          produced_at: "2026-05-03T08:10:00Z",
          created_at: "2026-05-03T08:10:00Z",
        }),
      });
      return;
    }

    if (pathname === "/api/qc-runs" && route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          run_id: "QC-WEB-E2E-001",
          item_serial_number: "FAN-001",
          barcode_value: "BC-FAN-001",
          checklist_id: "CHK-001",
          process_stage: "COMPONENT_QC",
          work_session_id: "WS-QA-001",
          operator_id: "OP-QA-001",
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
      route.request().method() === "POST"
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
          item_serial_number: "FAN-001",
          barcode_value: "BC-FAN-001",
          checklist_id: "CHK-001",
          process_stage: "COMPONENT_QC",
          work_session_id: "WS-QA-001",
          operator_id: "OP-QA-001",
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

  await expect(page.getByRole("heading", { name: /Pomiar komponentu/i })).toBeVisible();
  await page.getByPlaceholder("np. BC-DEMO-001").fill("BC-FAN-001");
  await page.getByRole("button", { name: "Pobierz detal" }).click();

  await expect(
    page
      .locator(".detail-card")
      .filter({ hasText: "Serial komponentu" })
      .getByText("FAN-001", { exact: true }),
  ).toBeVisible();
  await page.getByPlaceholder("np. 24.95").fill("25.0");
  await page
    .getByPlaceholder(
      "Opcjonalna notatka, np. numer przyrządu lub obserwacja.",
    )
    .first()
    .fill("Pomiar w normie");
  await page
    .getByPlaceholder(
      "Opcjonalna notatka, np. numer przyrządu lub obserwacja.",
    )
    .nth(1)
    .fill("Etykieta czytelna");

  await page.getByRole("button", { name: "Zapisz kontrolę QC" }).click();

  await expect(page.getByText(/Kontrola zakończona PASS/)).toBeVisible();
  await expect(
    page
      .locator(".detail-card")
      .filter({ hasText: "Status bieżący" })
      .getByText(/QC passed|QC_PASSED/i),
  ).toBeVisible();
});
