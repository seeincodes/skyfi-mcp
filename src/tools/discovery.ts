import { z } from "zod";
import { SkyFiClient, SkyFiApiError } from "../clients/skyfi.js";
import { success, error, makeError } from "../envelope/index.js";
import { validateAoi, polygonToWkt } from "../guardrails/aoi.js";
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
      archives: unknown[];
      nextPage: string | null;
      total: number | null;
    }>({
      method: "POST",
      path: "/archives",
      body: {
        aoi: polygonToWkt(args.aoi as GeoJSON.Polygon),
        fromDate: args.date_range?.start ? `${args.date_range.start}T00:00:00` : undefined,
        toDate: args.date_range?.end ? `${args.date_range.end}T23:59:59` : undefined,
        resolutions: args.resolution_tier ? [args.resolution_tier.toUpperCase().replace("_", " ")] : undefined,
        pageSize: args.limit ?? 20,
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
      archives: unknown[];
      nextPage: string | null;
    }>({
      method: "POST",
      path: "/archives",
      body: {
        openData: true,
        ...(args.provider ? { providers: [args.provider] } : {}),
        pageSize: args.limit ?? 20,
      },
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
    const response = await client.request<Record<string, unknown>>({
      method: "POST",
      path: "/pricing",
      body: {
        aoi: polygonToWkt(args.aoi as GeoJSON.Polygon),
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
    const response = await client.request<Record<string, unknown>>({
      method: "POST",
      path: "/pricing",
      body: {
        aoi: polygonToWkt(args.aoi as GeoJSON.Polygon),
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
    const response = await client.request<Record<string, unknown>>({
      method: "POST",
      path: "/feasibility",
      body: {
        aoi: polygonToWkt(args.aoi as GeoJSON.Polygon),
        productType: args.sensor_type?.toUpperCase() ?? "DAY",
        startDate: args.desired_date_range?.start
          ? `${args.desired_date_range.start}T00:00:00+00:00`
          : new Date().toISOString(),
        endDate: args.desired_date_range?.end
          ? `${args.desired_date_range.end}T23:59:59+00:00`
          : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
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
