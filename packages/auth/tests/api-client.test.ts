import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "../src/api-client";

const { createCalls, directCalls } = vi.hoisted(() => ({
  createCalls: [] as Record<string, unknown>[],
  directCalls: [] as { path: string; options: Record<string, unknown> }[],
}));

vi.mock("ofetch", () => ({
  ofetch: Object.assign(
    (path: string, options: Record<string, unknown>) => {
      directCalls.push({ path, options });
      return Promise.resolve(new Blob(["pdf-bytes"]));
    },
    {
      create: (options: Record<string, unknown>) => {
        createCalls.push(options);
        return vi.fn();
      },
    },
  ),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ toString: () => "session=abc" }),
}));

type Handler = (context: unknown) => Promise<void>;

function setBrowserEnvironment(present: boolean): void {
  if (present) {
    Object.defineProperty(globalThis, "window", {
      value: {},
      configurable: true,
      writable: true,
    });
    return;
  }
  delete (globalThis as { window?: unknown }).window;
}

function errorHandlerOf(options: Record<string, unknown>): Handler {
  return options.onResponseError as Handler;
}

function requestHandlerOf(
  options: Record<string, unknown>,
): (context: unknown) => Promise<void> {
  return options.onRequest as (context: unknown) => Promise<void>;
}

describe("createApiClient", () => {
  beforeEach(() => {
    createCalls.length = 0;
    directCalls.length = 0;
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.fit-stack.test");
    setBrowserEnvironment(false);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    setBrowserEnvironment(false);
  });

  it("builds the base URL from the shared resolver and the default path", () => {
    createApiClient();

    expect(createCalls[0]?.baseURL).toBe("https://api.fit-stack.test/api");
    expect(createCalls[0]?.retry).toBe(1);
    expect(createCalls[0]?.timeout).toBe(30_000);
  });

  it("accepts a custom base path", () => {
    createApiClient({ basePath: "/v2" });

    expect(createCalls[0]?.baseURL).toBe("https://api.fit-stack.test/v2");
  });

  it("fails visibly when the API base URL is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");

    expect(() => createApiClient()).toThrow(/NEXT_PUBLIC_API_BASE_URL/);
  });

  it("forwards the request cookies on the server", async () => {
    createApiClient();
    const headers = new Headers();

    await requestHandlerOf(createCalls[0] ?? {})({ options: { headers } });

    expect(headers.get("cookie")).toBe("session=abc");
  });

  it("sends credentials from the browser", async () => {
    setBrowserEnvironment(true);
    createApiClient();
    const options: Record<string, unknown> = { headers: new Headers() };

    await requestHandlerOf(createCalls[0] ?? {})({ options });

    expect(options.credentials).toBe("include");
  });

  it("formats Zod errors and announces a lost organization in the browser", async () => {
    setBrowserEnvironment(true);
    const onOrganizationNotFound = vi.fn();
    createApiClient({ onOrganizationNotFound });

    const body: Record<string, unknown> = {
      error: { issues: [{ message: "Required", path: ["email"] }] },
    };
    await errorHandlerOf(createCalls[0] ?? {})({ response: { _data: body } });

    expect(onOrganizationNotFound).not.toHaveBeenCalled();
    expect(String(body.error)).toContain("Correo electrónico");
  });

  it("announces a lost organization when the API reports it", async () => {
    setBrowserEnvironment(true);
    const onOrganizationNotFound = vi.fn();
    createApiClient({ onOrganizationNotFound });

    await errorHandlerOf(createCalls[0] ?? {})({
      response: { _data: { code: "ORGANIZATION_NOT_FOUND" } },
    });

    expect(onOrganizationNotFound).toHaveBeenCalledOnce();
  });

  it("does not navigate on the server (no window)", async () => {
    const onOrganizationNotFound = vi.fn();
    createApiClient({ onOrganizationNotFound });

    await errorHandlerOf(createCalls[0] ?? {})({
      response: { _data: { code: "ORGANIZATION_NOT_FOUND" } },
    });

    expect(onOrganizationNotFound).not.toHaveBeenCalled();
  });

  it("apiBlob requests a blob and shares the error interceptor", async () => {
    setBrowserEnvironment(true);
    const onOrganizationNotFound = vi.fn();
    const { apiBlob } = createApiClient({ onOrganizationNotFound });

    const result = await apiBlob("/receipts/2026/1.pdf", {
      next: { revalidate: 60 },
    });

    expect(result).toBeInstanceOf(Blob);
    expect(directCalls[0]?.path).toBe("/receipts/2026/1.pdf");
    expect(directCalls[0]?.options.baseURL).toBe(
      "https://api.fit-stack.test/api",
    );
    expect(directCalls[0]?.options.responseType).toBe("blob");

    const handler = errorHandlerOf(directCalls[0]?.options ?? {});
    expect(typeof handler).toBe("function");

    await handler({
      response: {
        _data: new Blob([JSON.stringify({ code: "ORGANIZATION_NOT_FOUND" })]),
      },
    });

    expect(onOrganizationNotFound).toHaveBeenCalledOnce();
  });

  it("ignores a non-JSON blob error body", async () => {
    setBrowserEnvironment(true);
    const onOrganizationNotFound = vi.fn();
    createApiClient({ onOrganizationNotFound });

    await errorHandlerOf(createCalls[0] ?? {})({
      response: { _data: new Blob(["<html>proxy error</html>"]) },
    });

    expect(onOrganizationNotFound).not.toHaveBeenCalled();
  });
});
