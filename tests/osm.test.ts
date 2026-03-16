import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NominatimClient } from "../src/clients/nominatim.js";
import { handleGeocode, handleReverseGeocode, handleGetBoundingBox } from "../src/tools/osm.js";

const MOCK_RESULT = {
  place_id: 12345,
  display_name: "Port of Rotterdam, Rotterdam, South Holland, Netherlands",
  lat: "51.9036",
  lon: "4.4993",
  boundingbox: ["51.8654", "51.9701", "4.2389", "4.6012"] as [string, string, string, string],
  type: "port",
  class: "place",
};

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

describe("NominatimClient", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("geocode returns results", async () => {
    globalThis.fetch = mockFetch([MOCK_RESULT]);
    const client = new NominatimClient(60000);
    const results = await client.geocode("Port of Rotterdam");
    expect(results).toHaveLength(1);
    expect(results[0].display_name).toContain("Rotterdam");
  });

  it("geocode caches results", async () => {
    const spy = mockFetch([MOCK_RESULT]);
    globalThis.fetch = spy;
    const client = new NominatimClient(60000);
    await client.geocode("Rotterdam");
    await client.geocode("Rotterdam");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("reverseGeocode returns a result", async () => {
    globalThis.fetch = mockFetch(MOCK_RESULT);
    const client = new NominatimClient(60000);
    const result = await client.reverseGeocode(51.9036, 4.4993);
    expect(result).not.toBeNull();
    expect(result!.display_name).toContain("Rotterdam");
  });

  it("getBoundingBox returns bbox", async () => {
    globalThis.fetch = mockFetch([MOCK_RESULT]);
    const client = new NominatimClient(60000);
    const result = await client.getBoundingBox("Rotterdam");
    expect(result).not.toBeNull();
    expect(result!.south).toBeCloseTo(51.8654);
    expect(result!.north).toBeCloseTo(51.9701);
    expect(result!.west).toBeCloseTo(4.2389);
    expect(result!.east).toBeCloseTo(4.6012);
  });

  it("getBoundingBox returns null for no results", async () => {
    globalThis.fetch = mockFetch([]);
    const client = new NominatimClient(60000);
    const result = await client.getBoundingBox("xyznonexistent");
    expect(result).toBeNull();
  });
});

describe("OSM tool handlers", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("handleGeocode returns success envelope", async () => {
    globalThis.fetch = mockFetch([MOCK_RESULT]);
    const client = new NominatimClient(60000);
    const result = await handleGeocode({ query: "Rotterdam" }, client);
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.tool).toBe("geocode");
      expect(result.data.lat).toBeCloseTo(51.9036);
      expect(result.data.lng).toBeCloseTo(4.4993);
    }
  });

  it("handleGeocode returns error for no results", async () => {
    globalThis.fetch = mockFetch([]);
    const client = new NominatimClient(60000);
    const result = await handleGeocode({ query: "xyznonexistent" }, client);
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.code).toBe("GEOCODING_FAILED");
    }
  });

  it("handleReverseGeocode returns success envelope", async () => {
    globalThis.fetch = mockFetch(MOCK_RESULT);
    const client = new NominatimClient(60000);
    const result = await handleReverseGeocode({ lat: 51.9036, lon: 4.4993 }, client);
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.tool).toBe("reverse_geocode");
      expect(result.data.display_name).toContain("Rotterdam");
    }
  });

  it("handleGetBoundingBox returns success with geojson polygon", async () => {
    globalThis.fetch = mockFetch([MOCK_RESULT]);
    const client = new NominatimClient(60000);
    const result = await handleGetBoundingBox({ query: "Rotterdam" }, client);
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.tool).toBe("get_bounding_box");
      expect(result.data.bbox).toHaveLength(4);
      expect((result.data.geojson as { type: string }).type).toBe("Polygon");
    }
  });

  it("handleGetBoundingBox returns error for no results", async () => {
    globalThis.fetch = mockFetch([]);
    const client = new NominatimClient(60000);
    const result = await handleGetBoundingBox({ query: "nonexistent" }, client);
    expect(result.status).toBe("error");
  });
});
