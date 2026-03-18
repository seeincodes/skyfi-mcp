import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { VERSION } from "./index.js";
import { SkyFiClient } from "./clients/skyfi.js";
import { NominatimClient } from "./clients/nominatim.js";
import type { SkyFiConfig } from "./types/config.js";

// Tool handlers
import {
  handleGeocode,
  handleReverseGeocode,
  handleGetBoundingBox,
  geocodeSchema,
  reverseGeocodeSchema,
  getBoundingBoxSchema,
} from "./tools/osm.js";
import {
  handleSearchArchive,
  handleExploreOpenData,
  handleEstimateArchivePrice,
  handleEstimateTaskingCost,
  handleCheckCaptureFeasibility,
  handleRecommendArchivePurchase,
  searchArchiveSchema,
  exploreOpenDataSchema,
  estimateArchivePriceSchema,
  estimateTaskingCostSchema,
  checkCaptureFeasibilitySchema,
  recommendArchivePurchaseSchema,
} from "./tools/discovery.js";
import {
  handleQuoteArchiveOrder,
  handleExecuteArchiveOrder,
  handleQuoteTaskingOrder,
  handleExecuteTaskingOrder,
  quoteArchiveOrderSchema,
  executeArchiveOrderSchema,
  quoteTaskingOrderSchema,
  executeTaskingOrderSchema,
} from "./tools/ordering.js";
import {
  handleGetOrderStatus,
  handleListOrders,
  handleFetchOrderImage,
  getOrderStatusSchema,
  listOrdersSchema,
  fetchOrderImageSchema,
} from "./tools/history.js";
import {
  handleSetupAoiMonitoring,
  handleCreateWebhookSubscription,
  handleGetNotificationStatus,
  setupAoiMonitoringSchema,
  createWebhookSubscriptionSchema,
  getNotificationStatusSchema,
} from "./tools/monitoring.js";

export interface TokenManagement {
  issueServiceToken: (
    name: string,
    scopes: string[] | null,
    budgetLimitUsd: number | null,
  ) => Promise<{ token: string } | { error: string }>;
  listServiceTokens: () => Promise<
    Array<{
      token: string;
      name: string;
      scopes: string[] | null;
      budgetLimitUsd: number | null;
      budgetSpentUsd: number;
      createdAt: number;
      absoluteExpiresAt: number;
    }>
  >;
  revoke: (token: string) => Promise<boolean>;
  revokeByName: (name: string) => Promise<boolean>;
  isSession: boolean;
}

export function createServer(config: SkyFiConfig, tokenMgmt?: TokenManagement): McpServer {
  const server = new McpServer({
    name: "skyfi-mcp",
    version: VERSION,
  });

  const skyfi = new SkyFiClient(config);
  const nominatim = new NominatimClient();

  // --- OSM Tools ---

  server.registerTool("geocode", {
    description:
      "Forward geocoding: accepts a human-readable location string (e.g. 'Port of Rotterdam') " +
      "and returns lat/lng coordinates. Use this when the user mentions a place by name and you " +
      "need coordinates for search or ordering tools.",
    inputSchema: geocodeSchema.shape,
  }, async (args) => {
    const result = await handleGeocode(args as z.infer<typeof geocodeSchema>, nominatim);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.registerTool("reverse_geocode", {
    description:
      "Returns a place name for a given coordinate pair. Use this when you have lat/lng " +
      "coordinates and need a human-readable location name.",
    inputSchema: reverseGeocodeSchema.shape,
  }, async (args) => {
    const result = await handleReverseGeocode(args as z.infer<typeof reverseGeocodeSchema>, nominatim);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.registerTool("get_bounding_box", {
    description:
      "Returns a bounding box polygon for a named place, directly usable as an AOI in search " +
      "and order tools. Use this to convert a place name into a GeoJSON polygon for subsequent tool calls.",
    inputSchema: getBoundingBoxSchema.shape,
  }, async (args) => {
    const result = await handleGetBoundingBox(args as z.infer<typeof getBoundingBoxSchema>, nominatim);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  // --- Discovery & Pricing Tools ---

  server.registerTool("search_archive", {
    description:
      "Search available satellite imagery by AOI, date range, resolution, and sensor type. " +
      "Returns scenes with IDs, capture dates, cloud cover, preview URLs, and per-scene pricing. " +
      "Use this as the first step when the user wants to find existing imagery.",
    inputSchema: searchArchiveSchema.shape,
  }, async (args) => {
    const result = await handleSearchArchive(args as z.infer<typeof searchArchiveSchema>, skyfi);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.registerTool("explore_open_data", {
    description:
      "Browse freely available datasets on SkyFi, filterable by provider and region. " +
      "Use this when the user asks about free or open satellite data.",
    inputSchema: exploreOpenDataSchema.shape,
  }, async (args) => {
    const result = await handleExploreOpenData(args as z.infer<typeof exploreOpenDataSchema>, skyfi);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.registerTool("estimate_archive_price", {
    description:
      "Returns itemized pricing for a given archive order (scene, AOI, resolution) before commitment. " +
      "Use this to give the user a cost estimate before generating a binding quote.",
    inputSchema: estimateArchivePriceSchema.shape,
  }, async (args) => {
    const result = await handleEstimateArchivePrice(args as z.infer<typeof estimateArchivePriceSchema>, skyfi);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.registerTool("estimate_tasking_cost", {
    description:
      "Estimate the cost for a new satellite capture tasking order. Use this to give the user " +
      "a cost preview before checking feasibility or generating a quote.",
    inputSchema: estimateTaskingCostSchema.shape,
  }, async (args) => {
    const result = await handleEstimateTaskingCost(args as z.infer<typeof estimateTaskingCostSchema>, skyfi);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.registerTool("check_capture_feasibility", {
    description:
      "Analyze feasibility for a tasking order: satellite availability, revisit window, cloud cover forecast, " +
      "and a plain-language summary. You MUST call this and present its output to the user before placing " +
      "any tasking order. Precondition: call this before quote_tasking_order.",
    inputSchema: checkCaptureFeasibilitySchema.shape,
  }, async (args) => {
    const result = await handleCheckCaptureFeasibility(args as z.infer<typeof checkCaptureFeasibilitySchema>, skyfi);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.registerTool("recommend_archive_purchase", {
    description:
      "Rank candidate archive scenes by cost, quality, or a balanced strategy. " +
      "Use this after search/pricing to pick the best scene under an optional budget.",
    inputSchema: recommendArchivePurchaseSchema.shape,
  }, async (args) => {
    const result = await handleRecommendArchivePurchase(args as z.infer<typeof recommendArchivePurchaseSchema>);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  // --- Ordering Tools ---

  server.registerTool("quote_archive_order", {
    description:
      "Generate a binding quote for an archive order. Returns a quote_id (valid 15 minutes) and a " +
      "human-readable summary of what will be purchased and at what price. Present this to the user " +
      "and wait for explicit confirmation before calling execute_archive_order.",
    inputSchema: quoteArchiveOrderSchema.shape,
  }, async (args) => {
    const result = await handleQuoteArchiveOrder(args as z.infer<typeof quoteArchiveOrderSchema>, skyfi);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.registerTool("execute_archive_order", {
    description:
      "Place an archive order using a confirmed quote. Preconditions: (1) you must have a valid quote_id " +
      "from quote_archive_order, (2) the user must have explicitly confirmed they want to proceed, " +
      "(3) you must provide an idempotency_key (UUID) for safe retries. " +
      "Do NOT call this tool autonomously — always wait for user confirmation.",
    inputSchema: executeArchiveOrderSchema.shape,
    annotations: { destructiveHint: true },
  }, async (args) => {
    const result = await handleExecuteArchiveOrder(args as z.infer<typeof executeArchiveOrderSchema>, skyfi);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.registerTool("quote_tasking_order", {
    description:
      "Generate a binding quote for a new satellite capture tasking order. Returns a quote_id and summary. " +
      "Precondition: call check_capture_feasibility first and present results to the user. " +
      "Present this quote to the user and wait for confirmation before calling execute_tasking_order.",
    inputSchema: quoteTaskingOrderSchema.shape,
  }, async (args) => {
    const result = await handleQuoteTaskingOrder(args as z.infer<typeof quoteTaskingOrderSchema>, skyfi);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.registerTool("execute_tasking_order", {
    description:
      "Place a tasking order using a confirmed quote. Preconditions: (1) valid quote_id from quote_tasking_order, " +
      "(2) explicit user confirmation, (3) idempotency_key (UUID). " +
      "Do NOT call this tool autonomously — always wait for user confirmation.",
    inputSchema: executeTaskingOrderSchema.shape,
    annotations: { destructiveHint: true },
  }, async (args) => {
    const result = await handleExecuteTaskingOrder(args as z.infer<typeof executeTaskingOrderSchema>, skyfi);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  // --- History Tools ---

  server.registerTool("get_order_status", {
    description:
      "Return current status and progress for an order by ID. Use this to check on a previously placed order.",
    inputSchema: getOrderStatusSchema.shape,
  }, async (args) => {
    const result = await handleGetOrderStatus(args as z.infer<typeof getOrderStatusSchema>, skyfi);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.registerTool("list_orders", {
    description:
      "List the user's historical orders with filters for date range and status. " +
      "Use this when the user asks about their past orders or order history.",
    inputSchema: listOrdersSchema.shape,
  }, async (args) => {
    const result = await handleListOrders(args as z.infer<typeof listOrdersSchema>, skyfi);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.registerTool("fetch_order_image", {
    description:
      "Return download URL and metadata for a completed order's imagery. " +
      "Use this when the user wants to download or access imagery from a delivered order.",
    inputSchema: fetchOrderImageSchema.shape,
  }, async (args) => {
    const result = await handleFetchOrderImage(args as z.infer<typeof fetchOrderImageSchema>, skyfi);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  // --- Monitoring & Webhook Tools ---

  server.registerTool("setup_aoi_monitoring", {
    description:
      "Configure recurring monitoring of an AOI for new imagery. Set sensor preferences, " +
      "resolution requirements, and notification frequency. Use this when the user wants to " +
      "be alerted when new imagery becomes available over a specific area.",
    inputSchema: setupAoiMonitoringSchema.shape,
  }, async (args) => {
    const result = await handleSetupAoiMonitoring(args as z.infer<typeof setupAoiMonitoringSchema>, skyfi);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.registerTool("create_webhook_subscription", {
    description:
      "Register a webhook endpoint to receive push notifications when new imagery matching " +
      "a monitoring rule is available. Requires an active monitor_id from setup_aoi_monitoring.",
    inputSchema: createWebhookSubscriptionSchema.shape,
  }, async (args) => {
    const result = await handleCreateWebhookSubscription(args as z.infer<typeof createWebhookSubscriptionSchema>, skyfi);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.registerTool("get_notification_status", {
    description:
      "Check delivery history and status for webhook subscriptions. Use this to verify " +
      "notifications are being delivered or to diagnose delivery failures.",
    inputSchema: getNotificationStatusSchema.shape,
  }, async (args) => {
    const result = await handleGetNotificationStatus(args as z.infer<typeof getNotificationStatusSchema>, skyfi);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  // --- Token Management Tools (only available when token context is provided) ---

  if (tokenMgmt) {
    server.registerTool("create_service_token", {
      description:
        "Create a long-lived service token for automated pipelines (e.g. nightly monitoring, scheduled orders). " +
        "Service tokens have no idle expiry and last 90 days. Optionally scope to specific tools and set a budget cap. " +
        "Requires an active session token (not another service token). " +
        "Store the returned token securely — it cannot be retrieved again.",
      inputSchema: {
        name: z.string().min(1).max(64).describe("Unique name for this service token, e.g. 'nightly-monitor'"),
        scopes: z.array(z.string()).optional().describe(
          "Tool names this token is allowed to call. Omit for full access.",
        ),
        budget_limit_usd: z.number().positive().optional().describe(
          "Optional spend cap in USD. Requests exceeding this will be rejected.",
        ),
      },
    }, async (args) => {
      if (!tokenMgmt.isSession) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              status: "error",
              error: {
                code: "SCOPE_DENIED",
                message: "create_service_token requires a session token, not a service token.",
                recoverable: false,
              },
            }),
          }],
          isError: true,
        };
      }
      const result = await tokenMgmt.issueServiceToken(
        args.name,
        args.scopes ?? null,
        args.budget_limit_usd ?? null,
      );
      if ("error" in result) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ status: "error", error: { code: "CONFLICT", message: result.error, recoverable: false } }) }],
          isError: true,
        };
      }
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            status: "success",
            tool: "create_service_token",
            data: {
              token: result.token,
              name: args.name,
              scopes: args.scopes ?? null,
              budget_limit_usd: args.budget_limit_usd ?? null,
              expires_in_days: 90,
              note: "Store this token securely. Use it as X-MCP-Token for automated pipeline requests.",
            },
          }),
        }],
      };
    });

    server.registerTool("list_service_tokens", {
      description:
        "List all active service tokens associated with your API key. " +
        "Shows token names, scopes, budget usage, and expiry. Does not reveal the token strings.",
      inputSchema: {},
    }, async () => {
      const tokens = await tokenMgmt.listServiceTokens();
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            status: "success",
            tool: "list_service_tokens",
            data: {
              count: tokens.length,
              tokens: tokens.map((t) => ({
                name: t.name,
                token_prefix: t.token.slice(0, 16) + "...",
                scopes: t.scopes,
                budget_limit_usd: t.budgetLimitUsd,
                budget_spent_usd: t.budgetSpentUsd,
                created_at: new Date(t.createdAt).toISOString(),
                expires_at: new Date(t.absoluteExpiresAt).toISOString(),
              })),
            },
          }),
        }],
      };
    });

    server.registerTool("revoke_service_token", {
      description:
        "Revoke a service token by its name or token string. " +
        "Revoked tokens are immediately invalid and cannot be recovered.",
      inputSchema: {
        identifier: z.string().min(1).describe(
          "The service token name (e.g. 'nightly-monitor') or full token string (mcp_svc_...).",
        ),
      },
    }, async (args) => {
      const { identifier } = args;
      let revoked: boolean;
      if (identifier.startsWith("mcp_svc_")) {
        revoked = await tokenMgmt.revoke(identifier);
      } else {
        revoked = await tokenMgmt.revokeByName(identifier);
      }
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            status: revoked ? "success" : "error",
            tool: "revoke_service_token",
            data: revoked
              ? { message: `Service token '${identifier}' has been revoked.` }
              : { message: `No active service token found matching '${identifier}'.` },
          }),
        }],
        isError: !revoked,
      };
    });
  }

  return server;
}
