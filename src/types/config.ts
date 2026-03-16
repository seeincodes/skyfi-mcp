import { z } from "zod";

export const SkyFiConfigSchema = z.object({
  api_key: z.string().min(1, "api_key must not be empty"),
  api_base_url: z.string().url().default("https://app.skyfi.com/platform-api"),
  api_version: z.string().default("2026-03"),
  simulate: z.boolean().default(false),
});

export type SkyFiConfig = z.infer<typeof SkyFiConfigSchema>;
