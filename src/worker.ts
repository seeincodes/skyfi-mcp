import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { extractAndValidateApiKey } from "./auth/header.js";
import { KVTokenStore } from "./auth/kv-token-store.js";
import { TokenStore } from "./auth/token-store.js";
import { createServer, type TokenManagement } from "./server.js";

interface Env {
  SKYFI_API_BASE_URL?: string;
  SKYFI_API_VERSION?: string;
  SKYFI_SIMULATE?: string;
  TOKEN_ENCRYPTION_SECRET?: string;
  SKYFI_TOKENS?: KVNamespace;
}

function buildTokenMgmt(
  store: KVTokenStore | TokenStore,
  apiKey: string,
  apiKeyHash: string,
  currentToken: string,
  isSession: boolean,
): TokenManagement {
  return {
    issueServiceToken: (name, scopes, budgetLimitUsd) =>
      Promise.resolve(store.issueServiceToken(apiKey, name, scopes, budgetLimitUsd)),
    listServiceTokens: () =>
      Promise.resolve(store.listServiceTokens(apiKeyHash)),
    revoke: (token) =>
      Promise.resolve(store.revoke(token)),
    revokeByName: (name) =>
      Promise.resolve(store.revokeByName(apiKeyHash, name)),
    isSession,
  };
}

function getStore(env: Env): KVTokenStore | TokenStore {
  const secret = env.TOKEN_ENCRYPTION_SECRET ?? "dev-secret-change-in-production";
  if (env.SKYFI_TOKENS) {
    return new KVTokenStore(secret, env.SKYFI_TOKENS);
  }
  return new TokenStore(secret);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.pathname !== "/mcp") {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const store = getStore(env);
    const defaults = {
      api_base_url: env.SKYFI_API_BASE_URL,
      api_version: env.SKYFI_API_VERSION,
      simulate: env.SKYFI_SIMULATE === "true",
    };

    if (request.method === "POST") {
      const mcpToken = request.headers.get("x-mcp-token");
      const rawApiKey = request.headers.get("x-skyfi-api-key");

      // Path 1: MCP token — resolve to API key
      if (mcpToken) {
        const resolution = await store.resolve(mcpToken);
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

        const tokenMgmt = buildTokenMgmt(
          store,
          resolution.apiKey!,
          resolution.apiKeyHash!,
          mcpToken,
          resolution.tokenType === "session",
        );
        const mcpServer = createServer({
          api_key: resolution.apiKey!,
          api_base_url: defaults.api_base_url ?? "https://app.skyfi.com/platform-api",
          api_version: defaults.api_version ?? "2026-03",
          simulate: defaults.simulate ?? false,
        }, tokenMgmt);

        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        await mcpServer.server.connect(transport);
        return transport.handleRequest(request);
      }

      // Path 2: Raw API key — validate and issue session token
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

        const sessionToken = await store.issueSessionToken(authResult.config!.api_key);
        const { hmacHash } = await import("./auth/crypto.js");
        const secret = (env as Env & { TOKEN_ENCRYPTION_SECRET?: string }).TOKEN_ENCRYPTION_SECRET ?? "dev-secret-change-in-production";
        const apiKeyHash = hmacHash(authResult.config!.api_key, secret);
        const tokenMgmt = buildTokenMgmt(store, authResult.config!.api_key, apiKeyHash, sessionToken, true);

        const mcpServer = createServer(authResult.config!, tokenMgmt);
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        await mcpServer.server.connect(transport);

        const response = await transport.handleRequest(request);

        const newHeaders = new Headers(response.headers);
        newHeaders.set("X-MCP-Token", sessionToken);
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      }

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
      const resolution = await store.resolve(mcpToken);
      if (!resolution.valid) {
        return new Response(
          JSON.stringify({
            status: "error",
            error: { code: "TOKEN_EXPIRED", message: resolution.error, recoverable: true },
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
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await mcpServer.server.connect(transport);
      return transport.handleRequest(request);
    }

    // GET — SSE streams
    if (request.method === "GET") {
      const mcpToken = url.searchParams.get("token") ?? request.headers.get("x-mcp-token");
      if (mcpToken) {
        const resolution = await store.resolve(mcpToken);
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
        JSON.stringify({
          status: "error",
          error: { code: "AUTH_MISSING", message: "X-MCP-Token required for SSE.", recoverable: false },
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response("Method not allowed", { status: 405 });
  },
};
