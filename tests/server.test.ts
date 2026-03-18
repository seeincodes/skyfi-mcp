import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";

const mockConfig = {
  api_key: "sk_test_e2e",
  api_base_url: "https://api.skyfi.test",
  api_version: "2026-03",
  simulate: false,
};

describe("MCP Server integration", () => {
  let client: Client;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(async () => {
    originalFetch = globalThis.fetch;

    const server = createServer(mockConfig);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: "test-client", version: "1.0.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("lists all 16 registered tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toContain("geocode");
    expect(names).toContain("reverse_geocode");
    expect(names).toContain("get_bounding_box");
    expect(names).toContain("search_archive");
    expect(names).toContain("explore_open_data");
    expect(names).toContain("estimate_archive_price");
    expect(names).toContain("estimate_tasking_cost");
    expect(names).toContain("check_capture_feasibility");
    expect(names).toContain("quote_archive_order");
    expect(names).toContain("execute_archive_order");
    expect(names).toContain("quote_tasking_order");
    expect(names).toContain("execute_tasking_order");
    expect(names).toContain("get_order_status");
    expect(names).toContain("list_orders");
    expect(names).toContain("fetch_order_image");
    expect(tools.length).toBe(18);
  });

  it("each tool has a description", async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.description!.length).toBeGreaterThan(20);
    }
  });

  it("execute_archive_order and execute_tasking_order have destructiveHint", async () => {
    const { tools } = await client.listTools();
    const execArchive = tools.find((t) => t.name === "execute_archive_order");
    const execTasking = tools.find((t) => t.name === "execute_tasking_order");
    expect(execArchive?.annotations?.destructiveHint).toBe(true);
    expect(execTasking?.annotations?.destructiveHint).toBe(true);
  });

  it("e2e: geocode → search_archive → quote → execute", async () => {
    // Mock geocode (Nominatim)
    const geocodeMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([
          {
            place_id: 1,
            display_name: "Rotterdam, Netherlands",
            lat: "51.9",
            lon: "4.5",
            boundingbox: ["51.85", "51.95", "4.4", "4.6"],
            type: "city",
            class: "place",
          },
        ]),
    });

    const searchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () =>
        Promise.resolve({
          results: [{ scene_id: "s_1", price_usd: 45 }],
          total: 1,
          page: 1,
        }),
      text: () => Promise.resolve("{}"),
    });

    const executeMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () =>
        Promise.resolve({
          orderId: "ord_test",
          status: "PENDING",
          totalPrice: 45,
        }),
      text: () => Promise.resolve("{}"),
    });

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("nominatim")) return geocodeMock();
      if (url.includes("/archives")) return searchMock();
      return executeMock();
    });

    // Step 1: Geocode
    const geocodeResult = await client.callTool({
      name: "geocode",
      arguments: { query: "Rotterdam" },
    });
    const geocodeData = JSON.parse((geocodeResult.content as { type: string; text: string }[])[0].text);
    expect(geocodeData.status).toBe("success");

    // Step 2: Search
    const searchResult = await client.callTool({
      name: "search_archive",
      arguments: {
        aoi: {
          type: "Polygon",
          coordinates: [
            [
              [4.4, 51.85],
              [4.6, 51.85],
              [4.6, 51.95],
              [4.4, 51.95],
              [4.4, 51.85],
            ],
          ],
        },
      },
    });
    const searchData = JSON.parse((searchResult.content as { type: string; text: string }[])[0].text);
    expect(searchData.status).toBe("success");

    // Step 3: Quote (client-side, no API call)
    const quoteResult = await client.callTool({
      name: "quote_archive_order",
      arguments: {
        archive_id: "arch_s_1",
        aoi: {
          type: "Polygon",
          coordinates: [
            [
              [4.4, 51.85],
              [4.6, 51.85],
              [4.6, 51.95],
              [4.4, 51.95],
              [4.4, 51.85],
            ],
          ],
        },
        price_per_sqkm_usd: 10.0,
        price_full_scene_usd: 500.0,
        overlap_sqkm: 4.5,
      },
    });
    const quoteData = JSON.parse((quoteResult.content as { type: string; text: string }[])[0].text);
    expect(quoteData.status).toBe("success");
    expect(quoteData.data.archive_id).toBe("arch_s_1");
    expect(quoteData.data.estimated_price_usd).toBeCloseTo(45.0);

    // Step 4: Execute with confirmation
    const executeResult = await client.callTool({
      name: "execute_archive_order",
      arguments: {
        archive_id: "arch_s_1",
        aoi: {
          type: "Polygon",
          coordinates: [
            [
              [4.4, 51.85],
              [4.6, 51.85],
              [4.6, 51.95],
              [4.4, 51.95],
              [4.4, 51.85],
            ],
          ],
        },
        user_confirmed: true,
      },
    });
    const executeData = JSON.parse((executeResult.content as { type: string; text: string }[])[0].text);
    expect(executeData.status).toBe("success");
    expect(executeData.data.orderId).toBe("ord_test");
  });
});
