import { z } from "zod";
import { SkyFiClient, SkyFiApiError } from "../clients/skyfi.js";
import { success, error, makeError } from "../envelope/index.js";
import { validateAoi } from "../guardrails/aoi.js";
import { checkPricing, type PricingLimits, DEFAULT_PRICING_LIMITS } from "../guardrails/pricing.js";
import type { ToolResponse } from "../types/response.js";

const GeoJsonPolygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
});

export const quoteArchiveOrderSchema = z.object({
  scene_id: z.string().min(1).describe("Scene ID from search results"),
  aoi: GeoJsonPolygonSchema.describe("GeoJSON Polygon for the order area"),
  resolution_tier: z
    .enum(["low", "medium", "high", "very_high"])
    .optional()
    .describe("Resolution tier"),
});

export const executeArchiveOrderSchema = z.object({
  quote_id: z.string().min(1).describe("Quote ID from quote_archive_order"),
  user_confirmed: z
    .literal(true)
    .describe("Must be true — confirms the user has reviewed and approved the order"),
  idempotency_key: z
    .string()
    .min(1)
    .max(128)
    .describe("Caller-supplied UUID for safe retries"),
});

export const quoteTaskingOrderSchema = z.object({
  aoi: GeoJsonPolygonSchema.describe("GeoJSON Polygon for the tasking area"),
  sensor_type: z.enum(["optical", "sar", "hyperspectral"]).describe("Sensor type"),
  resolution_tier: z
    .enum(["low", "medium", "high", "very_high"])
    .optional()
    .describe("Desired resolution tier"),
});

export const executeTaskingOrderSchema = z.object({
  quote_id: z.string().min(1).describe("Quote ID from quote_tasking_order"),
  user_confirmed: z
    .literal(true)
    .describe("Must be true — confirms the user has reviewed and approved the order"),
  idempotency_key: z
    .string()
    .min(1)
    .max(128)
    .describe("Caller-supplied UUID for safe retries"),
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

export async function handleQuoteArchiveOrder(
  args: z.infer<typeof quoteArchiveOrderSchema>,
  client: SkyFiClient,
  pricingLimits: PricingLimits = DEFAULT_PRICING_LIMITS,
): Promise<ToolResponse> {
  const startTime = Date.now();

  const aoiCheck = validateAoi(args.aoi, "archive");
  if (!aoiCheck.valid) {
    return error({ tool: "quote_archive_order", error: makeError("AOI_TOO_LARGE", aoiCheck.error), startTime });
  }

  try {
    const response = await client.request<{
      quote_id: string;
      expires_at: string;
      price_usd: number;
      summary: string;
    }>({
      method: "POST",
      path: "/v1/archive/quote",
      body: {
        scene_id: args.scene_id,
        aoi: args.aoi,
        resolution_tier: args.resolution_tier,
      },
    });

    const priceCheck = checkPricing(response.data.price_usd, pricingLimits);
    if (!priceCheck.allowed) {
      return error({ tool: "quote_archive_order", error: makeError("PRICE_HARD_LIMIT_EXCEEDED", priceCheck.error), startTime });
    }

    return success({
      tool: "quote_archive_order",
      data: response.data as Record<string, unknown>,
      warnings: priceCheck.warnings,
      startTime,
      skyfiApiVersion: client.version,
    });
  } catch (err) {
    return skyfiErrorToEnvelope(err, "quote_archive_order", startTime);
  }
}

export async function handleExecuteArchiveOrder(
  args: z.infer<typeof executeArchiveOrderSchema>,
  client: SkyFiClient,
): Promise<ToolResponse> {
  const startTime = Date.now();

  if (!args.quote_id) {
    return error({ tool: "execute_archive_order", error: makeError("CONFIRMATION_REQUIRED"), startTime });
  }
  if (args.user_confirmed !== true) {
    return error({ tool: "execute_archive_order", error: makeError("CONFIRMATION_REQUIRED"), startTime });
  }
  if (!args.idempotency_key) {
    return error({ tool: "execute_archive_order", error: makeError("IDEMPOTENCY_KEY_MISSING"), startTime });
  }

  try {
    const response = await client.request<{
      order_id: string;
      status: string;
      price_usd: number;
      estimated_delivery: string;
    }>({
      method: "POST",
      path: "/v1/archive/order",
      body: {
        quote_id: args.quote_id,
        user_confirmed: args.user_confirmed,
        idempotency_key: args.idempotency_key,
      },
    });

    return success({
      tool: "execute_archive_order",
      data: {
        ...response.data as Record<string, unknown>,
        idempotency_key: args.idempotency_key,
      },
      startTime,
      skyfiApiVersion: client.version,
    });
  } catch (err) {
    return skyfiErrorToEnvelope(err, "execute_archive_order", startTime);
  }
}

export async function handleQuoteTaskingOrder(
  args: z.infer<typeof quoteTaskingOrderSchema>,
  client: SkyFiClient,
  pricingLimits: PricingLimits = DEFAULT_PRICING_LIMITS,
): Promise<ToolResponse> {
  const startTime = Date.now();

  const aoiCheck = validateAoi(args.aoi, "tasking");
  if (!aoiCheck.valid) {
    return error({ tool: "quote_tasking_order", error: makeError("AOI_TOO_LARGE", aoiCheck.error), startTime });
  }

  try {
    const response = await client.request<{
      quote_id: string;
      expires_at: string;
      estimated_cost_usd: number;
      summary: string;
    }>({
      method: "POST",
      path: "/v1/tasking/quote",
      body: {
        aoi: args.aoi,
        sensor_type: args.sensor_type,
        resolution_tier: args.resolution_tier,
      },
    });

    const priceCheck = checkPricing(response.data.estimated_cost_usd, pricingLimits);
    if (!priceCheck.allowed) {
      return error({ tool: "quote_tasking_order", error: makeError("PRICE_HARD_LIMIT_EXCEEDED", priceCheck.error), startTime });
    }

    return success({
      tool: "quote_tasking_order",
      data: response.data as Record<string, unknown>,
      warnings: priceCheck.warnings,
      startTime,
      skyfiApiVersion: client.version,
    });
  } catch (err) {
    return skyfiErrorToEnvelope(err, "quote_tasking_order", startTime);
  }
}

export async function handleExecuteTaskingOrder(
  args: z.infer<typeof executeTaskingOrderSchema>,
  client: SkyFiClient,
): Promise<ToolResponse> {
  const startTime = Date.now();

  if (!args.quote_id) {
    return error({ tool: "execute_tasking_order", error: makeError("CONFIRMATION_REQUIRED"), startTime });
  }
  if (args.user_confirmed !== true) {
    return error({ tool: "execute_tasking_order", error: makeError("CONFIRMATION_REQUIRED"), startTime });
  }
  if (!args.idempotency_key) {
    return error({ tool: "execute_tasking_order", error: makeError("IDEMPOTENCY_KEY_MISSING"), startTime });
  }

  try {
    const response = await client.request<{
      order_id: string;
      status: string;
      estimated_cost_usd: number;
      estimated_delivery: string;
    }>({
      method: "POST",
      path: "/v1/tasking/order",
      body: {
        quote_id: args.quote_id,
        user_confirmed: args.user_confirmed,
        idempotency_key: args.idempotency_key,
      },
    });

    return success({
      tool: "execute_tasking_order",
      data: {
        ...response.data as Record<string, unknown>,
        idempotency_key: args.idempotency_key,
      },
      startTime,
      skyfiApiVersion: client.version,
    });
  } catch (err) {
    return skyfiErrorToEnvelope(err, "execute_tasking_order", startTime);
  }
}
