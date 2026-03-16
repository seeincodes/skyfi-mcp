import { describe, it, expect } from "vitest";
import { PreAuthEngine, type PreAuthPolicy } from "../src/guardrails/preauth.js";

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

// Larger polygon that contains SMALL_AOI
const ALLOWED_BOUNDARY: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [4.0, 51.5],
      [5.0, 51.5],
      [5.0, 52.5],
      [4.0, 52.5],
      [4.0, 51.5],
    ],
  ],
};

// AOI outside the allowed boundary
const OUT_OF_BOUNDS_AOI: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [10.0, 48.0],
      [10.1, 48.0],
      [10.1, 48.1],
      [10.0, 48.1],
      [10.0, 48.0],
    ],
  ],
};

const DEFAULT_POLICY: PreAuthPolicy = {
  enabled: true,
  maxOrderPriceUsd: 500,
  monthlySpendLimitUsd: 5000,
  allowedAoiPolygon: ALLOWED_BOUNDARY,
};

describe("PreAuthEngine", () => {
  describe("basic approval", () => {
    it("approves order within all constraints", () => {
      const engine = new PreAuthEngine(DEFAULT_POLICY);
      const result = engine.check(100, SMALL_AOI);
      expect(result.approved).toBe(true);
      expect(result.preAuthorized).toBe(true);
      expect(result.remainingBudget?.monthly).toBe(4900);
    });

    it("rejects when disabled", () => {
      const engine = new PreAuthEngine({ ...DEFAULT_POLICY, enabled: false });
      const result = engine.check(100, SMALL_AOI);
      expect(result.approved).toBe(false);
      expect(result.error).toContain("not enabled");
    });
  });

  describe("per-order price ceiling", () => {
    it("rejects order exceeding max per-order price", () => {
      const engine = new PreAuthEngine(DEFAULT_POLICY);
      const result = engine.check(600, SMALL_AOI);
      expect(result.approved).toBe(false);
      expect(result.error).toContain("per-order ceiling");
      expect(result.error).toContain("$500.00");
    });

    it("allows order exactly at the ceiling", () => {
      const engine = new PreAuthEngine(DEFAULT_POLICY);
      const result = engine.check(500, SMALL_AOI);
      expect(result.approved).toBe(true);
    });
  });

  describe("monthly spend limit", () => {
    it("rejects when cumulative spend would exceed monthly limit", () => {
      const engine = new PreAuthEngine(DEFAULT_POLICY);
      engine.recordSpend(4800);
      const result = engine.check(300, SMALL_AOI);
      expect(result.approved).toBe(false);
      expect(result.error).toContain("monthly");
      expect(result.error).toContain("$200.00"); // remaining
    });

    it("allows when within monthly limit after prior spend", () => {
      const engine = new PreAuthEngine(DEFAULT_POLICY);
      engine.recordSpend(2000);
      const result = engine.check(400, SMALL_AOI);
      expect(result.approved).toBe(true);
      expect(result.remainingBudget?.monthly).toBe(2600);
    });

    it("tracks cumulative spend correctly", () => {
      const engine = new PreAuthEngine(DEFAULT_POLICY);
      engine.recordSpend(1000);
      engine.recordSpend(1000);
      engine.recordSpend(1000);
      const status = engine.getStatus();
      expect(status.monthlySpendUsd).toBe(3000);
      expect(status.remainingMonthlyUsd).toBe(2000);
    });
  });

  describe("AOI boundary constraint", () => {
    it("rejects AOI outside allowed boundary", () => {
      const engine = new PreAuthEngine(DEFAULT_POLICY);
      const result = engine.check(100, OUT_OF_BOUNDS_AOI);
      expect(result.approved).toBe(false);
      expect(result.error).toContain("outside the pre-authorized geographic boundary");
    });

    it("allows AOI inside boundary", () => {
      const engine = new PreAuthEngine(DEFAULT_POLICY);
      const result = engine.check(100, SMALL_AOI);
      expect(result.approved).toBe(true);
    });

    it("skips AOI check when no boundary configured", () => {
      const engine = new PreAuthEngine({ ...DEFAULT_POLICY, allowedAoiPolygon: null });
      const result = engine.check(100, OUT_OF_BOUNDS_AOI);
      expect(result.approved).toBe(true);
    });
  });

  describe("get_preauth_status", () => {
    it("returns current status", () => {
      const engine = new PreAuthEngine(DEFAULT_POLICY);
      engine.recordSpend(1500);
      const status = engine.getStatus();
      expect(status.enabled).toBe(true);
      expect(status.monthlySpendUsd).toBe(1500);
      expect(status.monthlyLimitUsd).toBe(5000);
      expect(status.remainingMonthlyUsd).toBe(3500);
      expect(status.maxOrderPriceUsd).toBe(500);
      expect(status.hasAoiBoundary).toBe(true);
    });

    it("reports no boundary when not configured", () => {
      const engine = new PreAuthEngine({ ...DEFAULT_POLICY, allowedAoiPolygon: null });
      expect(engine.getStatus().hasAoiBoundary).toBe(false);
    });
  });

  describe("pre_authorized marker", () => {
    it("sets preAuthorized: true on auto-approved orders", () => {
      const engine = new PreAuthEngine(DEFAULT_POLICY);
      const result = engine.check(200, SMALL_AOI);
      expect(result.preAuthorized).toBe(true);
    });

    it("sets preAuthorized: false on rejected orders", () => {
      const engine = new PreAuthEngine(DEFAULT_POLICY);
      const result = engine.check(600, SMALL_AOI);
      expect(result.preAuthorized).toBe(false);
    });

    it("sets preAuthorized: false when disabled", () => {
      const engine = new PreAuthEngine({ ...DEFAULT_POLICY, enabled: false });
      const result = engine.check(100, SMALL_AOI);
      expect(result.preAuthorized).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("rejects $0 max order price (effectively disabled)", () => {
      const engine = new PreAuthEngine({ ...DEFAULT_POLICY, maxOrderPriceUsd: 0 });
      const result = engine.check(0.01, SMALL_AOI);
      expect(result.approved).toBe(false);
    });

    it("handles exact monthly limit exhaustion", () => {
      const engine = new PreAuthEngine(DEFAULT_POLICY);
      engine.recordSpend(4500);
      const result = engine.check(500, SMALL_AOI);
      expect(result.approved).toBe(true);
      expect(result.remainingBudget?.monthly).toBe(0);
    });

    it("rejects when monthly limit is exactly exhausted", () => {
      const engine = new PreAuthEngine(DEFAULT_POLICY);
      engine.recordSpend(5000);
      const result = engine.check(0.01, SMALL_AOI);
      expect(result.approved).toBe(false);
    });
  });
});
