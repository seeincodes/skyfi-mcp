import { z } from "zod";
import { SkyFiClient, SkyFiApiError } from "../clients/skyfi.js";
import { success, error, makeError } from "../envelope/index.js";
import { validateAoi } from "../guardrails/aoi.js";
import type { ToolResponse } from "../types/response.js";

const GeoJsonPolygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
});

export const setupAoiMonitoringSchema = z.object({
  aoi: GeoJsonPolygonSchema.describe("GeoJSON Polygon for the monitoring area"),
  sensor_type: z
    .enum(["optical", "sar", "hyperspectral"])
    .optional()
    .describe("Preferred sensor type filter"),
  min_resolution_m: z.number().positive().optional().describe("Minimum resolution in meters"),
  frequency: z
    .enum(["daily", "weekly", "on_availability"])
    .default("on_availability")
    .describe("Notification frequency"),
});

export const createWebhookSubscriptionSchema = z.object({
  monitor_id: z.string().min(1).describe("Monitor ID from setup_aoi_monitoring"),
  endpoint_url: z.string().url().describe("HTTPS URL to receive webhook notifications"),
  secret: z.string().min(16).max(256).optional().describe("Shared secret for webhook signature verification"),
});

export const getNotificationStatusSchema = z.object({
  monitor_id: z.string().min(1).optional().describe("Filter by monitor ID"),
  subscription_id: z.string().min(1).optional().describe("Filter by subscription ID"),
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

export async function handleSetupAoiMonitoring(
  args: z.infer<typeof setupAoiMonitoringSchema>,
  client: SkyFiClient,
): Promise<ToolResponse> {
  const startTime = Date.now();

  const aoiCheck = validateAoi(args.aoi, "archive");
  if (!aoiCheck.valid) {
    return error({ tool: "setup_aoi_monitoring", error: makeError("AOI_TOO_LARGE", aoiCheck.error), startTime });
  }

  try {
    const response = await client.request<{
      monitor_id: string;
      status: string;
      aoi_area_km2: number;
      frequency: string;
    }>({
      method: "POST",
      path: "/v1/monitoring/setup",
      body: {
        aoi: args.aoi,
        sensor_type: args.sensor_type,
        min_resolution_m: args.min_resolution_m,
        frequency: args.frequency,
      },
    });
    return success({
      tool: "setup_aoi_monitoring",
      data: response.data as Record<string, unknown>,
      startTime,
      skyfiApiVersion: client.version,
    });
  } catch (err) {
    return skyfiErrorToEnvelope(err, "setup_aoi_monitoring", startTime);
  }
}

export async function handleCreateWebhookSubscription(
  args: z.infer<typeof createWebhookSubscriptionSchema>,
  client: SkyFiClient,
): Promise<ToolResponse> {
  const startTime = Date.now();

  try {
    const response = await client.request<{
      subscription_id: string;
      monitor_id: string;
      endpoint_url: string;
      status: string;
    }>({
      method: "POST",
      path: "/v1/webhooks/subscribe",
      body: {
        monitor_id: args.monitor_id,
        endpoint_url: args.endpoint_url,
        secret: args.secret,
      },
    });
    return success({
      tool: "create_webhook_subscription",
      data: response.data as Record<string, unknown>,
      startTime,
      skyfiApiVersion: client.version,
    });
  } catch (err) {
    return skyfiErrorToEnvelope(err, "create_webhook_subscription", startTime);
  }
}

export async function handleGetNotificationStatus(
  args: z.infer<typeof getNotificationStatusSchema>,
  client: SkyFiClient,
): Promise<ToolResponse> {
  const startTime = Date.now();

  try {
    const params: Record<string, string> = {};
    if (args.monitor_id) params.monitor_id = args.monitor_id;
    if (args.subscription_id) params.subscription_id = args.subscription_id;

    const response = await client.request<{
      notifications: unknown[];
      total: number;
    }>({
      path: "/v1/webhooks/status",
      params,
    });
    return success({
      tool: "get_notification_status",
      data: response.data as Record<string, unknown>,
      startTime,
      skyfiApiVersion: client.version,
    });
  } catch (err) {
    return skyfiErrorToEnvelope(err, "get_notification_status", startTime);
  }
}
