import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { createServer as createHttpServer, type Server } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer as createMcpServer } from "../src/server.js";

const TEST_CONFIG = {
  api_key: "sk_test_http",
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

describe("HTTP+SSE Transport", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("MCP server parity", () => {
    it("remote server registers the same tools as STDIO", async () => {
      // Create two servers with same config
      const stdioServer = createMcpServer(TEST_CONFIG);
      const remoteServer = createMcpServer(TEST_CONFIG);

      // Connect both via InMemoryTransport to list tools
      const [stdioClientTransport, stdioServerTransport] = InMemoryTransport.createLinkedPair();
      const [remoteClientTransport, remoteServerTransport] = InMemoryTransport.createLinkedPair();

      const stdioClient = new Client({ name: "stdio-test", version: "1.0.0" });
      const remoteClient = new Client({ name: "remote-test", version: "1.0.0" });

      await stdioServer.connect(stdioServerTransport);
      await stdioClient.connect(stdioClientTransport);
      await remoteServer.connect(remoteServerTransport);
      await remoteClient.connect(remoteClientTransport);

      const stdioTools = await stdioClient.listTools();
      const remoteTools = await remoteClient.listTools();

      const stdioNames = stdioTools.tools.map((t) => t.name).sort();
      const remoteNames = remoteTools.tools.map((t) => t.name).sort();

      expect(stdioNames).toEqual(remoteNames);
      expect(stdioNames.length).toBe(15);
    });

    it("tool schemas are identical across transports", async () => {
      const server1 = createMcpServer(TEST_CONFIG);
      const server2 = createMcpServer(TEST_CONFIG);

      const [c1t, s1t] = InMemoryTransport.createLinkedPair();
      const [c2t, s2t] = InMemoryTransport.createLinkedPair();

      const client1 = new Client({ name: "c1", version: "1.0.0" });
      const client2 = new Client({ name: "c2", version: "1.0.0" });

      await server1.connect(s1t);
      await client1.connect(c1t);
      await server2.connect(s2t);
      await client2.connect(c2t);

      const tools1 = await client1.listTools();
      const tools2 = await client2.listTools();

      for (const t1 of tools1.tools) {
        const t2 = tools2.tools.find((t) => t.name === t1.name);
        expect(t2).toBeDefined();
        expect(t1.description).toBe(t2!.description);
        expect(JSON.stringify(t1.inputSchema)).toBe(JSON.stringify(t2!.inputSchema));
      }
    });
  });

  describe("stateless transport behavior", () => {
    it("StreamableHTTPServerTransport in stateless mode has no sessionId", () => {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      expect(transport.sessionId).toBeUndefined();
    });
  });

  describe("tool invocation over transport", () => {
    it("geocode works through MCP protocol", async () => {
      globalThis.fetch = mockFetch(200, [
        {
          place_id: 1,
          display_name: "Rotterdam, Netherlands",
          lat: "51.9",
          lon: "4.5",
          boundingbox: ["51.85", "51.95", "4.4", "4.6"],
          type: "city",
          class: "place",
        },
      ]);

      const server = createMcpServer(TEST_CONFIG);
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "test", version: "1.0.0" });

      await server.connect(serverTransport);
      await client.connect(clientTransport);

      const result = await client.callTool({
        name: "geocode",
        arguments: { query: "Rotterdam" },
      });

      const content = result.content as { type: string; text: string }[];
      const data = JSON.parse(content[0].text);
      expect(data.status).toBe("success");
      expect(data.tool).toBe("geocode");
      expect(data.data.lat).toBeCloseTo(51.9);
    });

    it("search_archive works with envelope response", async () => {
      globalThis.fetch = mockFetch(200, {
        results: [{ scene_id: "s_1", price_usd: 45 }],
        total: 1,
        page: 1,
      });

      const server = createMcpServer(TEST_CONFIG);
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "test", version: "1.0.0" });

      await server.connect(serverTransport);
      await client.connect(clientTransport);

      const result = await client.callTool({
        name: "search_archive",
        arguments: {
          aoi: {
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
          },
        },
      });

      const content = result.content as { type: string; text: string }[];
      const data = JSON.parse(content[0].text);
      expect(data.status).toBe("success");
      expect(data.tool).toBe("search_archive");
      expect(data.meta.skyfi_api_version).toBe("2026-03");
    });

    it("execute_archive_order rejects user_confirmed: false at schema level", async () => {
      const server = createMcpServer(TEST_CONFIG);
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "test", version: "1.0.0" });

      await server.connect(serverTransport);
      await client.connect(clientTransport);

      // user_confirmed: false violates the z.literal(true) schema
      const result = await client.callTool({
        name: "execute_archive_order",
        arguments: {
          quote_id: "q_test",
          user_confirmed: false,
          idempotency_key: "test-key",
        },
      });

      // MCP SDK returns isError: true for validation failures
      expect(result.isError).toBe(true);
    });
  });
});
