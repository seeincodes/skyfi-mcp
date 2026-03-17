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
# First request: send your API key to get a session token
POST https://skyfi-mcp.skyfi-xian.workers.dev/mcp
Header: X-SkyFi-API-Key: sk_your_key
→ Response includes X-MCP-Token header

# All subsequent requests: use the session token
POST https://skyfi-mcp.skyfi-xian.workers.dev/mcp
Header: X-MCP-Token: mcp_sess_<your_token>
```

Your raw API key is only sent once. The session token has a 4-hour idle TTL (extends on each request) and 7-day max lifetime.

## Authentication

### Token Exchange (Remote)

The remote server uses a token exchange model to protect your SkyFi API key:

1. **Initialize** — Send `X-SkyFi-API-Key` on your first request. The server validates it and returns an `X-MCP-Token` session token.
2. **Use** — All subsequent requests use `X-MCP-Token`. Your raw API key never appears in agent traffic again.
3. **Expire** — Session tokens expire after 4 hours idle or 7 days max. Re-send your API key to get a new one.

### Service Tokens (Pipelines)

For automated pipelines that run unattended, create a long-lived service token:

```
# Call the create_service_token tool with an active session
→ Returns: mcp_svc_<token> (90-day lifetime, no idle expiry)
```

Service tokens support optional scopes (restrict which tools can be called) and budget caps (server-side spend limits).

### Local (STDIO)

Local mode reads your API key from `~/.skyfi/config.json` or `SKYFI_API_KEY` env var at startup. No token exchange needed.

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

## Security

- **API key protection** — Raw key sent once, exchanged for scoped token. Key encrypted at rest (AES-256-GCM) with derived keys (HKDF).
- **Key hashing** — Usage metrics use HMAC-SHA-256 with a separate derived key. Not reversible without the server secret.
- **Per-request isolation** — Each request creates an independent SkyFi client. No shared mutable auth state. One tenant's credentials cannot leak to another.
- **Rate limiting** — Per-key: 100 calls/min, 20/10s burst. Daily caps: 10 orders, $10K spend.
- **Service token scoping** — Optional tool restrictions and budget caps, enforced server-side.
- **Prompt injection defense** — All inputs treated as data. String length caps (500 chars). Control character stripping. Order confirmation enforced server-side, not in prompts.

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

**Cloudflare Workers (live):**

```
https://skyfi-mcp.skyfi-xian.workers.dev/mcp
```

**Self-deploy:**

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
npm test             # Run 239 tests
npm run typecheck    # TypeScript check
npm run lint         # ESLint
```

## License

MIT
