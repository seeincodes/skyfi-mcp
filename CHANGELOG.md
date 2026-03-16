# Changelog

## 0.1.0 — 2026-03-16

**Initial release**

### Tools (18)
- OSM: `geocode`, `reverse_geocode`, `get_bounding_box`
- Discovery: `search_archive`, `explore_open_data`
- Pricing: `estimate_archive_price`, `estimate_tasking_cost`, `check_capture_feasibility`
- Ordering: `quote_archive_order`, `execute_archive_order`, `quote_tasking_order`, `execute_tasking_order`
- History: `get_order_status`, `list_orders`, `fetch_order_image`
- Monitoring: `setup_aoi_monitoring`, `create_webhook_subscription`, `get_notification_status`

### Features
- STDIO transport (local) and HTTP+SSE transport (remote)
- Two-step order confirmation (quote → execute) enforced server-side
- Simulation mode (`SKYFI_SIMULATE=true`)
- Idempotency keys on `execute_*` tools (24h TTL)
- AOI area guardrails (50,000 km² archive, 10,000 km² tasking)
- Pricing guardrails (configurable warn threshold and hard limit)
- Per-key rate limiting (100/min, 20/10s burst)
- Daily order and spend caps
- Pre-authorized mode with budget and AOI constraints
- Multi-tenant per-request auth isolation
- Standard response envelope on all tools
- Streaming support for search, feasibility, and order status
- Webhook event queue with retry and failure tracking
- Structured telemetry and DX metrics

### Deployment
- Cloudflare Workers (wrangler.toml)
- Docker (Dockerfile + docker-compose.yml)

### Documentation
- 7 framework integration guides
- Tool descriptions reference
- Response envelope schema
- Authentication model docs
- Demo agent (Google ADK + LangChain)
