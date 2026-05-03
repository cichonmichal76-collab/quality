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
