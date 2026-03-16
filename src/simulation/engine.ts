import { randomUUID } from "node:crypto";
import { success } from "../envelope/index.js";
import type { ToolResponse } from "../types/response.js";

const SIM_PREFIX_QUOTE = "sim_q_";
const SIM_PREFIX_ORDER = "sim_ord_";

function simId(prefix: string): string {
  return `${prefix}${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

// Canned status progression for simulated orders
const STATUS_PROGRESSION = ["pending", "processing", "delivered"] as const;
const statusMap = new Map<string, number>();

export function simulateQuoteArchiveOrder(args: {
  scene_id: string;
  aoi: unknown;
  resolution_tier?: string;
}): ToolResponse {
  const startTime = Date.now();
  const quoteId = simId(SIM_PREFIX_QUOTE);
  return success({
    tool: "quote_archive_order",
    simulated: true,
    data: {
      quote_id: quoteId,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      price_usd: 45.0,
      summary: `[SIMULATED] Archive order for scene ${args.scene_id}, resolution: ${args.resolution_tier ?? "default"}. Price: $45.00.`,
    },
    startTime,
  });
}

export function simulateExecuteArchiveOrder(args: {
  quote_id: string;
  user_confirmed: boolean;
  idempotency_key: string;
}): ToolResponse {
  const startTime = Date.now();
  const orderId = simId(SIM_PREFIX_ORDER);
  statusMap.set(orderId, 0);
  return success({
    tool: "execute_archive_order",
    simulated: true,
    data: {
      order_id: orderId,
      status: "pending",
      price_usd: 45.0,
      estimated_delivery: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      idempotency_key: args.idempotency_key,
    },
    startTime,
  });
}

export function simulateQuoteTaskingOrder(args: {
  aoi: unknown;
  sensor_type: string;
  resolution_tier?: string;
}): ToolResponse {
  const startTime = Date.now();
  const quoteId = simId(SIM_PREFIX_QUOTE);
  return success({
    tool: "quote_tasking_order",
    simulated: true,
    data: {
      quote_id: quoteId,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      estimated_cost_usd: 2500.0,
      summary: `[SIMULATED] Tasking order for ${args.sensor_type} imagery. Estimated cost: $2,500.00.`,
    },
    startTime,
  });
}

export function simulateExecuteTaskingOrder(args: {
  quote_id: string;
  user_confirmed: boolean;
  idempotency_key: string;
}): ToolResponse {
  const startTime = Date.now();
  const orderId = simId(SIM_PREFIX_ORDER);
  statusMap.set(orderId, 0);
  return success({
    tool: "execute_tasking_order",
    simulated: true,
    data: {
      order_id: orderId,
      status: "pending",
      estimated_cost_usd: 2500.0,
      estimated_delivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      idempotency_key: args.idempotency_key,
    },
    startTime,
  });
}

export function simulateGetOrderStatus(args: { order_id: string }): ToolResponse {
  const startTime = Date.now();

  // Advance status on each call (fast clock)
  const currentIdx = statusMap.get(args.order_id) ?? 0;
  const nextIdx = Math.min(currentIdx + 1, STATUS_PROGRESSION.length - 1);
  statusMap.set(args.order_id, nextIdx);

  const status = STATUS_PROGRESSION[nextIdx];

  return success({
    tool: "get_order_status",
    simulated: true,
    data: {
      order_id: args.order_id,
      status,
      progress_pct: status === "delivered" ? 100 : status === "processing" ? 50 : 0,
      created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
      estimated_delivery: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
    startTime,
  });
}

export function isSimulatedId(id: string): boolean {
  return id.startsWith(SIM_PREFIX_QUOTE) || id.startsWith(SIM_PREFIX_ORDER);
}
