#!/usr/bin/env node
import { startHttpTransport } from "./transport/http.js";

const port = parseInt(process.env.PORT ?? "8787", 10);

startHttpTransport({
  port,
  defaultConfig: {
    api_base_url: process.env.SKYFI_API_BASE_URL,
    api_version: process.env.SKYFI_API_VERSION,
    simulate: process.env.SKYFI_SIMULATE === "true",
  },
});
