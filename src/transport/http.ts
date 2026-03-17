import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { extractAndValidateApiKey } from "../auth/header.js";
import { TokenStore } from "../auth/token-store.js";
import { createServer as createMcpServer, type TokenManagement } from "../server.js";
import type { SkyFiConfig } from "../types/config.js";
import { hmacHash } from "../auth/crypto.js";

const MCP_PATH = "/mcp";

export interface HttpTransportOptions {
  port: number;
  defaultConfig: Partial<SkyFiConfig>;
  serverSecret?: string;
}

export function startHttpTransport(options: HttpTransportOptions): ReturnType<typeof createHttpServer> {
  const defaults = {
    api_base_url: options.defaultConfig.api_base_url,
    api_version: options.defaultConfig.api_version,
    simulate: options.defaultConfig.simulate,
  };

  const store = new TokenStore(options.serverSecret ?? "dev-secret-change-in-production");

  function makeConfig(apiKey: string): SkyFiConfig {
    return {
      api_key: apiKey,
      api_base_url: defaults.api_base_url ?? "https://app.skyfi.com/platform-api",
      api_version: defaults.api_version ?? "2026-03",
      simulate: defaults.simulate ?? false,
    };
  }

  const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Health check
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (!req.url?.startsWith(MCP_PATH)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    if (req.method === "POST") {
      const mcpToken = req.headers["x-mcp-token"] as string | undefined;
      const rawApiKey = req.headers["x-skyfi-api-key"] as string | undefined;

      // Path 1: MCP token
      if (mcpToken) {
        const resolution = store.resolve(mcpToken);
        if (!resolution.valid) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            status: "error",
            error: { code: "TOKEN_EXPIRED", message: resolution.error, recoverable: true },
          }));
          return;
        }
        const tokenMgmt: TokenManagement = {
          issueServiceToken: (name, scopes, budgetLimitUsd) =>
            Promise.resolve(store.issueServiceToken(resolution.apiKey!, name, scopes, budgetLimitUsd)),
          listServiceTokens: () =>
            Promise.resolve(store.listServiceTokens(resolution.apiKeyHash!)),
          revoke: (token) => Promise.resolve(store.revoke(token)),
          revokeByName: (name) => Promise.resolve(store.revokeByName(resolution.apiKeyHash!, name)),
          isSession: resolution.tokenType === "session",
        };
        const mcpServer = createMcpServer(makeConfig(resolution.apiKey!), tokenMgmt);
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        await mcpServer.server.connect(transport);
        await transport.handleRequest(req, res);
        return;
      }

      // Path 2: Raw API key (initialize)
      if (rawApiKey) {
        const authResult = extractAndValidateApiKey(rawApiKey, defaults);
        if (!authResult.valid) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            status: "error",
            error: { code: "AUTH_MISSING", message: authResult.error, recoverable: false },
          }));
          return;
        }
        const apiKey = authResult.config!.api_key;
        const sessionToken = store.issueSessionToken(apiKey);
        const apiKeyHash = hmacHash(apiKey, options.serverSecret ?? "dev-secret-change-in-production");
        const tokenMgmt: TokenManagement = {
          issueServiceToken: (name, scopes, budgetLimitUsd) =>
            Promise.resolve(store.issueServiceToken(apiKey, name, scopes, budgetLimitUsd)),
          listServiceTokens: () => Promise.resolve(store.listServiceTokens(apiKeyHash)),
          revoke: (token) => Promise.resolve(store.revoke(token)),
          revokeByName: (name) => Promise.resolve(store.revokeByName(apiKeyHash, name)),
          isSession: true,
        };
        const mcpServer = createMcpServer(authResult.config!, tokenMgmt);
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        await mcpServer.server.connect(transport);
        res.setHeader("X-MCP-Token", sessionToken);
        await transport.handleRequest(req, res);
        return;
      }

      // Path 3: Neither
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "error",
        error: { code: "AUTH_MISSING", message: "Provide X-SkyFi-API-Key or X-MCP-Token.", recoverable: false },
      }));
      return;
    }

    // Other methods
    res.writeHead(405);
    res.end("Method not allowed");
  });

  httpServer.listen(options.port, () => {
    process.stderr.write(`SkyFi MCP HTTP server listening on port ${options.port}\n`);
  });

  return httpServer;
}
