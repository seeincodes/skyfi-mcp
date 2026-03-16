import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SkyFiClient } from "../src/clients/skyfi.js";
import {
  handleGetOrderStatus,
  handleListOrders,
  handleFetchOrderImage,
} from "../src/tools/history.js";

const mockConfig = {
  api_key: "sk_test",
  api_base_url: "https://api.skyfi.test",
  api_version: "2026-03",
  simulate: false,
};

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

describe("get_order_status", () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("returns order status", async () => {
    globalThis.fetch = mockFetch(200, {
      order_id: "ord_123",
      status: "processing",
      progress_pct: 45,
      created_at: "2026-03-16T10:00:00Z",
      updated_at: "2026-03-16T11:00:00Z",
      estimated_delivery: "2026-03-16T14:00:00Z",
    });
    const client = new SkyFiClient(mockConfig);
    const result = await handleGetOrderStatus({ order_id: "ord_123" }, client);
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.tool).toBe("get_order_status");
      expect(result.data.status).toBe("processing");
      expect(result.data.progress_pct).toBe(45);
    }
  });

  it("handles API error gracefully", async () => {
    globalThis.fetch = mockFetch(404, { error: "not found" });
    const client = new SkyFiClient(mockConfig);
    const result = await handleGetOrderStatus({ order_id: "ord_nonexistent" }, client);
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.code).toBe("SKYFI_API_ERROR");
    }
  });
});

describe("list_orders", () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("returns order list", async () => {
    globalThis.fetch = mockFetch(200, {
      orders: [
        { order_id: "ord_1", status: "delivered" },
        { order_id: "ord_2", status: "pending" },
      ],
      total: 2,
      page: 1,
    });
    const client = new SkyFiClient(mockConfig);
    const result = await handleListOrders({}, client);
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.tool).toBe("list_orders");
      expect((result.data.orders as unknown[]).length).toBe(2);
    }
  });

  it("passes filter params correctly", async () => {
    const spy = mockFetch(200, { orders: [], total: 0, page: 1 });
    globalThis.fetch = spy;
    const client = new SkyFiClient(mockConfig);
    await handleListOrders(
      { status: "delivered", date_range: { start: "2026-01-01", end: "2026-03-01" } },
      client,
    );
    const url = spy.mock.calls[0][0] as string;
    expect(url).toContain("status=delivered");
    expect(url).toContain("start_date=2026-01-01");
    expect(url).toContain("end_date=2026-03-01");
  });
});

describe("fetch_order_image", () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("returns download URL", async () => {
    globalThis.fetch = mockFetch(200, {
      order_id: "ord_123",
      download_url: "https://cdn.skyfi.com/images/ord_123.tiff",
      file_size_bytes: 52428800,
      format: "GeoTIFF",
      expires_at: "2026-03-17T10:00:00Z",
    });
    const client = new SkyFiClient(mockConfig);
    const result = await handleFetchOrderImage({ order_id: "ord_123" }, client);
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.tool).toBe("fetch_order_image");
      expect(result.data.download_url).toContain("cdn.skyfi.com");
      expect(result.data.format).toBe("GeoTIFF");
    }
  });

  it("handles 5xx error", async () => {
    globalThis.fetch = mockFetch(500, {});
    const client = new SkyFiClient(mockConfig);
    const result = await handleFetchOrderImage({ order_id: "ord_123" }, client);
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.code).toBe("SKYFI_API_UNAVAILABLE");
    }
  });
});
