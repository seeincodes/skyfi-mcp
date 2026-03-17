import { afterEach, describe, expect, it } from "vitest";
import { once } from "node:events";
import { startHttpTransport } from "../src/transport/http.js";

async function startTestServer() {
  const server = startHttpTransport({
    port: 0,
    defaultConfig: {
      api_base_url: "https://api.skyfi.test",
      api_version: "2026-03",
      simulate: false,
    },
  });

  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to resolve test server address");
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;
  return { server, baseUrl };
}

describe("HTTP transport route and auth regression", () => {
  const servers: Array<ReturnType<typeof startHttpTransport>> = [];

  afterEach(async () => {
    while (servers.length > 0) {
      const server = servers.pop();
      if (server) {
        await new Promise<void>((resolve, reject) => {
          server.close((err) => {
            if (err) {
              reject(err);
              return;
            }
            resolve();
          });
        });
      }
    }
  });

  it("exposes a health check endpoint", async () => {
    const { server, baseUrl } = await startTestServer();
    servers.push(server);

    const res = await fetch(`${baseUrl}/health`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok" });
  });

  it("returns 404 for non-MCP routes", async () => {
    const { server, baseUrl } = await startTestServer();
    servers.push(server);

    const res = await fetch(`${baseUrl}/unknown`);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body).toEqual({ error: "Not found" });
  });

  it("returns structured 401 when API key header is missing", async () => {
    const { server, baseUrl } = await startTestServer();
    servers.push(server);

    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.status).toBe("error");
    expect(body.error?.code).toBe("AUTH_MISSING");
    expect(typeof body.error?.message).toBe("string");
    expect(body.error?.recoverable).toBe(false);
  });
});
