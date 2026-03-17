import { z } from "zod";
import { SkyFiClient, SkyFiApiError } from "../clients/skyfi.js";
import { success, error, makeError } from "../envelope/index.js";
import { validateAoi, polygonToWkt } from "../guardrails/aoi.js";
import { checkPricing, type PricingLimits, DEFAULT_PRICING_LIMITS } from "../guardrails/pricing.js";
import type { ToolResponse } from "../types/response.js";

const GeoJsonPolygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
});

export const quoteArchiveOrderSchema = z.object({
  archive_id: z.string().min(1).describe("Archive ID from search_archive results (archiveId field)"),
  aoi: GeoJsonPolygonSchema.describe("GeoJSON Polygon for the order area — must overlap the archive footprint"),
  price_per_sqkm_usd: z.number().positive().describe("Price per sq km from search results (priceForOneSquareKm)"),
  price_full_scene_usd: z.number().positive().describe("Full scene price from search results (priceFullScene)"),
  overlap_sqkm: z.number().positive().describe("Overlap area in sq km from search results (overlapSqkm)"),
});

export const executeArchiveOrderSchema = z.object({
  archive_id: z.string().min(1).describe("Archive ID from search_archive results"),
  aoi: GeoJsonPolygonSchema.describe("GeoJSON Polygon for the order area"),
  user_confirmed: z
    .literal(true)
    .describe("Must be true — confirms the user has reviewed the price and approved the order"),
  label: z.string().max(100).optional().describe("Optional label for this order"),
});

export const quoteTaskingOrderSchema = z.object({
  aoi: GeoJsonPolygonSchema.describe("GeoJSON Polygon for the tasking area"),
  product_type: z.enum(["DAY", "NIGHT", "SAR"]).describe("Satellite product type"),
  resolution: z
    .enum(["LOW", "MEDIUM", "HIGH", "VERY HIGH", "SUPER HIGH", "ULTRA HIGH"])
    .describe("Required image resolution"),
  window_start: z.string().describe("Capture window start (ISO 8601, e.g. 2026-04-01T00:00:00+00:00)"),
  window_end: z.string().describe("Capture window end (ISO 8601, e.g. 2026-04-30T23:59:59+00:00)"),
});

export const executeTaskingOrderSchema = z.object({
  aoi: GeoJsonPolygonSchema.describe("GeoJSON Polygon for the tasking area"),
  product_type: z.enum(["DAY", "NIGHT", "SAR"]).describe("Satellite product type"),
  resolution: z
    .enum(["LOW", "MEDIUM", "HIGH", "VERY HIGH", "SUPER HIGH", "ULTRA HIGH"])
    .describe("Required image resolution"),
  window_start: z.string().describe("Capture window start (ISO 8601)"),
  window_end: z.string().describe("Capture window end (ISO 8601)"),
  user_confirmed: z
    .literal(true)
    .describe("Must be true — confirms the user has reviewed feasibility and pricing and approved"),
  label: z.string().max(100).optional().describe("Optional label for this order"),
  max_cloud_cover_pct: z.number().min(0).max(100).optional().describe("Maximum acceptable cloud cover %"),
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
  _client: SkyFiClient,
  pricingLimits: PricingLimits = DEFAULT_PRICING_LIMITS,
): Promise<ToolResponse> {
  // Quote is computed client-side from search result pricing — no separate API call needed
  const startTime = Date.now();

  const aoiCheck = validateAoi(args.aoi, "archive");
  if (!aoiCheck.valid) {
    return error({ tool: "quote_archive_order", error: makeError("AOI_TOO_LARGE", aoiCheck.error), startTime });
  }

  const estimatedPrice = args.price_per_sqkm_usd * args.overlap_sqkm;
  const priceCheck = checkPricing(estimatedPrice, pricingLimits);
  if (!priceCheck.allowed) {
    return error({ tool: "quote_archive_order", error: makeError("PRICE_HARD_LIMIT_EXCEEDED", priceCheck.error), startTime });
  }

  return success({
    tool: "quote_archive_order",
    data: {
      archive_id: args.archive_id,
      estimated_price_usd: estimatedPrice,
      price_full_scene_usd: args.price_full_scene_usd,
      overlap_sqkm: args.overlap_sqkm,
      summary: `Archive order for ${args.overlap_sqkm.toFixed(2)} km² at $${args.price_per_sqkm_usd}/km² = ~$${estimatedPrice.toFixed(2)} USD`,
      note: "Call execute_archive_order with user_confirmed: true to place the order.",
    },
    warnings: priceCheck.warnings,
    startTime,
    skyfiApiVersion: _client.version,
  });
}

export async function handleExecuteArchiveOrder(
  args: z.infer<typeof executeArchiveOrderSchema>,
  client: SkyFiClient,
): Promise<ToolResponse> {
  const startTime = Date.now();

  if (args.user_confirmed !== true) {
    return error({ tool: "execute_archive_order", error: makeError("CONFIRMATION_REQUIRED"), startTime });
  }

  const aoiCheck = validateAoi(args.aoi, "archive");
  if (!aoiCheck.valid) {
    return error({ tool: "execute_archive_order", error: makeError("AOI_TOO_LARGE", aoiCheck.error), startTime });
  }

  try {
    const response = await client.request<Record<string, unknown>>({
      method: "POST",
      path: "/order-archive",
      body: {
        archiveId: args.archive_id,
        aoi: polygonToWkt(args.aoi as GeoJSON.Polygon),
        ...(args.label ? { label: args.label } : {}),
      },
    });

    return success({
      tool: "execute_archive_order",
      data: response.data as Record<string, unknown>,
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
      price: number;
      priceUnit: string;
      area: number;
    }>({
      method: "POST",
      path: "/pricing",
      body: {
        aoi: polygonToWkt(args.aoi as GeoJSON.Polygon),
        productType: args.product_type,
        resolution: args.resolution,
      },
    });

    const price = response.data.price ?? 0;
    const priceCheck = checkPricing(price, pricingLimits);
    if (!priceCheck.allowed) {
      return error({ tool: "quote_tasking_order", error: makeError("PRICE_HARD_LIMIT_EXCEEDED", priceCheck.error), startTime });
    }

    return success({
      tool: "quote_tasking_order",
      data: {
        ...response.data as Record<string, unknown>,
        note: "Call execute_tasking_order with user_confirmed: true to place the order.",
      },
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

  if (args.user_confirmed !== true) {
    return error({ tool: "execute_tasking_order", error: makeError("CONFIRMATION_REQUIRED"), startTime });
  }

  const aoiCheck = validateAoi(args.aoi, "tasking");
  if (!aoiCheck.valid) {
    return error({ tool: "execute_tasking_order", error: makeError("AOI_TOO_LARGE", aoiCheck.error), startTime });
  }

  try {
    const response = await client.request<Record<string, unknown>>({
      method: "POST",
      path: "/order-tasking",
      body: {
        aoi: polygonToWkt(args.aoi as GeoJSON.Polygon),
        windowStart: args.window_start,
        windowEnd: args.window_end,
        productType: args.product_type,
        resolution: args.resolution,
        ...(args.max_cloud_cover_pct !== undefined ? { maxCloudCoveragePercent: args.max_cloud_cover_pct } : {}),
        ...(args.label ? { label: args.label } : {}),
      },
    });

    return success({
      tool: "execute_tasking_order",
      data: response.data as Record<string, unknown>,
      startTime,
      skyfiApiVersion: client.version,
    });
  } catch (err) {
    return skyfiErrorToEnvelope(err, "execute_tasking_order", startTime);
  }
}
