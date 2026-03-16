import { describe, it, expect } from "vitest";
import { success, error, makeError, makeErrorWithRetry, ERROR_REGISTRY } from "../src/envelope/index.js";
import { SuccessResponseSchema, ErrorResponseSchema, ToolResponseSchema } from "../src/types/response.js";

describe("envelope wrapper", () => {
  describe("success()", () => {
    it("returns a valid success envelope", () => {
      const result = success({
        tool: "search_archive",
        data: { results: [], total: 0 },
        startTime: Date.now() - 100,
      });

      expect(result.status).toBe("success");
      expect(result.tool).toBe("search_archive");
      expect(result.simulated).toBe(false);
      expect(result.warnings).toEqual([]);
      expect(result.meta.request_id).toMatch(/^req_/);
      expect(result.meta.duration_ms).toBeGreaterThanOrEqual(0);

      const parsed = SuccessResponseSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it("includes simulated flag when set", () => {
      const result = success({
        tool: "quote_archive_order",
        data: { quote_id: "sim_q_123" },
        simulated: true,
        startTime: Date.now(),
      });

      expect(result.simulated).toBe(true);
    });

    it("includes warnings when provided", () => {
      const result = success({
        tool: "quote_archive_order",
        data: { price_usd: 840 },
        warnings: [{ code: "PRICE_THRESHOLD_EXCEEDED", message: "Exceeds $500 threshold." }],
        startTime: Date.now(),
      });

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe("PRICE_THRESHOLD_EXCEEDED");
    });

    it("includes skyfi_api_version in meta when provided", () => {
      const result = success({
        tool: "search_archive",
        data: {},
        startTime: Date.now(),
        skyfiApiVersion: "2026-03",
      });

      expect(result.meta.skyfi_api_version).toBe("2026-03");
    });
  });

  describe("error()", () => {
    it("returns a valid error envelope", () => {
      const result = error({
        tool: "execute_archive_order",
        error: makeError("QUOTE_EXPIRED"),
        startTime: Date.now() - 50,
      });

      expect(result.status).toBe("error");
      expect(result.tool).toBe("execute_archive_order");
      expect(result.error.code).toBe("QUOTE_EXPIRED");
      expect(result.error.recoverable).toBe(true);
      expect(result.error.retry_tool).toBe("quote_archive_order");
      expect(result.meta.request_id).toMatch(/^req_/);

      const parsed = ErrorResponseSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });
  });

  describe("ToolResponseSchema discriminated union", () => {
    it("parses a success response", () => {
      const result = success({ tool: "geocode", data: { lat: 51.9 }, startTime: Date.now() });
      const parsed = ToolResponseSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it("parses an error response", () => {
      const result = error({
        tool: "geocode",
        error: makeError("GEOCODING_FAILED"),
        startTime: Date.now(),
      });
      const parsed = ToolResponseSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it("rejects a response missing status", () => {
      const parsed = ToolResponseSchema.safeParse({ tool: "geocode" });
      expect(parsed.success).toBe(false);
    });
  });
});

describe("error code registry", () => {
  it("returns a known error with correct fields", () => {
    const err = makeError("AUTH_MISSING");
    expect(err.code).toBe("AUTH_MISSING");
    expect(err.recoverable).toBe(false);
    expect(err.message).toContain("API key");
  });

  it("returns UNKNOWN_ERROR for unregistered codes", () => {
    const err = makeError("DOES_NOT_EXIST");
    expect(err.code).toBe("UNKNOWN_ERROR");
    expect(err.recoverable).toBe(false);
  });

  it("allows overriding the message", () => {
    const err = makeError("AUTH_MISSING", "Custom auth message");
    expect(err.message).toBe("Custom auth message");
  });

  it("makeErrorWithRetry overrides retry_tool", () => {
    const err = makeErrorWithRetry("QUOTE_EXPIRED", "quote_tasking_order");
    expect(err.retry_tool).toBe("quote_tasking_order");
    expect(err.recoverable).toBe(true);
  });

  it("all registry entries have required fields", () => {
    for (const [code, def] of Object.entries(ERROR_REGISTRY)) {
      expect(typeof code).toBe("string");
      expect(typeof def.message).toBe("string");
      expect(def.message.length).toBeGreaterThan(0);
      expect(typeof def.recoverable).toBe("boolean");
    }
  });
});
