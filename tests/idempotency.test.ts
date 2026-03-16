import { describe, it, expect, vi } from "vitest";
import { IdempotencyStore } from "../src/idempotency/index.js";
import { success } from "../src/envelope/index.js";
import type { ToolResponse } from "../src/types/response.js";

function makeResponse(orderId: string): ToolResponse {
  return success({
    tool: "execute_archive_order",
    data: { order_id: orderId, status: "pending" },
    startTime: Date.now(),
  });
}

describe("IdempotencyStore", () => {
  it("returns null for unknown key", () => {
    const store = new IdempotencyStore();
    const result = store.check("key-1", "hash-a");
    expect(result).toBeNull();
  });

  it("stores and retrieves response by key", () => {
    const store = new IdempotencyStore();
    const response = makeResponse("ord_123");
    store.store("key-1", "hash-a", response);

    const result = store.check("key-1", "hash-a");
    expect(result).not.toBeNull();
    expect(result!.status).toBe("success");
    if (result!.status === "success") {
      expect(result!.data.order_id).toBe("ord_123");
    }
  });

  it("returns same response on duplicate key (idempotent)", () => {
    const store = new IdempotencyStore();
    const response = makeResponse("ord_456");
    store.store("key-dup", "hash-a", response);

    const first = store.check("key-dup", "hash-a");
    const second = store.check("key-dup", "hash-a");
    expect(first).toEqual(second);
  });

  it("returns null after TTL expiry", () => {
    const store = new IdempotencyStore(1000); // 1 second TTL
    const response = makeResponse("ord_expired");
    store.store("key-exp", "hash-a", response);

    vi.useFakeTimers();
    vi.advanceTimersByTime(2000); // 2 seconds > 1s TTL

    const result = store.check("key-exp", "hash-a");
    expect(result).toBeNull();

    vi.useRealTimers();
  });

  it("allows re-execution after TTL expiry", () => {
    const store = new IdempotencyStore(1000);
    const response1 = makeResponse("ord_first");
    store.store("key-reuse", "hash-a", response1);

    vi.useFakeTimers();
    vi.advanceTimersByTime(2000);

    // Key expired, should return null (allowing re-execution)
    expect(store.check("key-reuse", "hash-a")).toBeNull();

    // Re-store with different response
    const response2 = makeResponse("ord_second");
    store.store("key-reuse", "hash-a", response2);

    const result = store.check("key-reuse", "hash-a");
    expect(result).not.toBeNull();
    if (result?.status === "success") {
      expect(result.data.order_id).toBe("ord_second");
    }

    vi.useRealTimers();
  });

  describe("tenant isolation", () => {
    it("same key, different tenants: no collision", () => {
      const store = new IdempotencyStore();
      const responseA = makeResponse("ord_tenant_a");
      const responseB = makeResponse("ord_tenant_b");

      store.store("same-key", "tenant-a-hash", responseA);
      store.store("same-key", "tenant-b-hash", responseB);

      const resultA = store.check("same-key", "tenant-a-hash");
      const resultB = store.check("same-key", "tenant-b-hash");

      expect(resultA).not.toBeNull();
      expect(resultB).not.toBeNull();

      if (resultA?.status === "success" && resultB?.status === "success") {
        expect(resultA.data.order_id).toBe("ord_tenant_a");
        expect(resultB.data.order_id).toBe("ord_tenant_b");
      }
    });

    it("tenant A cannot see tenant B responses", () => {
      const store = new IdempotencyStore();
      const response = makeResponse("ord_private");

      store.store("private-key", "tenant-b-hash", response);

      // Tenant A tries to use the same key
      const result = store.check("private-key", "tenant-a-hash");
      expect(result).toBeNull();
    });

    it("different keys, same tenant: independent", () => {
      const store = new IdempotencyStore();
      const response1 = makeResponse("ord_1");
      const response2 = makeResponse("ord_2");

      store.store("key-1", "same-tenant", response1);
      store.store("key-2", "same-tenant", response2);

      const result1 = store.check("key-1", "same-tenant");
      const result2 = store.check("key-2", "same-tenant");

      if (result1?.status === "success" && result2?.status === "success") {
        expect(result1.data.order_id).toBe("ord_1");
        expect(result2.data.order_id).toBe("ord_2");
      }
    });
  });
});
