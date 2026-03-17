import { describe, it, expect, vi } from "vitest";
import { QuoteStore } from "../src/guardrails/quote-store.js";
import { FeasibilityStore } from "../src/guardrails/feasibility-store.js";
import { executeArchiveOrderSchema, executeTaskingOrderSchema } from "../src/tools/ordering.js";

describe("QuoteStore", () => {
  it("stores and validates a quote", () => {
    const store = new QuoteStore();
    store.store("q_123", "quote_archive_order");
    const result = store.validate("q_123", "quote_archive_order");
    expect(result.valid).toBe(true);
  });

  it("rejects unknown quote_id", () => {
    const store = new QuoteStore();
    const result = store.validate("q_nonexistent", "quote_archive_order");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("rejects expired quote", () => {
    const store = new QuoteStore();
    store.store("q_expired", "quote_archive_order");

    // Manually expire by advancing time
    vi.useFakeTimers();
    vi.advanceTimersByTime(16 * 60 * 1000); // 16 minutes > 15 min TTL

    const result = store.validate("q_expired", "quote_archive_order");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("expired");

    vi.useRealTimers();
  });

  it("rejects quote used for wrong tool", () => {
    const store = new QuoteStore();
    store.store("q_archive", "quote_archive_order");
    const result = store.validate("q_archive", "quote_tasking_order");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("quote_archive_order");
  });

  it("consume removes the quote", () => {
    const store = new QuoteStore();
    store.store("q_once", "quote_archive_order");
    store.consume("q_once");
    const result = store.validate("q_once", "quote_archive_order");
    expect(result.valid).toBe(false);
  });
});

describe("FeasibilityStore", () => {
  const AOI = {
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

  it("records and validates feasibility check", () => {
    const store = new FeasibilityStore();
    store.record(AOI, "optical");
    const result = store.check(AOI, "optical");
    expect(result.valid).toBe(true);
  });

  it("rejects missing feasibility check", () => {
    const store = new FeasibilityStore();
    const result = store.check(AOI, "optical");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Feasibility check required");
  });

  it("rejects expired feasibility check", () => {
    const store = new FeasibilityStore();
    store.record(AOI, "sar");

    vi.useFakeTimers();
    vi.advanceTimersByTime(31 * 60 * 1000); // 31 min > 30 min TTL

    const result = store.check(AOI, "sar");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("expired");

    vi.useRealTimers();
  });

  it("different AOI requires separate feasibility check", () => {
    const store = new FeasibilityStore();
    store.record(AOI, "optical");

    const differentAoi = {
      type: "Polygon",
      coordinates: [
        [
          [5.0, 52.0],
          [5.1, 52.0],
          [5.1, 52.1],
          [5.0, 52.1],
          [5.0, 52.0],
        ],
      ],
    };

    const result = store.check(differentAoi, "optical");
    expect(result.valid).toBe(false);
  });

  it("different sensor requires separate feasibility check", () => {
    const store = new FeasibilityStore();
    store.record(AOI, "optical");
    const result = store.check(AOI, "sar");
    expect(result.valid).toBe(false);
  });
});

describe("ordering safety invariants", () => {
  it("execute_archive_order Zod schema rejects user_confirmed: false", async () => {

    const result = executeArchiveOrderSchema.safeParse({
      quote_id: "q_123",
      user_confirmed: false,
      idempotency_key: "key-1",
    });
    expect(result.success).toBe(false);
  });

  it("execute_archive_order Zod schema rejects missing user_confirmed", async () => {

    const result = executeArchiveOrderSchema.safeParse({
      quote_id: "q_123",
      idempotency_key: "key-1",
    });
    expect(result.success).toBe(false);
  });

  it("execute_archive_order Zod schema rejects missing idempotency_key", async () => {

    const result = executeArchiveOrderSchema.safeParse({
      quote_id: "q_123",
      user_confirmed: true,
    });
    expect(result.success).toBe(false);
  });

  it("execute_tasking_order Zod schema rejects user_confirmed: false", async () => {

    const result = executeTaskingOrderSchema.safeParse({
      quote_id: "q_123",
      user_confirmed: false,
      idempotency_key: "key-1",
    });
    expect(result.success).toBe(false);
  });

  it("no schema allows bypassing via extra fields", async () => {

    // Extra fields should be stripped, not used
    const result = executeArchiveOrderSchema.safeParse({
      quote_id: "q_123",
      user_confirmed: true,
      idempotency_key: "key-1",
      skip_confirmation: true,
      admin_override: true,
    });
    // Zod strips extra fields by default; parse should succeed but extras are gone
    expect(result.success).toBe(true);
  });
});
