import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { extractAndValidateApiKey } from "../auth/header.js";
import { createServer as createMcpServer } from "../server.js";
import type { SkyFiConfig } from "../types/config.js";

const MCP_PATH = "/mcp";

export interface HttpTransportOptions {
  port: number;
  defaultConfig: Partial<SkyFiConfig>;
}

export function startHttpTransport(options: HttpTransportOptions): ReturnType<typeof createHttpServer> {
  const defaults = {
    api_base_url: options.defaultConfig.api_base_url,
    api_version: options.defaultConfig.api_version,
    simulate: options.defaultConfig.simulate,
  };

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
      const authResult = extractAndValidateApiKey(req.headers["x-skyfi-api-key"], defaults);
      if (!authResult.valid) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "error",
            error: {
              code: "AUTH_MISSING",
              message: authResult.error,
              recoverable: false,
            },
          }),
        );
        return;
      }

      // Per-request: create a fresh MCP server with this request's credentials.
      // No mutable shared auth state — each request gets its own SkyFi client.
      const mcpServer = createMcpServer(authResult.config!);

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless mode
      });

      await mcpServer.server.connect(transport);
      await transport.handleRequest(req, res);
      return;
    }

    // GET requests for SSE (no auth required for initial connection)
    // Create a placeholder server for SSE notification streams
    const placeholderConfig: SkyFiConfig = {
      api_key: "sse-placeholder",
      api_base_url: defaults.api_base_url ?? "https://app.skyfi.com/platform-api",
      api_version: defaults.api_version ?? "2026-03",
      simulate: defaults.simulate ?? false,
    };
    const mcpServer = createMcpServer(placeholderConfig);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await mcpServer.server.connect(transport);
    await transport.handleRequest(req, res);
  });

  httpServer.listen(options.port, () => {
    process.stderr.write(`SkyFi MCP HTTP server listening on port ${options.port}\n`);
  });

  return httpServer;
}
