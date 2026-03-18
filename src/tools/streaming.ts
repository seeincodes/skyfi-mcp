import { SkyFiClient, SkyFiApiError } from "../clients/skyfi.js";
import { success, error, makeError } from "../envelope/index.js";
import { validateAoi } from "../guardrails/aoi.js";
import type { ToolResponse } from "../types/response.js";

export type ProgressCallback = (progress: number, total: number, message: string) => void;

export interface StreamingSearchResult {
  response: ToolResponse;
  pages: number;
}

export async function streamSearchArchive(
  args: {
    aoi: GeoJSON.Polygon;
    date_range?: { start: string; end: string };
    resolution_tier?: string;
    sensor_type?: string;
    max_pages?: number;
  },
  client: SkyFiClient,
  onProgress?: ProgressCallback,
): Promise<StreamingSearchResult> {
  const startTime = Date.now();
  const maxPages = args.max_pages ?? 5;

  const aoiCheck = validateAoi(args.aoi, "archive");
  if (!aoiCheck.valid) {
    return {
      response: error({ tool: "search_archive", error: makeError("AOI_TOO_LARGE", aoiCheck.error), startTime }),
      pages: 0,
    };
  }

  const allResults: unknown[] = [];
  let totalResults = 0;
  let page = 1;

  try {
    while (page <= maxPages) {
      onProgress?.(page, maxPages, `Fetching page ${page}...`);

      const response = await client.request<{
        results: unknown[];
        total: number;
        page: number;
        has_more: boolean;
      }>({
        method: "POST",
        path: "/v1/archive/search",
        body: {
          aoi: args.aoi,
          date_range: args.date_range,
          resolution_tier: args.resolution_tier,
          sensor_type: args.sensor_type,
          page,
          limit: 20,
        },
      });

      allResults.push(...response.data.results);
      totalResults = response.data.total;

      if (!response.data.has_more || page >= maxPages) break;
      page++;
    }

    onProgress?.(page, page, `Search complete. ${allResults.length} results found.`);

    return {
      response: success({
        tool: "search_archive",
        data: { results: allResults, total: totalResults, pages_fetched: page },
        startTime,
        skyfiApiVersion: client.version,
      }),
      pages: page,
    };
  } catch (err) {
    if (err instanceof SkyFiApiError) {
      if (err.statusCode === 401) return { response: error({ tool: "search_archive", error: makeError("AUTH_INVALID"), startTime }), pages: page };
      if (err.statusCode >= 500) return { response: error({ tool: "search_archive", error: makeError("SKYFI_API_UNAVAILABLE"), startTime }), pages: page };
    }
    return { response: error({ tool: "search_archive", error: makeError("SKYFI_API_ERROR"), startTime }), pages: page };
  }
}

export async function streamFeasibilityCheck(
  args: {
    aoi: GeoJSON.Polygon;
    sensor_type: string;
    desired_date_range?: { start: string; end: string };
  },
  client: SkyFiClient,
  onProgress?: ProgressCallback,
): Promise<ToolResponse> {
  const startTime = Date.now();

  const aoiCheck = validateAoi(args.aoi, "tasking");
  if (!aoiCheck.valid) {
    return error({ tool: "check_capture_feasibility", error: makeError("AOI_TOO_LARGE", aoiCheck.error), startTime });
  }

  try {
    onProgress?.(1, 3, "Calculating satellite pass schedule...");

    const passResponse = await client.request<{ passes: unknown[] }>({
      method: "POST",
      path: "/v1/tasking/passes",
      body: { aoi: args.aoi, sensor_type: args.sensor_type, desired_date_range: args.desired_date_range },
    });

    onProgress?.(2, 3, "Fetching cloud cover forecast...");

    const cloudResponse = await client.request<{ forecast: unknown }>({
      method: "POST",
      path: "/v1/tasking/cloud-forecast",
      body: { aoi: args.aoi, desired_date_range: args.desired_date_range },
    });

    onProgress?.(3, 3, "Generating feasibility summary...");

    const feasible = (passResponse.data.passes as unknown[]).length > 0;
    const summary = feasible
      ? `Feasible. ${(passResponse.data.passes as unknown[]).length} satellite passes available.`
      : "Not feasible in the requested window. No satellite passes available.";

    return success({
      tool: "check_capture_feasibility",
      data: {
        feasible,
        satellite_passes: passResponse.data.passes,
        cloud_cover_forecast: cloudResponse.data.forecast,
        summary,
      },
      startTime,
      skyfiApiVersion: client.version,
    });
  } catch (err) {
    if (err instanceof SkyFiApiError) {
      if (err.statusCode === 401) return error({ tool: "check_capture_feasibility", error: makeError("AUTH_INVALID"), startTime });
      if (err.statusCode >= 500) return error({ tool: "check_capture_feasibility", error: makeError("SKYFI_API_UNAVAILABLE"), startTime });
    }
    return error({ tool: "check_capture_feasibility", error: makeError("SKYFI_API_ERROR"), startTime });
  }
}

export async function pollOrderStatus(
  args: { order_id: string; max_polls?: number; interval_ms?: number },
  client: SkyFiClient,
  onProgress?: ProgressCallback,
): Promise<ToolResponse> {
  const startTime = Date.now();
  const maxPolls = args.max_polls ?? 10;
  const intervalMs = args.interval_ms ?? 2000;
  const terminalStatuses = new Set(["delivered", "failed", "cancelled"]);

  let lastStatus = "";
  let pollCount = 0;

  try {
    while (pollCount < maxPolls) {
      pollCount++;
      onProgress?.(pollCount, maxPolls, `Polling status (attempt ${pollCount})...`);

      const response = await client.request<{
        order_id: string;
        status: string;
        progress_pct: number;
        updated_at: string;
        estimated_delivery: string;
      }>({
        path: `/v1/orders/${encodeURIComponent(args.order_id)}`,
      });

      lastStatus = response.data.status;

      if (terminalStatuses.has(lastStatus)) {
        onProgress?.(pollCount, pollCount, `Order ${lastStatus}.`);
        return success({
          tool: "get_order_status",
          data: { ...response.data as Record<string, unknown>, polls: pollCount },
          startTime,
          skyfiApiVersion: client.version,
        });
      }

      if (pollCount < maxPolls) {
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    }

    // Reached max polls without terminal status
    return success({
      tool: "get_order_status",
      data: { order_id: args.order_id, status: lastStatus, polls: pollCount, message: "Max polls reached. Order still in progress." },
      startTime,
      skyfiApiVersion: client.version,
    });
  } catch (err) {
    if (err instanceof SkyFiApiError) {
      if (err.statusCode === 401) return error({ tool: "get_order_status", error: makeError("AUTH_INVALID"), startTime });
      if (err.statusCode >= 500) return error({ tool: "get_order_status", error: makeError("SKYFI_API_UNAVAILABLE"), startTime });
    }
    return error({ tool: "get_order_status", error: makeError("SKYFI_API_ERROR"), startTime });
  }
}
