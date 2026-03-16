import { describe, it, expect, vi } from "vitest";
import { RateLimiter } from "../src/guardrails/rate-limiter.js";

describe("RateLimiter", () => {
  describe("per-minute rate limit", () => {
    it("allows requests under the limit", () => {
      const limiter = new RateLimiter({ maxPerMinute: 5, burstMax: 100, burstWindowMs: 10_000 });
      for (let i = 0; i < 5; i++) {
        const result = limiter.check("key-a");
        expect(result.allowed).toBe(true);
        limiter.record("key-a");
      }
    });

    it("blocks requests over the minute limit", () => {
      const limiter = new RateLimiter({ maxPerMinute: 3, burstMax: 100, burstWindowMs: 10_000 });
      for (let i = 0; i < 3; i++) {
        limiter.record("key-a");
      }
      const result = limiter.check("key-a");
      expect(result.allowed).toBe(false);
      expect(result.quotaType).toBe("rate_limit");
      expect(result.retryAfterMs).toBeGreaterThan(0);
      expect(result.message).toContain("Rate limit exceeded");
    });

    it("resets after the minute window", () => {
      const limiter = new RateLimiter({ maxPerMinute: 2, burstMax: 100, burstWindowMs: 10_000 });
      limiter.record("key-a");
      limiter.record("key-a");

      vi.useFakeTimers();
      vi.advanceTimersByTime(61_000); // Past 60s window

      const result = limiter.check("key-a");
      expect(result.allowed).toBe(true);

      vi.useRealTimers();
    });
  });

  describe("burst limit", () => {
    it("blocks burst over the limit", () => {
      const limiter = new RateLimiter({ maxPerMinute: 100, burstMax: 3, burstWindowMs: 10_000 });
      for (let i = 0; i < 3; i++) {
        limiter.record("key-b");
      }
      const result = limiter.check("key-b");
      expect(result.allowed).toBe(false);
      expect(result.quotaType).toBe("burst_limit");
      expect(result.message).toContain("Burst rate limit");
    });

    it("resets after the burst window", () => {
      const limiter = new RateLimiter({ maxPerMinute: 100, burstMax: 2, burstWindowMs: 5_000 });
      limiter.record("key-b");
      limiter.record("key-b");

      vi.useFakeTimers();
      vi.advanceTimersByTime(6_000); // Past 5s window

      const result = limiter.check("key-b");
      expect(result.allowed).toBe(true);

      vi.useRealTimers();
    });
  });

  describe("structured 429 response fields", () => {
    it("includes quota_type on rate limit", () => {
      const limiter = new RateLimiter({ maxPerMinute: 1, burstMax: 100, burstWindowMs: 10_000 });
      limiter.record("key-c");
      const result = limiter.check("key-c");
      expect(result.quotaType).toBe("rate_limit");
      expect(result.retryAfterMs).toBeDefined();
      expect(typeof result.retryAfterMs).toBe("number");
    });

    it("includes quota_type on burst limit", () => {
      const limiter = new RateLimiter({ maxPerMinute: 100, burstMax: 1, burstWindowMs: 10_000 });
      limiter.record("key-d");
      const result = limiter.check("key-d");
      expect(result.quotaType).toBe("burst_limit");
    });
  });

  describe("key isolation", () => {
    it("different keys have independent counters", () => {
      const limiter = new RateLimiter({ maxPerMinute: 2, burstMax: 100, burstWindowMs: 10_000 });
      limiter.record("tenant-a");
      limiter.record("tenant-a");

      // Tenant A is at limit
      expect(limiter.check("tenant-a").allowed).toBe(false);

      // Tenant B is unaffected
      expect(limiter.check("tenant-b").allowed).toBe(true);
    });

    it("exhausting one key does not affect others", () => {
      const limiter = new RateLimiter({ maxPerMinute: 1, burstMax: 1, burstWindowMs: 10_000 });

      limiter.record("key-exhaust");
      expect(limiter.check("key-exhaust").allowed).toBe(false);

      // Other keys are fine
      for (let i = 0; i < 10; i++) {
        expect(limiter.check(`other-key-${i}`).allowed).toBe(true);
      }
    });
  });
});
