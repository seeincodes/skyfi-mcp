# SkyFi MCP Server

Official [Model Context Protocol](https://modelcontextprotocol.io) server for the [SkyFi](https://skyfi.com) satellite imagery platform. Enables any AI agent to search, price, order, and monitor satellite imagery through conversational tool calls.

## Quick Start (< 10 minutes)

### 1. Install

```bash
npm install skyfi-mcp
```

### 2. Configure

Create `~/.skyfi/config.json`:

```json
{ "api_key": "sk_your_skyfi_api_key" }
```

Or set the environment variable:

```bash
export SKYFI_API_KEY=sk_your_key
```

### 3. Run (Local STDIO)

```bash
npx skyfi-mcp
```

### 4. Connect

**Claude Code / Claude Desktop:**

```json
{
  "mcpServers": {
    "skyfi": {
      "command": "npx",
      "args": ["skyfi-mcp"],
      "env": { "SKYFI_API_KEY": "sk_your_key" }
    }
  }
}
```

**Remote (any framework):**

```
POST https://your-skyfi-mcp.workers.dev/mcp
Header: X-SkyFi-API-Key: sk_your_key
```

## Tools (18)

| Category | Tools |
|----------|-------|
| Geocoding | `geocode`, `reverse_geocode`, `get_bounding_box` |
| Discovery | `search_archive`, `explore_open_data` |
| Pricing | `estimate_archive_price`, `estimate_tasking_cost`, `check_capture_feasibility` |
| Ordering | `quote_archive_order`, `execute_archive_order`, `quote_tasking_order`, `execute_tasking_order` |
| History | `get_order_status`, `list_orders`, `fetch_order_image` |
| Monitoring | `setup_aoi_monitoring`, `create_webhook_subscription`, `get_notification_status` |

## Order Safety

Orders use a two-step confirmation flow enforced server-side:

1. **Quote** → returns price and `quote_id` (valid 15 min)
2. **Execute** → requires `quote_id` + `user_confirmed: true` + `idempotency_key`

The `execute_*` tools cannot be called without all three fields. This is enforced at the schema level and cannot be bypassed by prompt injection.

## Framework Support

| Framework | Transport | Guide |
|-----------|-----------|-------|
| Google ADK | STDIO / HTTP+SSE | [docs/integrations/google-adk.md](docs/integrations/google-adk.md) |
| LangChain / LangGraph | STDIO / HTTP+SSE | [docs/integrations/langchain.md](docs/integrations/langchain.md) |
| Vercel AI SDK | HTTP+SSE | [docs/integrations/vercel-ai-sdk.md](docs/integrations/vercel-ai-sdk.md) |
| Claude Web | HTTP+SSE | [docs/integrations/claude-web.md](docs/integrations/claude-web.md) |
| OpenAI | HTTP+SSE | [docs/integrations/openai.md](docs/integrations/openai.md) |
| Claude Code | STDIO / HTTP+SSE | [docs/integrations/claude-code.md](docs/integrations/claude-code.md) |
| Gemini | HTTP+SSE | [docs/integrations/gemini.md](docs/integrations/gemini.md) |

## Simulation Mode

Test the full order flow without placing real orders:

```bash
SKYFI_SIMULATE=true npx skyfi-mcp
```

Or per-request: pass `"simulate": true` in quote/execute tool calls.

## Deployment

**Cloudflare Workers:**

```bash
npx wrangler deploy
```

**Docker:**

```bash
docker compose up
```

## Development

```bash
npm install
npm run build        # Build with tsup
npm test             # Run 200+ tests
npm run typecheck    # TypeScript check
npm run lint         # ESLint
```

## License

MIT
