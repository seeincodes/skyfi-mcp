import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SkyFiClient } from "../src/clients/skyfi.js";
import {
  handleSearchArchive,
  handleExploreOpenData,
  handleEstimateArchivePrice,
  handleEstimateTaskingCost,
  handleCheckCaptureFeasibility,
} from "../src/tools/discovery.js";

const SMALL_AOI: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [4.47, 51.92],
      [4.48, 51.92],
      [4.48, 51.93],
      [4.47, 51.93],
      [4.47, 51.92],
    ],
  ],
};

const HUGE_AOI: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [-5, 42],
      [10, 42],
      [10, 55],
      [-5, 55],
      [-5, 42],
    ],
  ],
};

const mockConfig = {
  api_key: "sk_test",
  api_base_url: "https://api.skyfi.test",
  api_version: "2026-03",
  simulate: false,
};

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

describe("search_archive", () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("returns success with search results", async () => {
    globalThis.fetch = mockFetch(200, {
      results: [{ scene_id: "s_1", price_usd: 45 }],
      total: 1,
      page: 1,
    });
    const client = new SkyFiClient(mockConfig);
    const result = await handleSearchArchive({ aoi: SMALL_AOI }, client);
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.tool).toBe("search_archive");
      expect((result.data.results as unknown[]).length).toBe(1);
    }
  });

  it("rejects oversized AOI", async () => {
    const client = new SkyFiClient(mockConfig);
    const result = await handleSearchArchive({ aoi: HUGE_AOI }, client);
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.code).toBe("AOI_TOO_LARGE");
    }
  });

  it("handles 401 from SkyFi API", async () => {
    globalThis.fetch = mockFetch(401, { error: "unauthorized" });
    const client = new SkyFiClient(mockConfig);
    const result = await handleSearchArchive({ aoi: SMALL_AOI }, client);
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.code).toBe("AUTH_INVALID");
    }
  });

  it("handles 429 from SkyFi API", async () => {
    globalThis.fetch = mockFetch(429, {});
    const client = new SkyFiClient(mockConfig);
    const result = await handleSearchArchive({ aoi: SMALL_AOI }, client);
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.code).toBe("SKYFI_API_RATE_LIMIT");
    }
  });

  it("handles 5xx from SkyFi API", async () => {
    globalThis.fetch = mockFetch(503, {});
    const client = new SkyFiClient(mockConfig);
    const result = await handleSearchArchive({ aoi: SMALL_AOI }, client);
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.code).toBe("SKYFI_API_UNAVAILABLE");
    }
  });
});

describe("explore_open_data", () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("returns success with datasets", async () => {
    globalThis.fetch = mockFetch(200, {
      datasets: [{ name: "Sentinel-2", provider: "ESA" }],
      total: 1,
    });
    const client = new SkyFiClient(mockConfig);
    const result = await handleExploreOpenData({}, client);
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.tool).toBe("explore_open_data");
    }
  });

  it("rejects oversized provider string", async () => {
    const client = new SkyFiClient(mockConfig);
    const result = await handleExploreOpenData({ provider: "a".repeat(201) }, client);
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.code).toBe("STRING_TOO_LONG");
    }
  });
});

describe("estimate_archive_price", () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("returns success with price estimate", async () => {
    globalThis.fetch = mockFetch(200, {
      price_usd: 45.0,
      area_km2: 0.85,
      resolution_tier: "high",
    });
    const client = new SkyFiClient(mockConfig);
    const result = await handleEstimateArchivePrice(
      { scene_id: "s_1", aoi: SMALL_AOI },
      client,
    );
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.data.price_usd).toBe(45.0);
    }
  });

  it("rejects oversized AOI", async () => {
    const client = new SkyFiClient(mockConfig);
    const result = await handleEstimateArchivePrice(
      { scene_id: "s_1", aoi: HUGE_AOI },
      client,
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.code).toBe("AOI_TOO_LARGE");
    }
  });
});

describe("estimate_tasking_cost", () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("returns success with cost estimate", async () => {
    globalThis.fetch = mockFetch(200, {
      estimated_cost_usd: 2500,
      area_km2: 50,
      sensor_type: "optical",
    });
    const client = new SkyFiClient(mockConfig);
    const result = await handleEstimateTaskingCost(
      { aoi: SMALL_AOI, sensor_type: "optical" },
      client,
    );
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.data.estimated_cost_usd).toBe(2500);
    }
  });

  it("uses tasking AOI limit (10,000 km²)", async () => {
    // Medium polygon > 10,000 km² but < 50,000 km²
    const mediumAoi: GeoJSON.Polygon = {
      type: "Polygon",
      coordinates: [
        [
          [4.0, 51.5],
          [6.0, 51.5],
          [6.0, 52.5],
          [4.0, 52.5],
          [4.0, 51.5],
        ],
      ],
    };
    const client = new SkyFiClient(mockConfig);
    const result = await handleEstimateTaskingCost(
      { aoi: mediumAoi, sensor_type: "sar" },
      client,
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.code).toBe("AOI_TOO_LARGE");
    }
  });
});

describe("check_capture_feasibility", () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("returns success with feasibility report", async () => {
    globalThis.fetch = mockFetch(200, {
      feasible: true,
      satellite_passes: [{ satellite: "SAT-1", date: "2026-03-20" }],
      cloud_cover_forecast: { avg_pct: 15 },
      next_available_window: "2026-03-19",
      summary: "Feasible. Low cloud cover expected.",
    });
    const client = new SkyFiClient(mockConfig);
    const result = await handleCheckCaptureFeasibility(
      { aoi: SMALL_AOI, sensor_type: "optical" },
      client,
    );
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.data.feasible).toBe(true);
      expect(result.data.summary).toContain("Feasible");
    }
  });

  it("rejects oversized AOI for tasking feasibility", async () => {
    const client = new SkyFiClient(mockConfig);
    const result = await handleCheckCaptureFeasibility(
      { aoi: HUGE_AOI, sensor_type: "optical" },
      client,
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.code).toBe("AOI_TOO_LARGE");
    }
  });
});
