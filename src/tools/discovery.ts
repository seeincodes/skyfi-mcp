import { z } from "zod";
import { SkyFiClient, SkyFiApiError } from "../clients/skyfi.js";
import { success, error, makeError } from "../envelope/index.js";
import { validateAoi } from "../guardrails/aoi.js";
import { sanitizeString } from "../guardrails/sanitize.js";
import type { ToolResponse } from "../types/response.js";

const GeoJsonPolygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
});

export const searchArchiveSchema = z.object({
  aoi: GeoJsonPolygonSchema.describe("GeoJSON Polygon defining the area of interest"),
  date_range: z
    .object({
      start: z.string().describe("Start date (YYYY-MM-DD)"),
      end: z.string().describe("End date (YYYY-MM-DD)"),
    })
    .optional(),
  resolution_tier: z
    .enum(["low", "medium", "high", "very_high"])
    .optional()
    .describe("Minimum resolution tier"),
  sensor_type: z
    .enum(["optical", "sar", "hyperspectral"])
    .optional()
    .describe("Sensor type filter"),
  page: z.number().int().min(1).default(1).optional(),
  limit: z.number().int().min(1).max(100).default(20).optional(),
});

export const exploreOpenDataSchema = z.object({
  provider: z.string().max(200).optional().describe("Filter by data provider name"),
  region: z.string().max(500).optional().describe("Filter by region name"),
  page: z.number().int().min(1).default(1).optional(),
  limit: z.number().int().min(1).max(100).default(20).optional(),
});

export const estimateArchivePriceSchema = z.object({
  scene_id: z.string().min(1).describe("Scene ID from search results"),
  aoi: GeoJsonPolygonSchema.describe("GeoJSON Polygon for the order area"),
  resolution_tier: z
    .enum(["low", "medium", "high", "very_high"])
    .optional()
    .describe("Resolution tier"),
});

export const estimateTaskingCostSchema = z.object({
  aoi: GeoJsonPolygonSchema.describe("GeoJSON Polygon for the tasking area"),
  sensor_type: z
    .enum(["optical", "sar", "hyperspectral"])
    .describe("Sensor type for tasking"),
  resolution_tier: z
    .enum(["low", "medium", "high", "very_high"])
    .optional()
    .describe("Desired resolution tier"),
});

export const checkCaptureFeasibilitySchema = z.object({
  aoi: GeoJsonPolygonSchema.describe("GeoJSON Polygon for the tasking area"),
  sensor_type: z
    .enum(["optical", "sar", "hyperspectral"])
    .describe("Sensor type for tasking"),
  desired_date_range: z
    .object({
      start: z.string().describe("Earliest acceptable capture date (YYYY-MM-DD)"),
      end: z.string().describe("Latest acceptable capture date (YYYY-MM-DD)"),
    })
    .optional(),
});

function skyfiErrorToEnvelope(err: unknown, tool: string, startTime: number): ToolResponse {
  if (err instanceof SkyFiApiError) {
    if (err.statusCode === 401) {
      return error({ tool, error: makeError("AUTH_INVALID"), startTime });
    }
    if (err.statusCode === 429) {
      return error({ tool, error: makeError("SKYFI_API_RATE_LIMIT"), startTime });
    }
    if (err.statusCode >= 500) {
      return error({ tool, error: makeError("SKYFI_API_UNAVAILABLE"), startTime });
    }
    return error({ tool, error: makeError("SKYFI_API_ERROR", err.message), startTime });
  }
  return error({
    tool,
    error: makeError("SKYFI_API_ERROR", "An unexpected error occurred."),
    startTime,
  });
}

export async function handleSearchArchive(
  args: z.infer<typeof searchArchiveSchema>,
  client: SkyFiClient,
): Promise<ToolResponse> {
  const startTime = Date.now();

  const aoiCheck = validateAoi(args.aoi, "archive");
  if (!aoiCheck.valid) {
    return error({ tool: "search_archive", error: makeError("AOI_TOO_LARGE", aoiCheck.error), startTime });
  }

  try {
    const response = await client.request<{
      results: unknown[];
      total: number;
      page: number;
    }>({
      method: "POST",
      path: "/v1/archive/search",
      body: {
        aoi: args.aoi,
        date_range: args.date_range,
        resolution_tier: args.resolution_tier,
        sensor_type: args.sensor_type,
        page: args.page ?? 1,
        limit: args.limit ?? 20,
      },
    });
    return success({
      tool: "search_archive",
      data: response.data as Record<string, unknown>,
      startTime,
      skyfiApiVersion: client.version,
    });
  } catch (err) {
    return skyfiErrorToEnvelope(err, "search_archive", startTime);
  }
}

export async function handleExploreOpenData(
  args: z.infer<typeof exploreOpenDataSchema>,
  client: SkyFiClient,
): Promise<ToolResponse> {
  const startTime = Date.now();

  if (args.provider) {
    const check = sanitizeString(args.provider, 200);
    if (!check.valid) {
      return error({ tool: "explore_open_data", error: makeError("STRING_TOO_LONG", check.error), startTime });
    }
  }

  try {
    const params: Record<string, string> = {};
    if (args.provider) params.provider = args.provider;
    if (args.region) params.region = args.region;
    params.page = String(args.page ?? 1);
    params.limit = String(args.limit ?? 20);

    const response = await client.request<{
      datasets: unknown[];
      total: number;
    }>({
      path: "/v1/open-data",
      params,
    });
    return success({
      tool: "explore_open_data",
      data: response.data as Record<string, unknown>,
      startTime,
      skyfiApiVersion: client.version,
    });
  } catch (err) {
    return skyfiErrorToEnvelope(err, "explore_open_data", startTime);
  }
}

export async function handleEstimateArchivePrice(
  args: z.infer<typeof estimateArchivePriceSchema>,
  client: SkyFiClient,
): Promise<ToolResponse> {
  const startTime = Date.now();

  const aoiCheck = validateAoi(args.aoi, "archive");
  if (!aoiCheck.valid) {
    return error({ tool: "estimate_archive_price", error: makeError("AOI_TOO_LARGE", aoiCheck.error), startTime });
  }

  try {
    const response = await client.request<{
      price_usd: number;
      area_km2: number;
      resolution_tier: string;
    }>({
      method: "POST",
      path: "/v1/archive/estimate",
      body: {
        scene_id: args.scene_id,
        aoi: args.aoi,
        resolution_tier: args.resolution_tier,
      },
    });
    return success({
      tool: "estimate_archive_price",
      data: response.data as Record<string, unknown>,
      startTime,
      skyfiApiVersion: client.version,
    });
  } catch (err) {
    return skyfiErrorToEnvelope(err, "estimate_archive_price", startTime);
  }
}

export async function handleEstimateTaskingCost(
  args: z.infer<typeof estimateTaskingCostSchema>,
  client: SkyFiClient,
): Promise<ToolResponse> {
  const startTime = Date.now();

  const aoiCheck = validateAoi(args.aoi, "tasking");
  if (!aoiCheck.valid) {
    return error({ tool: "estimate_tasking_cost", error: makeError("AOI_TOO_LARGE", aoiCheck.error), startTime });
  }

  try {
    const response = await client.request<{
      estimated_cost_usd: number;
      area_km2: number;
      sensor_type: string;
    }>({
      method: "POST",
      path: "/v1/tasking/estimate",
      body: {
        aoi: args.aoi,
        sensor_type: args.sensor_type,
        resolution_tier: args.resolution_tier,
      },
    });
    return success({
      tool: "estimate_tasking_cost",
      data: response.data as Record<string, unknown>,
      startTime,
      skyfiApiVersion: client.version,
    });
  } catch (err) {
    return skyfiErrorToEnvelope(err, "estimate_tasking_cost", startTime);
  }
}

export async function handleCheckCaptureFeasibility(
  args: z.infer<typeof checkCaptureFeasibilitySchema>,
  client: SkyFiClient,
): Promise<ToolResponse> {
  const startTime = Date.now();

  const aoiCheck = validateAoi(args.aoi, "tasking");
  if (!aoiCheck.valid) {
    return error({ tool: "check_capture_feasibility", error: makeError("AOI_TOO_LARGE", aoiCheck.error), startTime });
  }

  try {
    const response = await client.request<{
      feasible: boolean;
      satellite_passes: unknown[];
      cloud_cover_forecast: unknown;
      next_available_window: string;
      summary: string;
    }>({
      method: "POST",
      path: "/v1/tasking/feasibility",
      body: {
        aoi: args.aoi,
        sensor_type: args.sensor_type,
        desired_date_range: args.desired_date_range,
      },
    });
    return success({
      tool: "check_capture_feasibility",
      data: response.data as Record<string, unknown>,
      startTime,
      skyfiApiVersion: client.version,
    });
  } catch (err) {
    return skyfiErrorToEnvelope(err, "check_capture_feasibility", startTime);
  }
}
