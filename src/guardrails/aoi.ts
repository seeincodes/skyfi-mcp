import { area as turfArea } from "@turf/turf";

const KM2_PER_M2 = 1e-6;

export interface AoiLimits {
  maxArchiveKm2: number;
  maxTaskingKm2: number;
}

export const DEFAULT_AOI_LIMITS: AoiLimits = {
  maxArchiveKm2: 50_000,
  maxTaskingKm2: 10_000,
};

export interface AoiValidationResult {
  valid: boolean;
  areaKm2: number;
  error?: string;
}

export function validateAoi(
  geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  context: "archive" | "tasking",
  limits: AoiLimits = DEFAULT_AOI_LIMITS,
): AoiValidationResult {
  const areaM2 = turfArea(geojson);
  const areaKm2 = areaM2 * KM2_PER_M2;
  const maxKm2 = context === "archive" ? limits.maxArchiveKm2 : limits.maxTaskingKm2;

  if (areaKm2 > maxKm2) {
    return {
      valid: false,
      areaKm2,
      error:
        `AOI area (${areaKm2.toFixed(1)} km²) exceeds the ${maxKm2.toLocaleString()} km² limit ` +
        `for ${context} operations. Reduce the polygon size or split into smaller regions.`,
    };
  }

  return { valid: true, areaKm2 };
}
