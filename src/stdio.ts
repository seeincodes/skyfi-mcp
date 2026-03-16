#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolveConfig, ConfigError } from "./auth/index.js";
import { createServer } from "./server.js";

async function main() {
  try {
    const config = resolveConfig();
    const server = createServer(config);
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`Configuration error: ${err.message}\n`);
      process.exit(1);
    }
    process.stderr.write(`Fatal error: ${(err as Error).message}\n`);
    process.exit(1);
  }
}

main();
