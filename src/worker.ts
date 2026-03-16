import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { extractAndValidateApiKey } from "./auth/header.js";
import { createServer } from "./server.js";

interface Env {
  SKYFI_API_BASE_URL?: string;
  SKYFI_API_VERSION?: string;
  SKYFI_SIMULATE?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/health" && request.method === "GET") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Only handle /mcp path
    if (url.pathname !== "/mcp") {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Auth for POST/DELETE
    if (request.method === "POST" || request.method === "DELETE") {
      const authResult = extractAndValidateApiKey(request.headers.get("x-skyfi-api-key") ?? undefined, {
        api_base_url: env.SKYFI_API_BASE_URL,
        api_version: env.SKYFI_API_VERSION,
        simulate: env.SKYFI_SIMULATE === "true",
      });

      if (!authResult.valid) {
        return new Response(
          JSON.stringify({
            status: "error",
            error: {
              code: "AUTH_MISSING",
              message: authResult.error,
              recoverable: false,
            },
          }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Per-request: create fresh MCP server scoped to this tenant's credentials
      const mcpServer = createServer(authResult.config!);

      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
      });

      await mcpServer.server.connect(transport);
      return transport.handleRequest(request);
    }

    // GET for SSE streams
    if (request.method === "GET") {
      const placeholderConfig = {
        api_key: "sse-placeholder",
        api_base_url: env.SKYFI_API_BASE_URL ?? "https://app.skyfi.com/platform-api",
        api_version: env.SKYFI_API_VERSION ?? "2026-03",
        simulate: env.SKYFI_SIMULATE === "true",
      };
      const mcpServer = createServer(placeholderConfig);
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await mcpServer.server.connect(transport);
      return transport.handleRequest(request);
    }

    return new Response("Method not allowed", { status: 405 });
  },
};
