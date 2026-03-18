# Google ADK Integration Guide

## Overview

Use SkyFi MCP tools from a Google ADK agent for geospatial search, pricing, and safe order execution.

## Authentication Setup

- **Local (STDIO):** set `SKYFI_API_KEY` in environment, or use `~/.skyfi/config.json`.
- **Remote (HTTP+SSE):** pass `X-SkyFi-API-Key` on first call; then prefer `X-MCP-Token` from response headers for subsequent calls.

## Server Configuration Snippet

### Local (STDIO)

```python
from google.adk import Agent
from google.adk.tools.mcp import MCPToolset, StdioServerParameters

agent = Agent(
    name="skyfi-geo-agent",
    model="gemini-2.0-flash",
    tools=[
        MCPToolset(
            server_params=StdioServerParameters(
                command="npx",
                args=["skyfi-mcp"],
            )
        )
    ],
    instruction="Use SkyFi tools to find imagery, quote orders, and execute only after explicit user confirmation.",
)
```

### Remote (HTTP+SSE)

```python
from google.adk import Agent
from google.adk.tools.mcp import MCPToolset, SseServerParameters

agent = Agent(
    name="skyfi-geo-agent",
    model="gemini-2.0-flash",
    tools=[
        MCPToolset(
            server_params=SseServerParameters(
                url="https://your-skyfi-mcp.workers.dev/mcp",
                headers={"X-SkyFi-API-Key": "sk_your_key"},
            )
        )
    ],
    instruction="Use SkyFi tools to find imagery, quote orders, and execute only after explicit user confirmation.",
)
```

## End-to-End Order Flow Example

1. User asks for imagery over a place and date range.
2. Agent calls `geocode` -> `get_bounding_box` -> `search_archive`.
3. Agent presents matching scenes and calls `quote_archive_order` for the selected scene.
4. Agent asks user to confirm quote details.
5. On explicit approval, agent calls `execute_archive_order` with `user_confirmed: true` and a new `idempotency_key`.
6. Agent calls `get_order_status` until delivery, then `fetch_order_image`.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `AUTH_MISSING` from remote server | Ensure `X-SkyFi-API-Key` (or `X-MCP-Token`) is included in MCP headers |
| Tool list is empty | Verify MCP endpoint URL and ADK transport config |
| Quote succeeds but execute fails | Confirm quote is unexpired and send a unique `idempotency_key` |
