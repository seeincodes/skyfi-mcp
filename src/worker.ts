import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { extractAndValidateApiKey } from "./auth/header.js";
import { TokenStore } from "./auth/token-store.js";
import { createServer } from "./server.js";

interface Env {
  SKYFI_API_BASE_URL?: string;
  SKYFI_API_VERSION?: string;
  SKYFI_SIMULATE?: string;
  MCP_SERVER_SECRET?: string;
  SKYFI_TOKENS?: KVNamespace;
}

// Per-isolate token store (in-memory; KV integration is a future enhancement)
let tokenStore: TokenStore | null = null;

function getTokenStore(env: Env): TokenStore {
  const secret = env.MCP_SERVER_SECRET ?? "dev-secret-change-in-production";
  if (!tokenStore) {
    tokenStore = new TokenStore(secret);
  }
  return tokenStore;
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

    const store = getTokenStore(env);
    const defaults = {
      api_base_url: env.SKYFI_API_BASE_URL,
      api_version: env.SKYFI_API_VERSION,
      simulate: env.SKYFI_SIMULATE === "true",
    };

    if (request.method === "POST") {
      const mcpToken = request.headers.get("x-mcp-token");
      const rawApiKey = request.headers.get("x-skyfi-api-key");

      // Path 1: MCP token provided — resolve to API key
      if (mcpToken) {
        const resolution = store.resolve(mcpToken);
        if (!resolution.valid) {
          return new Response(
            JSON.stringify({
              status: "error",
              error: {
                code: mcpToken.startsWith("mcp_") ? "TOKEN_EXPIRED" : "TOKEN_INVALID",
                message: resolution.error,
                recoverable: mcpToken.startsWith("mcp_"),
              },
            }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }

        const mcpServer = createServer({
          api_key: resolution.apiKey!,
          api_base_url: defaults.api_base_url ?? "https://app.skyfi.com/platform-api",
          api_version: defaults.api_version ?? "2026-03",
          simulate: defaults.simulate ?? false,
        });

        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        await mcpServer.server.connect(transport);
        return transport.handleRequest(request);
      }

      // Path 2: Raw API key — only for initialize (first request). Issue session token.
      if (rawApiKey) {
        const authResult = extractAndValidateApiKey(rawApiKey, defaults);
        if (!authResult.valid) {
          return new Response(
            JSON.stringify({
              status: "error",
              error: { code: "AUTH_MISSING", message: authResult.error, recoverable: false },
            }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }

        // Issue a session token for this API key
        const sessionToken = store.issueSessionToken(authResult.config!.api_key);

        // Create server with the validated key
        const mcpServer = createServer(authResult.config!);
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        await mcpServer.server.connect(transport);

        // Process the request normally, then inject the token into the response
        const response = await transport.handleRequest(request);

        // Clone response and add the MCP token header
        const newHeaders = new Headers(response.headers);
        newHeaders.set("X-MCP-Token", sessionToken);
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      }

      // Path 3: Neither header
      return new Response(
        JSON.stringify({
          status: "error",
          error: {
            code: "AUTH_MISSING",
            message: "Provide X-SkyFi-API-Key (first request) or X-MCP-Token (subsequent requests).",
            recoverable: false,
          },
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    // DELETE — requires MCP token
    if (request.method === "DELETE") {
      const mcpToken = request.headers.get("x-mcp-token");
      if (!mcpToken) {
        return new Response(
          JSON.stringify({
            status: "error",
            error: { code: "AUTH_MISSING", message: "X-MCP-Token required.", recoverable: false },
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }
      const resolution = store.resolve(mcpToken);
      if (!resolution.valid) {
        return new Response(
          JSON.stringify({ status: "error", error: { code: "TOKEN_EXPIRED", message: resolution.error, recoverable: true } }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }
      const mcpServer = createServer({
        api_key: resolution.apiKey!,
        api_base_url: defaults.api_base_url ?? "https://app.skyfi.com/platform-api",
        api_version: defaults.api_version ?? "2026-03",
        simulate: defaults.simulate ?? false,
      });
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await mcpServer.server.connect(transport);
      return transport.handleRequest(request);
    }

    // GET — SSE streams (require MCP token in query param for SSE reconnection)
    if (request.method === "GET") {
      const mcpToken = url.searchParams.get("token") ?? request.headers.get("x-mcp-token");
      if (mcpToken) {
        const resolution = store.resolve(mcpToken);
        if (resolution.valid) {
          const mcpServer = createServer({
            api_key: resolution.apiKey!,
            api_base_url: defaults.api_base_url ?? "https://app.skyfi.com/platform-api",
            api_version: defaults.api_version ?? "2026-03",
            simulate: defaults.simulate ?? false,
          });
          const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
          await mcpServer.server.connect(transport);
          return transport.handleRequest(request);
        }
      }
      return new Response(
        JSON.stringify({ status: "error", error: { code: "AUTH_MISSING", message: "X-MCP-Token required for SSE.", recoverable: false } }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response("Method not allowed", { status: 405 });
  },
};
