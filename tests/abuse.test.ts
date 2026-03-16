import { describe, it, expect } from "vitest";
import { AbuseController } from "../src/guardrails/abuse.js";

describe("AbuseController", () => {
  describe("daily order cap", () => {
    it("allows orders under the cap", () => {
      const ctrl = new AbuseController({ dailyOrderCap: 3, dailySpendCapUsd: 100_000, quoteAlertThreshold: 20, geoAnomalyCountryThreshold: 10 });
      for (let i = 0; i < 3; i++) {
        expect(ctrl.checkOrder("key-a", 100).allowed).toBe(true);
        ctrl.recordOrder("key-a", 100);
      }
    });

    it("blocks orders at the cap", () => {
      const ctrl = new AbuseController({ dailyOrderCap: 2, dailySpendCapUsd: 100_000, quoteAlertThreshold: 20, geoAnomalyCountryThreshold: 10 });
      ctrl.recordOrder("key-a", 50);
      ctrl.recordOrder("key-a", 50);
      const result = ctrl.checkOrder("key-a", 50);
      expect(result.allowed).toBe(false);
      expect(result.quotaType).toBe("daily_order_cap");
    });

    it("different keys have independent caps", () => {
      const ctrl = new AbuseController({ dailyOrderCap: 1, dailySpendCapUsd: 100_000, quoteAlertThreshold: 20, geoAnomalyCountryThreshold: 10 });
      ctrl.recordOrder("key-a", 50);
      expect(ctrl.checkOrder("key-a", 50).allowed).toBe(false);
      expect(ctrl.checkOrder("key-b", 50).allowed).toBe(true);
    });
  });

  describe("daily spend cap", () => {
    it("blocks when cumulative spend exceeds cap", () => {
      const ctrl = new AbuseController({ dailyOrderCap: 100, dailySpendCapUsd: 1000, quoteAlertThreshold: 20, geoAnomalyCountryThreshold: 10 });
      ctrl.recordOrder("key-a", 800);
      const result = ctrl.checkOrder("key-a", 300);
      expect(result.allowed).toBe(false);
      expect(result.quotaType).toBe("daily_spend_cap");
      expect(result.message).toContain("$200.00"); // remaining
    });

    it("allows when within cap", () => {
      const ctrl = new AbuseController({ dailyOrderCap: 100, dailySpendCapUsd: 1000, quoteAlertThreshold: 20, geoAnomalyCountryThreshold: 10 });
      ctrl.recordOrder("key-a", 500);
      expect(ctrl.checkOrder("key-a", 400).allowed).toBe(true);
    });
  });

  describe("repeated quote anomaly", () => {
    it("alerts after threshold quotes without execute", () => {
      const ctrl = new AbuseController({ dailyOrderCap: 100, dailySpendCapUsd: 100_000, quoteAlertThreshold: 3, geoAnomalyCountryThreshold: 10 });
      ctrl.recordQuote("key-a");
      ctrl.recordQuote("key-a");
      ctrl.recordQuote("key-a");
      const result = ctrl.recordQuote("key-a"); // 4th quote, over threshold of 3
      expect(result.allowed).toBe(true); // still allowed, just flagged
      expect(result.alert).toContain("Anomaly");
      expect(result.alert).toContain("pricing enumeration");
    });

    it("no alert if executes are interspersed", () => {
      const ctrl = new AbuseController({ dailyOrderCap: 100, dailySpendCapUsd: 100_000, quoteAlertThreshold: 3, geoAnomalyCountryThreshold: 10 });
      ctrl.recordQuote("key-a");
      ctrl.recordQuote("key-a");
      ctrl.recordExecute("key-a"); // resets concern
      ctrl.recordQuote("key-a");
      const result = ctrl.recordQuote("key-a"); // 4 quotes but 1 execute
      expect(result.alert).toBeUndefined();
    });
  });

  describe("geographic anomaly", () => {
    it("alerts after threshold distinct countries", () => {
      const ctrl = new AbuseController({ dailyOrderCap: 100, dailySpendCapUsd: 100_000, quoteAlertThreshold: 20, geoAnomalyCountryThreshold: 3 });
      ctrl.recordCountry("key-a", "NL");
      ctrl.recordCountry("key-a", "US");
      ctrl.recordCountry("key-a", "DE");
      const result = ctrl.recordCountry("key-a", "JP"); // 4th country
      expect(result.allowed).toBe(true);
      expect(result.alert).toContain("Geographic anomaly");
      expect(result.alert).toContain("4 distinct countries");
    });

    it("no alert when within threshold", () => {
      const ctrl = new AbuseController({ dailyOrderCap: 100, dailySpendCapUsd: 100_000, quoteAlertThreshold: 20, geoAnomalyCountryThreshold: 10 });
      ctrl.recordCountry("key-a", "NL");
      ctrl.recordCountry("key-a", "US");
      const result = ctrl.recordCountry("key-a", "DE");
      expect(result.alert).toBeUndefined();
    });

    it("same country does not increment count", () => {
      const ctrl = new AbuseController({ dailyOrderCap: 100, dailySpendCapUsd: 100_000, quoteAlertThreshold: 20, geoAnomalyCountryThreshold: 2 });
      ctrl.recordCountry("key-a", "NL");
      ctrl.recordCountry("key-a", "NL");
      ctrl.recordCountry("key-a", "NL");
      const result = ctrl.recordCountry("key-a", "NL");
      expect(result.alert).toBeUndefined();
    });
  });

  describe("adversarial/bypass", () => {
    it("cannot bypass order cap by varying price", () => {
      const ctrl = new AbuseController({ dailyOrderCap: 2, dailySpendCapUsd: 100_000, quoteAlertThreshold: 20, geoAnomalyCountryThreshold: 10 });
      ctrl.recordOrder("key-a", 1);
      ctrl.recordOrder("key-a", 1);
      expect(ctrl.checkOrder("key-a", 0.01).allowed).toBe(false);
    });

    it("cannot bypass spend cap by many small orders", () => {
      const ctrl = new AbuseController({ dailyOrderCap: 100, dailySpendCapUsd: 100, quoteAlertThreshold: 20, geoAnomalyCountryThreshold: 10 });
      for (let i = 0; i < 10; i++) ctrl.recordOrder("key-a", 10);
      expect(ctrl.checkOrder("key-a", 1).allowed).toBe(false);
    });

    it("key isolation: exhausted key does not affect others", () => {
      const ctrl = new AbuseController({ dailyOrderCap: 1, dailySpendCapUsd: 50, quoteAlertThreshold: 20, geoAnomalyCountryThreshold: 10 });
      ctrl.recordOrder("attacker", 50);
      expect(ctrl.checkOrder("attacker", 1).allowed).toBe(false);
      expect(ctrl.checkOrder("victim", 49).allowed).toBe(true);
    });
  });
});
