# Framework Compatibility Matrix

## Transport Support

| Framework | STDIO | HTTP+SSE | Streaming | Auth Method |
|-----------|-------|----------|-----------|-------------|
| Google ADK | Yes | Yes | Yes (SSE) | Header / Env |
| LangChain/LangGraph | Yes | Yes | Yes (SSE) | Header |
| Vercel AI SDK | No | Yes | Yes (SSE) | Header |
| Claude Web (Custom) | No | Yes | Yes (SSE) | Header (UI config) |
| OpenAI (Remote MCP) | No | Yes | Yes (SSE) | Header |
| Claude Code | Yes | Yes | No (STDIO sync) | Config file / Env / Header |
| Gemini API | No | Yes | Yes (SSE) | Header |

## Tool Availability

All 19 tools are available across all frameworks. No framework-specific restrictions.

| Tool Category | Tools | Count |
|--------------|-------|-------|
| OSM/Geocoding | `geocode`, `reverse_geocode`, `get_bounding_box` | 3 |
| Discovery | `search_archive`, `explore_open_data` | 2 |
| Pricing | `estimate_archive_price`, `estimate_tasking_cost`, `check_capture_feasibility` | 3 |
| Cost Intelligence | `recommend_archive_purchase` | 1 |
| Ordering | `quote_archive_order`, `execute_archive_order`, `quote_tasking_order`, `execute_tasking_order` | 4 |
| History | `get_order_status`, `list_orders`, `fetch_order_image` | 3 |
| Monitoring | `setup_aoi_monitoring`, `create_webhook_subscription`, `get_notification_status` | 3 |

## Confirmation Flow Support

| Framework | Pattern | Notes |
|-----------|---------|-------|
| Google ADK | Conversational | Agent naturally presents quote and waits for user input |
| LangChain/LangGraph | Graph interrupt node | Add a confirmation node that interrupts before `execute_*` |
| Vercel AI SDK | UI component | Render a confirmation component when quote is returned |
| Claude Web | Conversational | Claude presents quote and asks for approval |
| OpenAI | Conversational | GPT presents quote and waits for user response |
| Claude Code | CLI prompt | Claude Code asks for confirmation in terminal |
| Gemini | Conversational / Loop | Implement confirmation loop in application code |

## Smoke Test Evidence

Each guide includes a working code example that demonstrates:
1. Server connection (STDIO or HTTP+SSE)
2. Tool discovery (`tools/list`)
3. Tool invocation (at minimum: `geocode` → `search_archive`)

Full e2e order flow (search → quote → confirm → execute) is tested via the MCP integration test suite (`tests/server.test.ts`).
