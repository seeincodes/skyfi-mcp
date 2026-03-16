import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SkyFiClient, SkyFiApiError } from "../src/clients/index.js";

const mockConfig = {
  api_key: "sk_test_123",
  api_base_url: "https://api.skyfi.test",
  api_version: "2026-03",
  simulate: false,
};

function mockFetch(status: number, body: unknown, headers?: Record<string, string>) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers ?? {}),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

describe("SkyFiClient", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends correct headers including API version", async () => {
    const fetchSpy = mockFetch(200, { results: [] });
    globalThis.fetch = fetchSpy;

    const client = new SkyFiClient(mockConfig);
    await client.request({ path: "/v1/search" });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.skyfi.test/v1/search");
    expect(options.headers["X-API-Key"]).toBe("sk_test_123");
    expect(options.headers["X-API-Version"]).toBe("2026-03");
  });

  it("exposes the pinned API version", () => {
    const client = new SkyFiClient(mockConfig);
    expect(client.version).toBe("2026-03");
  });

  it("appends query params", async () => {
    const fetchSpy = mockFetch(200, {});
    globalThis.fetch = fetchSpy;

    const client = new SkyFiClient(mockConfig);
    await client.request({ path: "/v1/search", params: { page: "2", limit: "10" } });

    const url = fetchSpy.mock.calls[0][0];
    expect(url).toContain("page=2");
    expect(url).toContain("limit=10");
  });

  it("sends POST with JSON body", async () => {
    const fetchSpy = mockFetch(200, { order_id: "ord_123" });
    globalThis.fetch = fetchSpy;

    const client = new SkyFiClient(mockConfig);
    await client.request({ method: "POST", path: "/v1/orders", body: { scene_id: "s_1" } });

    const [, options] = fetchSpy.mock.calls[0];
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({ scene_id: "s_1" });
  });

  it("returns parsed response data", async () => {
    globalThis.fetch = mockFetch(200, { results: [{ id: "scene_1" }] });

    const client = new SkyFiClient(mockConfig);
    const response = await client.request<{ results: { id: string }[] }>({ path: "/v1/search" });

    expect(response.statusCode).toBe(200);
    expect(response.data.results[0].id).toBe("scene_1");
  });

  it("throws SkyFiApiError with 401 on invalid key", async () => {
    globalThis.fetch = mockFetch(401, { error: "unauthorized" });

    const client = new SkyFiClient(mockConfig);
    await expect(client.request({ path: "/v1/search" })).rejects.toThrow(SkyFiApiError);
    await expect(client.request({ path: "/v1/search" })).rejects.toThrow("invalid or revoked");
  });

  it("throws SkyFiApiError with 429 on rate limit", async () => {
    globalThis.fetch = mockFetch(429, {}, { "Retry-After": "30" });

    const client = new SkyFiClient(mockConfig);
    try {
      await client.request({ path: "/v1/search" });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(SkyFiApiError);
      expect((err as SkyFiApiError).statusCode).toBe(429);
      expect((err as SkyFiApiError).message).toContain("Retry after 30s");
    }
  });

  it("throws SkyFiApiError with 5xx on server error", async () => {
    globalThis.fetch = mockFetch(503, { error: "service unavailable" });

    const client = new SkyFiClient(mockConfig);
    try {
      await client.request({ path: "/v1/search" });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(SkyFiApiError);
      expect((err as SkyFiApiError).statusCode).toBe(503);
      expect((err as SkyFiApiError).message).toContain("temporarily unavailable");
    }
  });

  it("throws SkyFiApiError with body for other 4xx errors", async () => {
    globalThis.fetch = mockFetch(422, { detail: "Invalid AOI" });

    const client = new SkyFiClient(mockConfig);
    try {
      await client.request({ path: "/v1/orders" });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(SkyFiApiError);
      expect((err as SkyFiApiError).statusCode).toBe(422);
      expect((err as SkyFiApiError).responseBody).toEqual({ detail: "Invalid AOI" });
    }
  });
});
