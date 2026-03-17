import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SkyFiClient } from "../src/clients/skyfi.js";
import {
  handleQuoteArchiveOrder,
  handleExecuteArchiveOrder,
  handleQuoteTaskingOrder,
  handleExecuteTaskingOrder,
  executeArchiveOrderSchema,
} from "../src/tools/ordering.js";

const SMALL_AOI: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [4.47, 51.92],
      [4.48, 51.92],
      [4.48, 51.93],
      [4.47, 51.93],
      [4.47, 51.92],
    ],
  ],
};

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

describe("quote_archive_order", () => {
  it("returns a quote computed client-side from search result prices", async () => {
    const client = new SkyFiClient(mockConfig);
    const result = await handleQuoteArchiveOrder(
      {
        archive_id: "arch_abc123",
        aoi: SMALL_AOI,
        price_per_sqkm_usd: 10.0,
        price_full_scene_usd: 500.0,
        overlap_sqkm: 4.5,
      },
      client,
    );
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.data.archive_id).toBe("arch_abc123");
      expect(result.data.estimated_price_usd).toBeCloseTo(45.0);
      expect(result.data.overlap_sqkm).toBe(4.5);
      expect(result.warnings).toHaveLength(0);
    }
  });

  it("includes pricing warning when above threshold", async () => {
    const client = new SkyFiClient(mockConfig);
    const result = await handleQuoteArchiveOrder(
      {
        archive_id: "arch_expensive",
        aoi: SMALL_AOI,
        price_per_sqkm_usd: 100.0,
        price_full_scene_usd: 1000.0,
        overlap_sqkm: 8.4,
      },
      client,
      { warnThresholdUsd: 500, hardLimitUsd: 2000 },
    );
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe("PRICE_THRESHOLD_EXCEEDED");
    }
  });

  it("rejects when above hard price limit", async () => {
    const client = new SkyFiClient(mockConfig);
    const result = await handleQuoteArchiveOrder(
      {
        archive_id: "arch_too_expensive",
        aoi: SMALL_AOI,
        price_per_sqkm_usd: 200.0,
        price_full_scene_usd: 2000.0,
        overlap_sqkm: 7.5,
      },
      client,
      { warnThresholdUsd: 500, hardLimitUsd: 1000 },
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.code).toBe("PRICE_HARD_LIMIT_EXCEEDED");
    }
  });
});

describe("execute_archive_order", () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("succeeds with valid archive_id, aoi, and user_confirmed", async () => {
    globalThis.fetch = mockFetch(200, {
      orderId: "ord_123",
      status: "PENDING",
      totalPrice: 45.0,
    });
    const client = new SkyFiClient(mockConfig);
    const result = await handleExecuteArchiveOrder(
      {
        archive_id: "arch_abc123",
        aoi: SMALL_AOI,
        user_confirmed: true,
      },
      client,
    );
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.data.orderId).toBe("ord_123");
    }
  });

  it("posts to /order-archive with WKT aoi and archiveId", async () => {
    const spy = mockFetch(200, { orderId: "ord_456" });
    globalThis.fetch = spy;
    const client = new SkyFiClient(mockConfig);
    await handleExecuteArchiveOrder(
      { archive_id: "arch_xyz", aoi: SMALL_AOI, user_confirmed: true },
      client,
    );
    const [url, options] = spy.mock.calls[0];
    expect(url).toContain("/order-archive");
    const body = JSON.parse(options.body);
    expect(body.archiveId).toBe("arch_xyz");
    expect(body.aoi).toContain("POLYGON");
  });
});

describe("confirmation flow enforcement", () => {
  it("execute_archive_order Zod schema rejects user_confirmed: false", async () => {
    const result = executeArchiveOrderSchema.safeParse({
      archive_id: "arch_123",
      aoi: SMALL_AOI,
      user_confirmed: false,
    });
    expect(result.success).toBe(false);
  });

  it("execute_archive_order Zod schema rejects missing user_confirmed", async () => {
    const result = executeArchiveOrderSchema.safeParse({
      archive_id: "arch_123",
      aoi: SMALL_AOI,
    });
    expect(result.success).toBe(false);
  });

  it("Zod schema enforces user_confirmed must be literal true", async () => {
    const { executeArchiveOrderSchema } = await import("../src/tools/ordering.js");
    const badResult = executeArchiveOrderSchema.safeParse({
      archive_id: "arch_123",
      aoi: SMALL_AOI,
      user_confirmed: false,
    });
    expect(badResult.success).toBe(false);
  });
});

describe("quote_tasking_order", () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("returns a tasking price quote from /pricing", async () => {
    globalThis.fetch = mockFetch(200, {
      price: 2500,
      priceUnit: "USD",
      area: 50.0,
    });
    const client = new SkyFiClient(mockConfig);
    const result = await handleQuoteTaskingOrder(
      {
        aoi: SMALL_AOI,
        product_type: "DAY",
        resolution: "HIGH",
        window_start: "2026-04-01T00:00:00+00:00",
        window_end: "2026-04-30T23:59:59+00:00",
      },
      client,
    );
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.data.price).toBe(2500);
      expect(result.data.note).toContain("execute_tasking_order");
    }
  });
});

describe("execute_tasking_order", () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("succeeds with all required fields", async () => {
    globalThis.fetch = mockFetch(200, {
      orderId: "ord_task_789",
      status: "PENDING",
    });
    const client = new SkyFiClient(mockConfig);
    const result = await handleExecuteTaskingOrder(
      {
        aoi: SMALL_AOI,
        product_type: "DAY",
        resolution: "HIGH",
        window_start: "2026-04-01T00:00:00+00:00",
        window_end: "2026-04-30T23:59:59+00:00",
        user_confirmed: true,
      },
      client,
    );
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.data.orderId).toBe("ord_task_789");
    }
  });

  it("posts to /order-tasking with correct fields", async () => {
    const spy = mockFetch(200, { orderId: "ord_t_1" });
    globalThis.fetch = spy;
    const client = new SkyFiClient(mockConfig);
    await handleExecuteTaskingOrder(
      {
        aoi: SMALL_AOI,
        product_type: "SAR",
        resolution: "MEDIUM",
        window_start: "2026-05-01T00:00:00+00:00",
        window_end: "2026-05-31T23:59:59+00:00",
        user_confirmed: true,
        max_cloud_cover_pct: 20,
        label: "test-order",
      },
      client,
    );
    const [url, options] = spy.mock.calls[0];
    expect(url).toContain("/order-tasking");
    const body = JSON.parse(options.body);
    expect(body.productType).toBe("SAR");
    expect(body.resolution).toBe("MEDIUM");
    expect(body.maxCloudCoveragePercent).toBe(20);
    expect(body.label).toBe("test-order");
    expect(body.aoi).toContain("POLYGON");
  });
});
