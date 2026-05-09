import { vi } from "vitest";

export function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => payload,
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
