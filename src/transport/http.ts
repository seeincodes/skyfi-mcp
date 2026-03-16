import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SkyFiClient } from "../clients/skyfi.js";
import { createServer as createMcpServer } from "../server.js";
import type { SkyFiConfig } from "../types/config.js";

const MCP_PATH = "/mcp";

export interface HttpTransportOptions {
  port: number;
  defaultConfig: Partial<SkyFiConfig>;
}

function extractApiKey(req: IncomingMessage): string | null {
  const header = req.headers["x-skyfi-api-key"];
  if (typeof header === "string" && header.length > 0) return header;
  return null;
}

export function startHttpTransport(options: HttpTransportOptions): ReturnType<typeof createHttpServer> {
  // Create a single MCP server instance with a placeholder config.
  // In stateless mode, each request gets its own transport but shares the server.
  // For per-request auth, we extract the API key from the header and build a config.
  const baseConfig: SkyFiConfig = {
    api_key: "placeholder",
    api_base_url: options.defaultConfig.api_base_url ?? "https://app.skyfi.com/platform-api",
    api_version: options.defaultConfig.api_version ?? "2026-03",
    simulate: options.defaultConfig.simulate ?? false,
  };

  const mcpServer = createMcpServer(baseConfig);

  const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Health check
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    // Only handle MCP path
    if (!req.url?.startsWith(MCP_PATH)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    // Extract and validate API key for non-GET requests
    if (req.method === "POST" || req.method === "DELETE") {
      const apiKey = extractApiKey(req);
      if (!apiKey) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "error",
            error: {
              code: "AUTH_MISSING",
              message: "Missing X-SkyFi-API-Key header. Provide a valid SkyFi API key.",
              recoverable: false,
            },
          }),
        );
        return;
      }

      // Attach auth info for the MCP SDK
      (req as IncomingMessage & { auth?: { apiKey: string } }).auth = { apiKey };
    }

    // Create a stateless transport for this request
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless mode
    });

    // Connect the server to this transport and handle the request
    await mcpServer.server.connect(transport);
    await transport.handleRequest(req, res);
  });

  httpServer.listen(options.port, () => {
    process.stderr.write(`SkyFi MCP HTTP server listening on port ${options.port}\n`);
  });

  return httpServer;
}
