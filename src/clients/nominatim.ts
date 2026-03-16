const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const USER_AGENT = "SkyFi-MCP-Server/0.1.0";
const MIN_REQUEST_INTERVAL_MS = 1000;

export interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  boundingbox: [string, string, string, string]; // [south, north, west, east]
  type: string;
  class: string;
}

export class NominatimClient {
  private lastRequestTime = 0;
  private cache = new Map<string, { data: NominatimResult[]; expiry: number }>();
  private readonly cacheTtlMs: number;

  constructor(cacheTtlMs = 5 * 60 * 1000) {
    this.cacheTtlMs = cacheTtlMs;
  }

  private getCached(key: string): NominatimResult[] | null {
    const entry = this.cache.get(key);
    if (!entry || Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  private setCache(key: string, data: NominatimResult[]): void {
    this.cache.set(key, { data, expiry: Date.now() + this.cacheTtlMs });
  }

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  async geocode(query: string): Promise<NominatimResult[]> {
    const cacheKey = `geocode:${query}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    await this.rateLimit();

    const url = new URL(`${NOMINATIM_BASE}/search`);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "5");

    const response = await fetch(url.toString(), {
      headers: { "User-Agent": USER_AGENT },
    });

    if (!response.ok) {
      throw new Error(`Nominatim geocoding failed (${response.status})`);
    }

    const results = (await response.json()) as NominatimResult[];
    this.setCache(cacheKey, results);
    return results;
  }

  async reverseGeocode(lat: number, lon: number): Promise<NominatimResult | null> {
    const cacheKey = `reverse:${lat},${lon}`;
    const cached = this.getCached(cacheKey);
    if (cached && cached.length > 0) return cached[0];

    await this.rateLimit();

    const url = new URL(`${NOMINATIM_BASE}/reverse`);
    url.searchParams.set("lat", lat.toString());
    url.searchParams.set("lon", lon.toString());
    url.searchParams.set("format", "json");

    const response = await fetch(url.toString(), {
      headers: { "User-Agent": USER_AGENT },
    });

    if (!response.ok) {
      throw new Error(`Nominatim reverse geocoding failed (${response.status})`);
    }

    const result = (await response.json()) as NominatimResult;
    if (!result.place_id) return null;
    this.setCache(cacheKey, [result]);
    return result;
  }

  async getBoundingBox(
    query: string,
  ): Promise<{ south: number; north: number; west: number; east: number; display_name: string } | null> {
    const results = await this.geocode(query);
    if (results.length === 0) return null;

    const best = results[0];
    const [south, north, west, east] = best.boundingbox.map(Number);
    return { south, north, west, east, display_name: best.display_name };
  }
}
