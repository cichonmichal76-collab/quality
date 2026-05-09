import { vi } from "vitest";

type JsonResponseInit = {
  status?: number;
  statusText?: string;
};

export function jsonResponse(
  payload: unknown,
  init: JsonResponseInit = {},
): Response {
  const status = init.status ?? 200;

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: init.statusText ?? (status >= 200 && status < 300 ? "OK" : "Error"),
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as Response;
}

type UrlMatcher =
  | string
  | RegExp
  | ((url: string, method: string) => boolean);

type MockResponseFactory =
  | unknown
  | Response
  | ((
      url: string,
      method: string,
      init?: RequestInit,
    ) => unknown | Response | Promise<unknown | Response>);

interface MockRoute {
  matcher: UrlMatcher;
  method?: string;
  response: MockResponseFactory;
}

function matchesRoute(
  matcher: UrlMatcher,
  url: string,
  method: string,
): boolean {
  if (typeof matcher === "string") {
    return url.endsWith(matcher);
  }
  if (matcher instanceof RegExp) {
    return matcher.test(url);
  }
  return matcher(url, method);
}

export function createFetchMock(routes: MockRoute[]) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    for (const route of routes) {
      if (route.method && route.method !== method) {
        continue;
      }
      if (!matchesRoute(route.matcher, url, method)) {
        continue;
      }
      const resolved =
        typeof route.response === "function"
          ? await route.response(url, method, init)
          : route.response;
      return resolved instanceof Response ? resolved : jsonResponse(resolved);
    }

    throw new Error(`Unexpected request: ${method} ${url}`);
  });
}
