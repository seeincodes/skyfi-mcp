import { z } from "zod";
import { NominatimClient } from "../clients/nominatim.js";
import { success, error, makeError } from "../envelope/index.js";
import type { ToolResponse } from "../types/response.js";

const nominatim = new NominatimClient();

export const geocodeSchema = z.object({
  query: z.string().min(1).max(500).describe("A human-readable location string, e.g. 'Port of Rotterdam'"),
});

export const reverseGeocodeSchema = z.object({
  lat: z.number().min(-90).max(90).describe("Latitude in decimal degrees"),
  lon: z.number().min(-180).max(180).describe("Longitude in decimal degrees"),
});

export const getBoundingBoxSchema = z.object({
  query: z.string().min(1).max(500).describe("A named place to look up a bounding box for"),
});

export async function handleGeocode(
  args: z.infer<typeof geocodeSchema>,
  client?: NominatimClient,
): Promise<ToolResponse> {
  const startTime = Date.now();
  const nom = client ?? nominatim;
  try {
    const results = await nom.geocode(args.query);
    if (results.length === 0) {
      return error({
        tool: "geocode",
        error: makeError("GEOCODING_FAILED"),
        startTime,
      });
    }
    const top = results[0];
    return success({
      tool: "geocode",
      data: {
        lat: parseFloat(top.lat),
        lng: parseFloat(top.lon),
        display_name: top.display_name,
        alternatives: results.slice(1).map((r) => ({
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lon),
          display_name: r.display_name,
        })),
      },
      startTime,
    });
  } catch {
    return error({ tool: "geocode", error: makeError("GEOCODING_FAILED"), startTime });
  }
}

export async function handleReverseGeocode(
  args: z.infer<typeof reverseGeocodeSchema>,
  client?: NominatimClient,
): Promise<ToolResponse> {
  const startTime = Date.now();
  const nom = client ?? nominatim;
  try {
    const result = await nom.reverseGeocode(args.lat, args.lon);
    if (!result) {
      return error({ tool: "reverse_geocode", error: makeError("GEOCODING_FAILED"), startTime });
    }
    return success({
      tool: "reverse_geocode",
      data: {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        display_name: result.display_name,
      },
      startTime,
    });
  } catch {
    return error({ tool: "reverse_geocode", error: makeError("GEOCODING_FAILED"), startTime });
  }
}

export async function handleGetBoundingBox(
  args: z.infer<typeof getBoundingBoxSchema>,
  client?: NominatimClient,
): Promise<ToolResponse> {
  const startTime = Date.now();
  const nom = client ?? nominatim;
  try {
    const result = await nom.getBoundingBox(args.query);
    if (!result) {
      return error({ tool: "get_bounding_box", error: makeError("GEOCODING_FAILED"), startTime });
    }
    const bbox = [result.west, result.south, result.east, result.north];
    const polygon = {
      type: "Polygon" as const,
      coordinates: [
        [
          [result.west, result.south],
          [result.east, result.south],
          [result.east, result.north],
          [result.west, result.north],
          [result.west, result.south],
        ],
      ],
    };
    return success({
      tool: "get_bounding_box",
      data: {
        bbox,
        geojson: polygon,
        display_name: result.display_name,
      },
      startTime,
    });
  } catch {
    return error({ tool: "get_bounding_box", error: makeError("GEOCODING_FAILED"), startTime });
  }
}
