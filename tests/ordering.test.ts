import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SkyFiClient } from "../src/clients/skyfi.js";
import {
  handleQuoteArchiveOrder,
  handleExecuteArchiveOrder,
  handleQuoteTaskingOrder,
  handleExecuteTaskingOrder,
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
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("returns a quote with quote_id and price", async () => {
    globalThis.fetch = mockFetch(200, {
      quote_id: "q_abc123",
      expires_at: "2026-03-16T12:15:00Z",
      price_usd: 45.0,
      summary: "Archive order: 0.5m optical",
    });
    const client = new SkyFiClient(mockConfig);
    const result = await handleQuoteArchiveOrder(
      { scene_id: "s_1", aoi: SMALL_AOI },
      client,
    );
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.data.quote_id).toBe("q_abc123");
      expect(result.data.price_usd).toBe(45.0);
      expect(result.warnings).toHaveLength(0);
    }
  });

  it("includes pricing warning when above threshold", async () => {
    globalThis.fetch = mockFetch(200, {
      quote_id: "q_expensive",
      expires_at: "2026-03-16T12:15:00Z",
      price_usd: 840.0,
      summary: "Expensive order",
    });
    const client = new SkyFiClient(mockConfig);
    const result = await handleQuoteArchiveOrder(
      { scene_id: "s_1", aoi: SMALL_AOI },
      client,
    );
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe("PRICE_THRESHOLD_EXCEEDED");
    }
  });

  it("rejects when above hard price limit", async () => {
    globalThis.fetch = mockFetch(200, {
      quote_id: "q_too_expensive",
      expires_at: "2026-03-16T12:15:00Z",
      price_usd: 1500.0,
      summary: "Very expensive order",
    });
    const client = new SkyFiClient(mockConfig);
    const result = await handleQuoteArchiveOrder(
      { scene_id: "s_1", aoi: SMALL_AOI },
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

  it("succeeds with valid quote_id, user_confirmed, and idempotency_key", async () => {
    globalThis.fetch = mockFetch(200, {
      order_id: "ord_123",
      status: "pending",
      price_usd: 45.0,
      estimated_delivery: "2026-03-16T14:00:00Z",
    });
    const client = new SkyFiClient(mockConfig);
    const result = await handleExecuteArchiveOrder(
      {
        quote_id: "q_abc123",
        user_confirmed: true,
        idempotency_key: "550e8400-e29b-41d4-a716-446655440000",
      },
      client,
    );
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.data.order_id).toBe("ord_123");
      expect(result.data.idempotency_key).toBe("550e8400-e29b-41d4-a716-446655440000");
    }
  });

  it("includes idempotency_key in response", async () => {
    globalThis.fetch = mockFetch(200, {
      order_id: "ord_456",
      status: "pending",
      price_usd: 30.0,
      estimated_delivery: "2026-03-17T10:00:00Z",
    });
    const client = new SkyFiClient(mockConfig);
    const result = await handleExecuteArchiveOrder(
      { quote_id: "q_def", user_confirmed: true, idempotency_key: "key-123" },
      client,
    );
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.data.idempotency_key).toBe("key-123");
    }
  });
});

describe("confirmation flow enforcement", () => {
  it("execute_archive_order rejects without quote_id", async () => {
    const client = new SkyFiClient(mockConfig);
    // Zod would normally catch this, but testing the server-side check
    const result = await handleExecuteArchiveOrder(
      { quote_id: "", user_confirmed: true, idempotency_key: "k1" } as never,
      client,
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.code).toBe("CONFIRMATION_REQUIRED");
    }
  });

  it("execute_archive_order rejects without idempotency_key", async () => {
    const client = new SkyFiClient(mockConfig);
    const result = await handleExecuteArchiveOrder(
      { quote_id: "q_123", user_confirmed: true, idempotency_key: "" } as never,
      client,
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.code).toBe("IDEMPOTENCY_KEY_MISSING");
    }
  });

  it("execute_tasking_order rejects without quote_id", async () => {
    const client = new SkyFiClient(mockConfig);
    const result = await handleExecuteTaskingOrder(
      { quote_id: "", user_confirmed: true, idempotency_key: "k1" } as never,
      client,
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.code).toBe("CONFIRMATION_REQUIRED");
    }
  });

  it("execute_tasking_order rejects without idempotency_key", async () => {
    const client = new SkyFiClient(mockConfig);
    const result = await handleExecuteTaskingOrder(
      { quote_id: "q_123", user_confirmed: true, idempotency_key: "" } as never,
      client,
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.code).toBe("IDEMPOTENCY_KEY_MISSING");
    }
  });

  it("Zod schema enforces user_confirmed must be literal true", async () => {
    const { executeArchiveOrderSchema } = await import("../src/tools/ordering.js");
    const badResult = executeArchiveOrderSchema.safeParse({
      quote_id: "q_123",
      user_confirmed: false,
      idempotency_key: "k1",
    });
    expect(badResult.success).toBe(false);
  });
});

describe("quote_tasking_order", () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("returns a tasking quote", async () => {
    globalThis.fetch = mockFetch(200, {
      quote_id: "qt_xyz",
      expires_at: "2026-03-16T12:30:00Z",
      estimated_cost_usd: 2500,
      summary: "Tasking order: SAR, 50 km²",
    });
    const client = new SkyFiClient(mockConfig);
    const result = await handleQuoteTaskingOrder(
      { aoi: SMALL_AOI, sensor_type: "sar" },
      client,
    );
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.data.quote_id).toBe("qt_xyz");
    }
  });
});

describe("execute_tasking_order", () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("succeeds with all required fields", async () => {
    globalThis.fetch = mockFetch(200, {
      order_id: "ord_task_789",
      status: "pending",
      estimated_cost_usd: 2500,
      estimated_delivery: "2026-03-25T00:00:00Z",
    });
    const client = new SkyFiClient(mockConfig);
    const result = await handleExecuteTaskingOrder(
      { quote_id: "qt_xyz", user_confirmed: true, idempotency_key: "uuid-456" },
      client,
    );
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.data.order_id).toBe("ord_task_789");
      expect(result.data.idempotency_key).toBe("uuid-456");
    }
  });
});
