import { z } from "zod";
import { SkyFiClient, SkyFiApiError } from "../clients/skyfi.js";
import { success, error, makeError } from "../envelope/index.js";
import type { ToolResponse } from "../types/response.js";

export const getOrderStatusSchema = z.object({
  order_id: z.string().min(1).describe("Order ID to check status for"),
});

export const listOrdersSchema = z.object({
  date_range: z
    .object({
      start: z.string().describe("Start date (YYYY-MM-DD)"),
      end: z.string().describe("End date (YYYY-MM-DD)"),
    })
    .optional(),
  status: z
    .enum(["pending", "processing", "delivered", "failed", "cancelled"])
    .optional()
    .describe("Filter by order status"),
  page: z.number().int().min(1).default(1).optional(),
  limit: z.number().int().min(1).max(100).default(20).optional(),
});

export const fetchOrderImageSchema = z.object({
  order_id: z.string().min(1).describe("Order ID of a completed order"),
});

function skyfiErrorToEnvelope(err: unknown, tool: string, startTime: number): ToolResponse {
  if (err instanceof SkyFiApiError) {
    if (err.statusCode === 401) return error({ tool, error: makeError("AUTH_INVALID"), startTime });
    if (err.statusCode === 429) return error({ tool, error: makeError("SKYFI_API_RATE_LIMIT"), startTime });
    if (err.statusCode >= 500) return error({ tool, error: makeError("SKYFI_API_UNAVAILABLE"), startTime });
    return error({ tool, error: makeError("SKYFI_API_ERROR", err.message), startTime });
  }
  return error({ tool, error: makeError("SKYFI_API_ERROR"), startTime });
}

export async function handleGetOrderStatus(
  args: z.infer<typeof getOrderStatusSchema>,
  client: SkyFiClient,
): Promise<ToolResponse> {
  const startTime = Date.now();
  try {
    const response = await client.request<Record<string, unknown>>({
      path: `/orders/${encodeURIComponent(args.order_id)}`,
    });
    return success({
      tool: "get_order_status",
      data: response.data as Record<string, unknown>,
      startTime,
      skyfiApiVersion: client.version,
    });
  } catch (err) {
    return skyfiErrorToEnvelope(err, "get_order_status", startTime);
  }
}

export async function handleListOrders(
  args: z.infer<typeof listOrdersSchema>,
  client: SkyFiClient,
): Promise<ToolResponse> {
  const startTime = Date.now();
  try {
    const params: Record<string, string> = {};
    params.page_number = String((args.page ?? 1) - 1); // API is 0-indexed
    params.page_size = String(args.limit ?? 20);
    if (args.status) params.status = args.status;
    if (args.date_range?.start) params.start_date = args.date_range.start;
    if (args.date_range?.end) params.end_date = args.date_range.end;

    const response = await client.request<Record<string, unknown>>({
      path: "/orders",
      params,
    });
    return success({
      tool: "list_orders",
      data: response.data as Record<string, unknown>,
      startTime,
      skyfiApiVersion: client.version,
    });
  } catch (err) {
    return skyfiErrorToEnvelope(err, "list_orders", startTime);
  }
}

export async function handleFetchOrderImage(
  args: z.infer<typeof fetchOrderImageSchema>,
  client: SkyFiClient,
): Promise<ToolResponse> {
  const startTime = Date.now();
  try {
    const response = await client.request<Record<string, unknown>>({
      path: `/orders/${encodeURIComponent(args.order_id)}/DOWNLOAD`,
    });
    return success({
      tool: "fetch_order_image",
      data: response.data as Record<string, unknown>,
      startTime,
      skyfiApiVersion: client.version,
    });
  } catch (err) {
    return skyfiErrorToEnvelope(err, "fetch_order_image", startTime);
  }
}
