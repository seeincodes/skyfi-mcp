import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SkyFiClient } from "../src/clients/skyfi.js";
import { WebhookQueue } from "../src/webhook/index.js";
import {
  handleSetupAoiMonitoring,
  handleCreateWebhookSubscription,
  handleGetNotificationStatus,
} from "../src/tools/monitoring.js";

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

describe("setup_aoi_monitoring", () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("returns success with monitor_id", async () => {
    globalThis.fetch = mockFetch(200, {
      monitor_id: "mon_123",
      status: "active",
      aoi_area_km2: 0.85,
      frequency: "on_availability",
    });
    const client = new SkyFiClient(mockConfig);
    const result = await handleSetupAoiMonitoring(
      { aoi: SMALL_AOI, frequency: "on_availability" },
      client,
    );
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.data.monitor_id).toBe("mon_123");
    }
  });

  it("rejects oversized AOI", async () => {
    const hugeAoi: GeoJSON.Polygon = {
      type: "Polygon",
      coordinates: [[[-5, 42], [10, 42], [10, 55], [-5, 55], [-5, 42]]],
    };
    const client = new SkyFiClient(mockConfig);
    const result = await handleSetupAoiMonitoring(
      { aoi: hugeAoi, frequency: "daily" },
      client,
    );
    expect(result.status).toBe("error");
  });
});

describe("create_webhook_subscription", () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("returns subscription_id", async () => {
    globalThis.fetch = mockFetch(200, {
      subscription_id: "sub_456",
      monitor_id: "mon_123",
      endpoint_url: "https://example.com/webhook",
      status: "active",
    });
    const client = new SkyFiClient(mockConfig);
    const result = await handleCreateWebhookSubscription(
      { monitor_id: "mon_123", endpoint_url: "https://example.com/webhook" },
      client,
    );
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.data.subscription_id).toBe("sub_456");
    }
  });
});

describe("get_notification_status", () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("returns notification history", async () => {
    globalThis.fetch = mockFetch(200, {
      notifications: [
        { event_id: "evt_1", status: "delivered", delivered_at: "2026-03-16T10:00:00Z" },
      ],
      total: 1,
    });
    const client = new SkyFiClient(mockConfig);
    const result = await handleGetNotificationStatus({ monitor_id: "mon_123" }, client);
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect((result.data.notifications as unknown[]).length).toBe(1);
    }
  });
});

describe("WebhookQueue", () => {
  it("enqueues and retrieves pending events", () => {
    const queue = new WebhookQueue();
    const id = queue.enqueue("mon_1", "new_imagery", { scene_id: "s_1" });
    expect(id).toMatch(/^evt_/);

    const pending = queue.getPending("mon_1");
    expect(pending).toHaveLength(1);
    expect(pending[0].status).toBe("pending");
  });

  it("marks events as delivered", () => {
    const queue = new WebhookQueue();
    const id = queue.enqueue("mon_1", "new_imagery", {});
    queue.markDelivered(id);

    const pending = queue.getPending("mon_1");
    expect(pending).toHaveLength(0);

    const event = queue.getById(id);
    expect(event?.status).toBe("delivered");
    expect(event?.deliveredAt).not.toBeNull();
  });

  it("tracks delivery attempts and marks failed after 3", () => {
    const queue = new WebhookQueue();
    const id = queue.enqueue("mon_1", "new_imagery", {});

    queue.markFailed(id);
    expect(queue.getById(id)?.status).toBe("pending"); // 1 attempt
    queue.markFailed(id);
    expect(queue.getById(id)?.status).toBe("pending"); // 2 attempts
    queue.markFailed(id);
    expect(queue.getById(id)?.status).toBe("failed"); // 3 attempts = failed
  });

  it("filters by monitor_id", () => {
    const queue = new WebhookQueue();
    queue.enqueue("mon_1", "new_imagery", {});
    queue.enqueue("mon_2", "new_imagery", {});
    queue.enqueue("mon_1", "status_change", {});

    expect(queue.getPending("mon_1")).toHaveLength(2);
    expect(queue.getPending("mon_2")).toHaveLength(1);
    expect(queue.getPending()).toHaveLength(3); // all
  });

  it("e2e: monitor setup -> event enqueued -> delivered -> visible in status", () => {
    const queue = new WebhookQueue();

    // Simulate: monitoring detects new imagery
    const eventId = queue.enqueue("mon_abc", "new_imagery", {
      scene_id: "s_new",
      capture_date: "2026-03-16",
      resolution_m: 0.5,
    });

    // Event is pending
    const pending = queue.getPending("mon_abc");
    expect(pending).toHaveLength(1);
    expect(pending[0].payload.scene_id).toBe("s_new");

    // Webhook delivered successfully
    queue.markDelivered(eventId);

    // No more pending
    expect(queue.getPending("mon_abc")).toHaveLength(0);

    // Visible in history
    const history = queue.getByMonitor("mon_abc");
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe("delivered");
  });
});
