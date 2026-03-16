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
  searchArchiveSchema,
  exploreOpenDataSchema,
  estimateArchivePriceSchema,
  estimateTaskingCostSchema,
  checkCaptureFeasibilitySchema,
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

export function createServer(config: SkyFiConfig): McpServer {
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

  return server;
}
