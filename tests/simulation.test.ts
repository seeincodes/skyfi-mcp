import { describe, it, expect } from "vitest";
import {
  simulateQuoteArchiveOrder,
  simulateExecuteArchiveOrder,
  simulateQuoteTaskingOrder,
  simulateExecuteTaskingOrder,
  simulateGetOrderStatus,
  isSimulatedId,
} from "../src/simulation/index.js";

const SMALL_AOI = {
  type: "Polygon" as const,
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

describe("simulation engine", () => {
  describe("quote_archive_order", () => {
    it("returns simulated: true with synthetic quote_id", () => {
      const result = simulateQuoteArchiveOrder({ scene_id: "s_1", aoi: SMALL_AOI });
      expect(result.status).toBe("success");
      if (result.status === "success") {
        expect(result.simulated).toBe(true);
        expect((result.data.quote_id as string).startsWith("sim_q_")).toBe(true);
        expect(result.data.price_usd).toBe(45.0);
        expect((result.data.summary as string)).toContain("SIMULATED");
      }
    });
  });

  describe("execute_archive_order", () => {
    it("returns simulated: true with synthetic order_id", () => {
      const result = simulateExecuteArchiveOrder({
        quote_id: "sim_q_test",
        user_confirmed: true,
        idempotency_key: "key-1",
      });
      expect(result.status).toBe("success");
      if (result.status === "success") {
        expect(result.simulated).toBe(true);
        expect((result.data.order_id as string).startsWith("sim_ord_")).toBe(true);
        expect(result.data.idempotency_key).toBe("key-1");
      }
    });

    it("simulated order_id is clearly distinguishable from real", () => {
      const result = simulateExecuteArchiveOrder({
        quote_id: "sim_q_test",
        user_confirmed: true,
        idempotency_key: "key-2",
      });
      if (result.status === "success") {
        expect(isSimulatedId(result.data.order_id as string)).toBe(true);
        expect(isSimulatedId("ord_real_123")).toBe(false);
      }
    });
  });

  describe("quote_tasking_order", () => {
    it("returns simulated tasking quote", () => {
      const result = simulateQuoteTaskingOrder({
        aoi: SMALL_AOI,
        sensor_type: "sar",
      });
      expect(result.status).toBe("success");
      if (result.status === "success") {
        expect(result.simulated).toBe(true);
        expect((result.data.quote_id as string).startsWith("sim_q_")).toBe(true);
        expect(result.data.estimated_cost_usd).toBe(2500.0);
      }
    });
  });

  describe("execute_tasking_order", () => {
    it("returns simulated tasking order", () => {
      const result = simulateExecuteTaskingOrder({
        quote_id: "sim_q_task",
        user_confirmed: true,
        idempotency_key: "key-3",
      });
      expect(result.status).toBe("success");
      if (result.status === "success") {
        expect(result.simulated).toBe(true);
        expect((result.data.order_id as string).startsWith("sim_ord_")).toBe(true);
      }
    });
  });

  describe("get_order_status (canned progression)", () => {
    it("progresses from pending → processing → delivered", () => {
      // Create an order first
      const orderResult = simulateExecuteArchiveOrder({
        quote_id: "sim_q_prog",
        user_confirmed: true,
        idempotency_key: "key-prog",
      });
      const orderId = (orderResult as { status: "success"; data: Record<string, unknown> }).data
        .order_id as string;

      // First call: pending → processing
      const status1 = simulateGetOrderStatus({ order_id: orderId });
      expect(status1.status).toBe("success");
      if (status1.status === "success") {
        expect(status1.simulated).toBe(true);
        expect(status1.data.status).toBe("processing");
      }

      // Second call: processing → delivered
      const status2 = simulateGetOrderStatus({ order_id: orderId });
      if (status2.status === "success") {
        expect(status2.data.status).toBe("delivered");
        expect(status2.data.progress_pct).toBe(100);
      }

      // Third call: stays at delivered
      const status3 = simulateGetOrderStatus({ order_id: orderId });
      if (status3.status === "success") {
        expect(status3.data.status).toBe("delivered");
      }
    });
  });

  describe("simulated flag", () => {
    it("all simulated responses have simulated: true", () => {
      const responses = [
        simulateQuoteArchiveOrder({ scene_id: "s_1", aoi: SMALL_AOI }),
        simulateExecuteArchiveOrder({ quote_id: "q", user_confirmed: true, idempotency_key: "k" }),
        simulateQuoteTaskingOrder({ aoi: SMALL_AOI, sensor_type: "optical" }),
        simulateExecuteTaskingOrder({ quote_id: "q", user_confirmed: true, idempotency_key: "k" }),
        simulateGetOrderStatus({ order_id: "sim_ord_test" }),
      ];
      for (const r of responses) {
        expect(r.status).toBe("success");
        if (r.status === "success") {
          expect(r.simulated).toBe(true);
        }
      }
    });
  });
});
