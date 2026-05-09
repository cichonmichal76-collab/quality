import { expect, test } from "@playwright/test";
import {
  buildQcDemoChecklist,
  buildQcDemoItem,
  buildQcDemoOperator,
  buildQcDemoSession,
  buildQcDemoWorkstation,
  fulfillImage,
  fulfillJson,
} from "./qc-station.e2e-helpers";

test("qc station starts from login screen and supports RFID entry", async ({ page }) => {
  let barcodeLookupCount = 0;

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    const method = route.request().method();

    if (pathname === "/api/operators") {
      await fulfillJson(route, [buildQcDemoOperator()]);
      return;
    }

    if (pathname === "/api/workstations") {
      await fulfillJson(route, [buildQcDemoWorkstation()]);
      return;
    }

    if (pathname === "/api/qc-checklists") {
      await fulfillJson(
        route,
        [buildQcDemoChecklist({ reference_image_file_id: "FILE-REF-001" })],
      );
      return;
    }

    if (pathname === "/api/qc-waiting-items") {
      await fulfillJson(route, [buildQcDemoItem()]);
      return;
    }

    if (pathname === "/api/files/FILE-REF-001") {
      await fulfillImage(route);
      return;
    }

    if (pathname === "/api/auth/rfid-login" && method === "POST") {
      await fulfillJson(route, buildQcDemoSession());
      return;
    }

    if (pathname === "/api/qc-checklists/QC-STATION-DEMO-LOCAL/steps") {
      await fulfillJson(route, [
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
      ]);
      return;
    }

    if (pathname === "/api/production-items/by-barcode/QCBC-DEMO-LOCAL") {
      barcodeLookupCount += 1;
      await fulfillJson(
        route,
        buildQcDemoItem({
          current_status: barcodeLookupCount > 1 ? "QC_PASSED" : "PRODUCED",
        }),
      );
      return;
    }

    if (pathname === "/api/qc-items/QCITEM-DEMO-LOCAL/reserve" && method === "POST") {
      await fulfillJson(
        route,
        buildQcDemoItem({
          qc_reserved_by_operator_id: "QCOP-DEMO-LOCAL",
          qc_reserved_by_workstation_id: "QCWS-DEMO-LOCAL",
          qc_reserved_at: "2026-05-03T08:10:30Z",
        }),
      );
      return;
    }

    if (pathname === "/api/qc-runs" && method === "POST") {
      await fulfillJson(route, {
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

      await fulfillJson(route, {
        id: `STEP-RESULT-${stepId}`,
        qc_run_id: "QC-ROW-001",
        step_id: stepId,
        status: requestBody.measurement_value ? "PASS" : requestBody.status,
        measurement_value: requestBody.measurement_value ?? null,
        comment: requestBody.comment ?? null,
        mcu_snapshot: null,
        created_at: "2026-05-03T08:20:15Z",
      });
      return;
    }

    if (pathname.startsWith("/api/qc-runs/") && pathname.endsWith("/complete")) {
      await fulfillJson(route, {
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
      });
      return;
    }

    if (
      pathname.includes("/open-critical-ncrs") ||
      pathname.includes("/closed-critical-ncrs") ||
      pathname.includes("/runs")
    ) {
      await fulfillJson(route, []);
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
      await fulfillJson(route, [buildQcDemoOperator()]);
      return;
    }

    if (pathname === "/api/workstations") {
      await fulfillJson(route, [buildQcDemoWorkstation()]);
      return;
    }

    if (pathname === "/api/qc-checklists") {
      await fulfillJson(
        route,
        [buildQcDemoChecklist({ component_type: "FAN_MODULE" })],
      );
      return;
    }

    if (pathname === "/api/qc-waiting-items") {
      await fulfillJson(route, [
        buildQcDemoItem({
          id: "ITEM-ROW-QUEUE",
          item_serial_number: "QCITEM-DEMO-QUEUE",
          barcode_value: "QCBC-DEMO-QUEUE",
          part_number: "PN-FAN-002",
          revision: "B",
          produced_at: "2026-05-03T08:15:00Z",
          created_at: "2026-05-03T08:15:00Z",
        }),
        buildQcDemoItem({
          id: "ITEM-ROW-QUEUE-REWORK",
          item_serial_number: "QCITEM-DEMO-QUEUE-REWORK",
          barcode_value: "QCBC-DEMO-QUEUE-REWORK",
          part_number: "PN-FAN-003",
          revision: "C",
          current_status: "REWORK_REQUIRED",
          produced_at: "2026-05-03T08:20:00Z",
          created_at: "2026-05-03T08:20:00Z",
          qc_reserved_by_operator_id: "QCOP-DEMO-LOCAL",
          qc_reserved_by_workstation_id: "QCWS-DEMO-LOCAL",
          qc_reserved_at: "2026-05-03T08:22:00Z",
        }),
        buildQcDemoItem({
          id: "ITEM-ROW-QUEUE-OTHER",
          item_serial_number: "QCITEM-DEMO-QUEUE-OTHER",
          barcode_value: "QCBC-DEMO-QUEUE-OTHER",
          part_number: "PN-FAN-004",
          revision: "D",
          created_by_operator_id: "QCOP-OTHER",
          produced_at: "2026-05-03T08:25:00Z",
          created_at: "2026-05-03T08:25:00Z",
          qc_reserved_by_operator_id: "QCOP-OTHER",
          qc_reserved_by_workstation_id: "QCWS-OTHER",
          qc_reserved_at: "2026-05-03T08:26:00Z",
        }),
      ]);
      return;
    }

    if (pathname === "/api/auth/operator-login" && method === "POST") {
      await fulfillJson(
        route,
        buildQcDemoSession({
          id: "ROW-SESSION-003",
          work_session_id: "WS-QA-003",
        }),
      );
      return;
    }

    if (pathname === "/api/qc-checklists/QC-STATION-DEMO-LOCAL/steps") {
      await fulfillJson(route, [
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
        ]);
      return;
    }

    if (
      pathname.includes("/open-critical-ncrs") ||
      pathname.includes("/closed-critical-ncrs") ||
      pathname.includes("/runs")
    ) {
      await fulfillJson(route, []);
      return;
    }

    await route.abort();
  });

  await page.goto("/qc-station");

  await page.getByPlaceholder("np. qc-demo-local").fill("qc-demo-local");
  await page.getByPlaceholder("Haslo operatora").fill("qc-demo-local-123");
  await page.getByRole("button", { name: "Wejdz do aplikacji" }).click();

  await expect(page.getByRole("heading", { name: "Sesja stanowiskowa" })).toBeVisible();
  await expect(page.getByText("3/3 oczekuje")).toBeVisible();
  await expect(page.getByTestId("qc-waiting-summary-all")).toContainText("3");
  await expect(page.getByTestId("qc-waiting-summary-unreserved")).toContainText("1");
  await expect(page.getByTestId("qc-waiting-summary-mine")).toContainText("1");
  await expect(page.getByTestId("qc-waiting-summary-other")).toContainText("1");
  await expect(page.getByTestId("qc-waiting-list")).toContainText(
    "Zarezerwowane: QCOP-OTHER @ QCWS-OTHER",
  );
  await expect(page.getByTestId("qc-waiting-list")).toContainText("Wolny detal");

  await page.getByLabel("Status kolejki QC").selectOption("REWORK_REQUIRED");
  await expect(page.getByText("1/3 oczekuje")).toBeVisible();
  await expect(page.getByTestId("qc-waiting-list")).toContainText("QCITEM-DEMO-QUEUE-REWORK");
  await expect(page.locator('[data-testid="qc-waiting-list"] button')).toHaveCount(1);

  await page.getByRole("button", { name: "Moje rezerwacje" }).click();
  await expect(page.getByText("1/3 oczekuje")).toBeVisible();
  await expect(page.getByTestId("qc-waiting-list")).toContainText("QCITEM-DEMO-QUEUE-REWORK");
  await expect(page.getByTestId("qc-waiting-list")).not.toContainText("QCITEM-DEMO-QUEUE-OTHER");

  await page.getByRole("button", { name: "Wolne detale" }).click();
  await expect(page.getByText("1/3 oczekuje")).toBeVisible();
  await expect(page.getByTestId("qc-waiting-list")).toContainText("QCITEM-DEMO-QUEUE");
  await expect(page.getByTestId("qc-waiting-list")).not.toContainText("QCITEM-DEMO-QUEUE-REWORK");

  await page.getByRole("button", { name: "Cudze rezerwacje" }).click();
  await expect(page.getByText("1/3 oczekuje")).toBeVisible();
  await expect(page.getByTestId("qc-waiting-list")).toContainText("QCITEM-DEMO-QUEUE-OTHER");
  await expect(
    page.getByTestId("qc-waiting-list").getByRole("button", { name: /QCITEM-DEMO-QUEUE-OTHER/i }),
  ).toBeDisabled();

  await page.getByRole("button", { name: "Reset kolejki" }).click();
  await expect(page.getByTestId("qc-waiting-list")).toContainText("QCITEM-DEMO-QUEUE");
  await expect(page.getByTestId("qc-waiting-list")).toContainText("QCITEM-DEMO-QUEUE-OTHER");
  await page.locator('[data-testid="qc-waiting-list"] button').first().click();

  await expect(
    page
      .locator(".detail-card")
      .filter({ hasText: "Serial komponentu" })
      .getByText("QCITEM-DEMO-QUEUE", { exact: true }),
  ).toBeVisible();
  await expect(page.getByPlaceholder("np. BC-DEMO-001")).toHaveValue("QCBC-DEMO-QUEUE");
});

test("qc station pozwala zamknac NCR i przywrocic detal do reworku", async ({ page }) => {
  let releasedForRework = false;

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    const method = route.request().method();

    if (pathname === "/api/operators") {
      await fulfillJson(route, [buildQcDemoOperator()]);
      return;
    }

    if (pathname === "/api/workstations") {
      await fulfillJson(route, [buildQcDemoWorkstation()]);
      return;
    }

    if (pathname === "/api/qc-checklists") {
      await fulfillJson(
        route,
        [
          buildQcDemoChecklist({
            id: "CHK-REWORK",
            checklist_code: "QC-REWORK",
            name: "Kontrola po reworku",
            component_type: "FAN_MODULE",
          }),
        ],
      );
      return;
    }

    if (pathname === "/api/qc-waiting-items") {
      await fulfillJson(route, [
        buildQcDemoItem({
          id: "ITEM-ROW-REWORK",
          item_serial_number: "QCITEM-DEMO-REWORK",
          barcode_value: "QCBC-DEMO-REWORK",
          part_number: "PN-FAN-REWORK",
          current_status: releasedForRework ? "REWORK_REQUIRED" : "QC_FAILED",
          produced_at: "2026-05-03T08:16:00Z",
          created_at: "2026-05-03T08:16:00Z",
        }),
      ]);
      return;
    }

    if (pathname === "/api/auth/operator-login" && method === "POST") {
      await fulfillJson(
        route,
        buildQcDemoSession({
          id: "ROW-SESSION-REWORK",
          work_session_id: "WS-QA-REWORK",
        }),
      );
      return;
    }

    if (pathname === "/api/qc-checklists/QC-REWORK/steps") {
      await fulfillJson(route, [
          {
            id: "STEP-REWORK-001",
            checklist_id: "CHK-REWORK",
            step_order: 1,
            title: "Potwierdz rework",
            instruction: "Kontrola po poprawce.",
            control_area: "Obudowa",
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
        ]);
      return;
    }

    if (pathname === "/api/qc-items/QCITEM-DEMO-REWORK/open-critical-ncrs") {
      await fulfillJson(route, 
          releasedForRework
            ? []
            : [
                {
                  id: "NCR-ROW-001",
                  ncr_id: "NCR-QC-REWORK-001",
                  device_serial_number: null,
                  component_serial_number: "QCITEM-DEMO-REWORK",
                  process_stage: "COMPONENT_QC",
                  description: "QC failed: VISUAL_DEFECT. Pekniecie obudowy.",
                  severity: "CRITICAL",
                  detected_by: "QCOP-DEMO-LOCAL",
                  corrective_action: null,
                  status: "OPEN",
                  detected_at: "2026-05-03T08:18:00Z",
                  closed_at: null,
                },
              ],
        );
      return;
    }

    if (pathname === "/api/qc-items/QCITEM-DEMO-REWORK/closed-critical-ncrs") {
      await fulfillJson(route, 
          releasedForRework
            ? [
                {
                  id: "NCR-ROW-001",
                  ncr_id: "NCR-QC-REWORK-001",
                  device_serial_number: null,
                  component_serial_number: "QCITEM-DEMO-REWORK",
                  process_stage: "COMPONENT_QC",
                  description: "QC failed: VISUAL_DEFECT. Pekniecie obudowy.",
                  severity: "CRITICAL",
                  detected_by: "QCOP-DEMO-LOCAL",
                  corrective_action:
                    "Wymieniono obudowe i przygotowano detal do ponownej kontroli.",
                  status: "CLOSED",
                  detected_at: "2026-05-03T08:18:00Z",
                  closed_at: "2026-05-03T08:25:00Z",
                },
                {
                  id: "NCR-ROW-002",
                  ncr_id: "NCR-QC-REWORK-000",
                  device_serial_number: null,
                  component_serial_number: "QCITEM-DEMO-REWORK",
                  process_stage: "COMPONENT_QC",
                  description: "Stary NCR po wczesniejszym reworku.",
                  severity: "CRITICAL",
                  detected_by: "QCOP-DEMO-LOCAL",
                  corrective_action: "Starsza akcja korygujaca.",
                  status: "CLOSED",
                  detected_at: "2026-05-03T08:05:00Z",
                  closed_at: "2026-05-03T08:10:00Z",
                },
              ]
            : [],
        );
      return;
    }

    if (pathname === "/api/qc-items/QCITEM-DEMO-REWORK/runs") {
      await fulfillJson(route, [
          {
            id: "QC-ROW-REWORK",
            run_id: "QC-WEB-REWORK",
            item_serial_number: "QCITEM-DEMO-REWORK",
            barcode_value: "QCBC-DEMO-REWORK",
            checklist_id: "CHK-REWORK",
            process_stage: "COMPONENT_QC",
            work_session_id: "WS-QA-REWORK",
              operator_id: "QCOP-DEMO-LOCAL",
              status: "COMPLETED",
              result: "FAIL",
              started_at: "2026-05-03T08:17:00Z",
              ended_at: "2026-05-03T08:19:00Z",
            },
            {
              id: "QC-ROW-PASS-OLD",
              run_id: "QC-WEB-PASS-OLD",
              item_serial_number: "QCITEM-DEMO-REWORK",
              barcode_value: "QCBC-DEMO-REWORK",
              checklist_id: "CHK-REWORK",
              process_stage: "COMPONENT_QC",
              work_session_id: "WS-QA-REWORK",
              operator_id: "QCOP-DEMO-LOCAL",
              status: "COMPLETED",
              result: "PASS",
              started_at: "2026-05-03T08:02:00Z",
              ended_at: "2026-05-03T08:04:00Z",
            },
            {
              id: "QC-ROW-POST-REWORK",
              run_id: "QC-WEB-POST-REWORK",
              item_serial_number: "QCITEM-DEMO-REWORK",
              barcode_value: "QCBC-DEMO-REWORK",
              checklist_id: "CHK-REWORK",
              process_stage: "COMPONENT_QC",
              work_session_id: "WS-QA-REWORK",
              operator_id: "QCOP-DEMO-LOCAL",
              status: "COMPLETED",
              result: "PASS",
              started_at: "2026-05-03T08:31:00Z",
              ended_at: "2026-05-03T08:33:00Z",
            },
          ]);
        return;
      }

    if (pathname === "/api/qc-runs/QC-WEB-REWORK/details") {
      await fulfillJson(route, {
          id: "QC-ROW-REWORK",
          run_id: "QC-WEB-REWORK",
          device_serial_number: null,
          item_serial_number: "QCITEM-DEMO-REWORK",
          barcode_value: "QCBC-DEMO-REWORK",
          checklist_id: "CHK-REWORK",
          checklist_code: "QC-STATION-DEMO-LOCAL",
          checklist_name: "Kontrola wentylatora",
          process_stage: "COMPONENT_QC",
          operator_id: "QCOP-DEMO-LOCAL",
          status: "COMPLETED",
          result: "FAIL",
          started_at: "2026-05-03T08:17:00Z",
          ended_at: "2026-05-03T08:19:00Z",
          failure_reason: "VISUAL_DEFECT",
          failure_comment: "Pekniecie obudowy.",
          failure_disposition: "OPEN_CRITICAL_NCR",
          step_results: [
            {
              id: "STEP-RESULT-REWORK-001",
              qc_run_id: "QC-ROW-REWORK",
              step_id: "STEP-REWORK-001",
              step_order: 1,
              step_title: "Sprawdz obudowe",
              evaluation_mode: "MANUAL",
              result_input_label: null,
              control_area: "Obudowa",
              expected_value: null,
              tolerance_min: null,
              tolerance_max: null,
              unit: null,
              status: "FAIL",
              measurement_value: null,
              observed_value: null,
              comment: "Pekniecie obudowy.",
              mcu_snapshot: null,
              created_at: "2026-05-03T08:17:30Z",
            },
          ],
          evidence_files: [
            {
              id: "FILE-REWORK-001",
              related_entity_type: "QC_RUN",
              related_entity_id: "QC-WEB-REWORK",
              file_name: "pekniecie-obudowy.jpg",
              file_path: "/storage/files/pekniecie-obudowy.jpg",
              file_type: "image/jpeg",
              file_hash: "hash-rework-001",
              uploaded_by: "QCOP-DEMO-LOCAL",
              created_at: "2026-05-03T08:18:00Z",
            },
          ],
        });
      return;
    }

    if (pathname === "/api/qc-runs/QC-WEB-PASS-OLD/details") {
      await fulfillJson(route, {
          id: "QC-ROW-PASS-OLD",
          run_id: "QC-WEB-PASS-OLD",
          device_serial_number: null,
          item_serial_number: "QCITEM-DEMO-REWORK",
          barcode_value: "QCBC-DEMO-REWORK",
          checklist_id: "CHK-REWORK",
          checklist_code: "QC-REWORK",
          checklist_name: "Kontrola po reworku",
          process_stage: "COMPONENT_QC",
          operator_id: "QCOP-DEMO-LOCAL",
          status: "COMPLETED",
          result: "PASS",
          started_at: "2026-05-03T08:02:00Z",
          ended_at: "2026-05-03T08:04:00Z",
          failure_reason: null,
          failure_comment: null,
          failure_disposition: null,
          step_results: [],
          evidence_files: [],
        });
      return;
    }

    if (pathname === "/api/qc-runs/QC-WEB-POST-REWORK/details") {
      await fulfillJson(route, {
          id: "QC-ROW-POST-REWORK",
          run_id: "QC-WEB-POST-REWORK",
          device_serial_number: null,
          item_serial_number: "QCITEM-DEMO-REWORK",
          barcode_value: "QCBC-DEMO-REWORK",
          checklist_id: "CHK-REWORK",
          checklist_code: "QC-REWORK",
          checklist_name: "Kontrola po reworku",
          process_stage: "COMPONENT_QC",
          operator_id: "QCOP-DEMO-LOCAL",
          status: "COMPLETED",
          result: "PASS",
          started_at: "2026-05-03T08:31:00Z",
          ended_at: "2026-05-03T08:33:00Z",
          failure_reason: null,
          failure_comment: null,
          failure_disposition: null,
          step_results: [],
          evidence_files: [],
        });
      return;
    }

    if (pathname === "/api/qc-items/QCITEM-DEMO-REWORK/release-for-rework" && method === "POST") {
      releasedForRework = true;
      await fulfillJson(route, {
          id: "ITEM-ROW-REWORK",
          item_serial_number: "QCITEM-DEMO-REWORK",
          barcode_value: "QCBC-DEMO-REWORK",
          item_type: "FAN_MODULE",
          part_number: "PN-FAN-REWORK",
          revision: "A",
          drawing_number: null,
          drawing_revision: null,
          production_order: null,
          material_batch: null,
          machine_id: null,
          created_by_operator_id: "QCOP-DEMO-LOCAL",
          current_status: "REWORK_REQUIRED",
          produced_at: "2026-05-03T08:16:00Z",
          created_at: "2026-05-03T08:16:00Z",
        });
      return;
    }

    if (
      pathname.includes("/open-critical-ncrs") ||
      pathname.includes("/closed-critical-ncrs") ||
      pathname.includes("/runs")
    ) {
      await fulfillJson(route, []);
      return;
    }

    await route.abort();
  });

  await page.goto("/qc-station");

  await page.getByPlaceholder("np. qc-demo-local").fill("qc-demo-local");
  await page.getByPlaceholder("Haslo operatora").fill("qc-demo-local-123");
  await page.getByRole("button", { name: "Wejdz do aplikacji" }).click();

  await expect(page.getByRole("heading", { name: "Sesja stanowiskowa" })).toBeVisible();
    await page.getByRole("button", { name: /QCITEM-DEMO-REWORK/i }).click();

    await expect(page.getByText("NCR-QC-REWORK-001")).toBeVisible();
    await expect(
      page.getByTestId("qc-run-history-list").getByText("QC-WEB-REWORK"),
    ).toBeVisible();
    await page
      .getByTestId("qc-run-history-list")
      .getByRole("button", { name: /QC-WEB-REWORK/i })
      .click();
    await expect(page.getByTestId("qc-run-detail-steps")).toBeVisible();
    await expect(
      page.getByTestId("qc-run-detail-steps").getByText("Pekniecie obudowy."),
    ).toBeVisible();
    await expect(page.getByTestId("qc-run-detail-files")).toContainText(
      "pekniecie-obudowy.jpg",
    );

    await page.getByRole("button", { name: "Zamknij NCR i przywroc do reworku" }).click();
  await expect(
    page.getByText("Wpisz akcje korygujaca przed przywroceniem detalu do reworku."),
  ).toBeVisible();

  await page
    .getByLabel("Akcja korygujaca po reworku")
    .fill("Wymieniono obudowe i przygotowano detal do ponownej kontroli.");
  await page.getByRole("button", { name: "Zamknij NCR i przywroc do reworku" }).click();

    await expect(page.getByText(/Zamknieto 1 krytyczne NCR/i)).toBeVisible();
    await expect(
      page
        .locator(".detail-card")
        .filter({ hasText: "Status biezacy" })
      .getByText(/Rework Required|REWORK_REQUIRED/i),
  ).toBeVisible();
    await expect(
      page.getByText("Wymieniono obudowe i przygotowano detal do ponownej kontroli."),
    ).toBeVisible();

    await page.getByLabel("Filtr historii QC").selectOption("PASS");
    await expect(page.getByTestId("qc-run-history-list")).toContainText("QC-WEB-PASS-OLD");
    await expect(page.getByTestId("qc-run-history-list")).not.toContainText("QC-WEB-REWORK");

    await page.getByLabel("Filtr historii QC").selectOption("ALL");
    await page.getByLabel("Sortowanie historii QC").selectOption("OLDEST");
    await expect(
      page.getByTestId("qc-run-history-list").locator("button").first(),
    ).toContainText("QC-WEB-PASS-OLD");

    await page.getByLabel("Sortowanie zamknietych NCR").selectOption("OLDEST");
    await expect(
      page.getByTestId("qc-closed-ncr-list").locator(".qc-evidence-item").first(),
    ).toContainText("NCR-QC-REWORK-000");

    await page.getByRole("button", { name: "Po ostatnim reworku" }).click();
    await expect(page.getByTestId("qc-run-history-list")).toContainText("QC-WEB-POST-REWORK");
    await expect(page.getByTestId("qc-run-history-list")).not.toContainText("QC-WEB-REWORK");
    await expect(page.getByTestId("qc-run-history-list")).not.toContainText("QC-WEB-PASS-OLD");

    await page.getByRole("button", { name: "Reset historii" }).click();
    await expect(page.getByTestId("qc-run-history-list")).toContainText("QC-WEB-REWORK");
    await expect(page.getByTestId("qc-run-history-list")).toContainText("QC-WEB-PASS-OLD");
    await expect(page.getByTestId("qc-run-history-list")).toContainText("QC-WEB-POST-REWORK");
  });

