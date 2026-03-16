import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SkyFiClient } from "../src/clients/skyfi.js";
import { streamSearchArchive, streamFeasibilityCheck, pollOrderStatus } from "../src/tools/streaming.js";

const SMALL_AOI: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [[[4.47, 51.92], [4.48, 51.92], [4.48, 51.93], [4.47, 51.93], [4.47, 51.92]]],
};

const mockConfig = {
  api_key: "sk_test",
  api_base_url: "https://api.skyfi.test",
  api_version: "2026-03",
  simulate: false,
};

let originalFetch: typeof globalThis.fetch;
beforeEach(() => { originalFetch = globalThis.fetch; });
afterEach(() => { globalThis.fetch = originalFetch; });

function mockFetchSequence(responses: { status: number; body: unknown }[]) {
  let idx = 0;
  return vi.fn().mockImplementation(() => {
    const r = responses[Math.min(idx++, responses.length - 1)];
    return Promise.resolve({
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: new Headers(),
      json: () => Promise.resolve(r.body),
      text: () => Promise.resolve(JSON.stringify(r.body)),
    });
  });
}

describe("streamSearchArchive", () => {
  it("fetches multiple pages and aggregates results", async () => {
    globalThis.fetch = mockFetchSequence([
      { status: 200, body: { results: [{ scene_id: "s_1" }], total: 3, page: 1, has_more: true } },
      { status: 200, body: { results: [{ scene_id: "s_2" }], total: 3, page: 2, has_more: true } },
      { status: 200, body: { results: [{ scene_id: "s_3" }], total: 3, page: 3, has_more: false } },
    ]);

    const client = new SkyFiClient(mockConfig);
    const progressCalls: string[] = [];
    const { response, pages } = await streamSearchArchive(
      { aoi: SMALL_AOI, max_pages: 5 },
      client,
      (_p, _t, msg) => progressCalls.push(msg),
    );

    expect(response.status).toBe("success");
    if (response.status === "success") {
      expect((response.data.results as unknown[]).length).toBe(3);
      expect(response.data.pages_fetched).toBe(3);
    }
    expect(pages).toBe(3);
    expect(progressCalls.length).toBeGreaterThanOrEqual(3);
  });

  it("stops at max_pages even if more data available", async () => {
    globalThis.fetch = mockFetchSequence([
      { status: 200, body: { results: [{ scene_id: "s_1" }], total: 100, page: 1, has_more: true } },
      { status: 200, body: { results: [{ scene_id: "s_2" }], total: 100, page: 2, has_more: true } },
      { status: 200, body: { results: [{ scene_id: "s_3" }], total: 100, page: 3, has_more: true } },
    ]);

    const client = new SkyFiClient(mockConfig);
    const { response, pages } = await streamSearchArchive(
      { aoi: SMALL_AOI, max_pages: 2 },
      client,
    );

    expect(response.status).toBe("success");
    if (response.status === "success") {
      expect((response.data.results as unknown[]).length).toBe(2);
    }
    expect(pages).toBeLessThanOrEqual(2);
  });

  it("rejects oversized AOI", async () => {
    const hugeAoi: GeoJSON.Polygon = {
      type: "Polygon",
      coordinates: [[[-5, 42], [10, 42], [10, 55], [-5, 55], [-5, 42]]],
    };
    const client = new SkyFiClient(mockConfig);
    const { response } = await streamSearchArchive({ aoi: hugeAoi }, client);
    expect(response.status).toBe("error");
  });
});

describe("streamFeasibilityCheck", () => {
  it("calls passes and cloud-forecast APIs with progress", async () => {
    globalThis.fetch = mockFetchSequence([
      { status: 200, body: { passes: [{ satellite: "SAT-1", date: "2026-03-20" }] } },
      { status: 200, body: { forecast: { avg_cloud_pct: 15 } } },
    ]);

    const client = new SkyFiClient(mockConfig);
    const progressMsgs: string[] = [];
    const result = await streamFeasibilityCheck(
      { aoi: SMALL_AOI, sensor_type: "optical" },
      client,
      (_p, _t, msg) => progressMsgs.push(msg),
    );

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.data.feasible).toBe(true);
      expect(result.data.summary).toContain("Feasible");
    }
    expect(progressMsgs).toContain("Calculating satellite pass schedule...");
    expect(progressMsgs).toContain("Fetching cloud cover forecast...");
    expect(progressMsgs).toContain("Generating feasibility summary...");
  });

  it("reports not feasible when no passes", async () => {
    globalThis.fetch = mockFetchSequence([
      { status: 200, body: { passes: [] } },
      { status: 200, body: { forecast: { avg_cloud_pct: 80 } } },
    ]);

    const client = new SkyFiClient(mockConfig);
    const result = await streamFeasibilityCheck(
      { aoi: SMALL_AOI, sensor_type: "sar" },
      client,
    );

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.data.feasible).toBe(false);
    }
  });
});

describe("pollOrderStatus", () => {
  it("polls until terminal status", async () => {
    globalThis.fetch = mockFetchSequence([
      { status: 200, body: { order_id: "ord_1", status: "pending", progress_pct: 0, updated_at: "", estimated_delivery: "" } },
      { status: 200, body: { order_id: "ord_1", status: "processing", progress_pct: 50, updated_at: "", estimated_delivery: "" } },
      { status: 200, body: { order_id: "ord_1", status: "delivered", progress_pct: 100, updated_at: "", estimated_delivery: "" } },
    ]);

    const client = new SkyFiClient(mockConfig);
    const result = await pollOrderStatus(
      { order_id: "ord_1", max_polls: 5, interval_ms: 10 },
      client,
    );

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.data.status).toBe("delivered");
      expect(result.data.polls).toBe(3);
    }
  });

  it("returns last status when max polls reached", async () => {
    globalThis.fetch = mockFetchSequence([
      { status: 200, body: { order_id: "ord_1", status: "processing", progress_pct: 30, updated_at: "", estimated_delivery: "" } },
      { status: 200, body: { order_id: "ord_1", status: "processing", progress_pct: 45, updated_at: "", estimated_delivery: "" } },
    ]);

    const client = new SkyFiClient(mockConfig);
    const result = await pollOrderStatus(
      { order_id: "ord_1", max_polls: 2, interval_ms: 10 },
      client,
    );

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.data.status).toBe("processing");
      expect(result.data.message).toContain("Max polls reached");
    }
  });

  it("emits progress callbacks", async () => {
    globalThis.fetch = mockFetchSequence([
      { status: 200, body: { order_id: "ord_1", status: "delivered", progress_pct: 100, updated_at: "", estimated_delivery: "" } },
    ]);

    const client = new SkyFiClient(mockConfig);
    const msgs: string[] = [];
    await pollOrderStatus(
      { order_id: "ord_1", max_polls: 3, interval_ms: 10 },
      client,
      (_p, _t, msg) => msgs.push(msg),
    );

    expect(msgs.some((m) => m.includes("Polling"))).toBe(true);
  });
});
