import type { Route } from "@playwright/test";

type JsonResponseOptions = {
  status?: number;
  contentType?: string;
};

export async function fulfillJson(
  route: Route,
  body: unknown,
  options: JsonResponseOptions = {},
) {
  await route.fulfill({
    status: options.status ?? 200,
    contentType: options.contentType ?? "application/json",
    body: JSON.stringify(body),
  });
}

export async function fulfillImage(route: Route, body = "demo-image") {
  await route.fulfill({
    status: 200,
    contentType: "image/png",
    body,
  });
}
