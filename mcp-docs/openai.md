# OpenAI Remote MCP Guide

## Overview

Connect the SkyFi MCP server to OpenAI's GPT-4o or o-series models using remote MCP tool support.

## Prerequisites

- OpenAI API key with MCP access
- SkyFi MCP server deployed remotely (Cloudflare Workers or self-hosted)

## Authentication Setup

- Add SkyFi credential header in MCP tool configuration:
  - `X-SkyFi-API-Key` on initialization, or
  - `X-MCP-Token` for subsequent requests.

## Server Configuration Snippet (API)

```python
from openai import OpenAI

client = OpenAI()

response = client.responses.create(
    model="gpt-4o",
    tools=[{
        "type": "mcp",
        "server_label": "skyfi",
        "server_url": "https://your-skyfi-mcp.workers.dev/mcp",
        "headers": {
            "X-SkyFi-API-Key": "sk_your_key",
        },
    }],
    input="Find satellite imagery of the Port of Singapore from the last 3 months",
)
```

## Setup (ChatGPT)

If OpenAI supports custom MCP integrations in ChatGPT:
1. Navigate to Settings → Integrations
2. Add the SkyFi MCP server URL
3. Configure the `X-SkyFi-API-Key` header

## End-to-End Order Flow Example

1. Prompt for imagery search over an AOI/time window.
2. Model calls `geocode` and `search_archive`.
3. Model calls `quote_archive_order` for selected scene and presents quote details.
4. User confirms explicitly in chat.
5. Model calls `execute_archive_order` with `user_confirmed: true` and `idempotency_key`.
6. Model calls `get_order_status` and optionally `fetch_order_image` when complete.

## Order Safety

The `execute_*` tools include `destructiveHint: true` annotations. OpenAI agents should present quotes and wait for user confirmation before executing orders.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Tools not discovered | Verify MCP endpoint returns valid tool list on `tools/list` |
| Auth errors | Ensure `X-SkyFi-API-Key` header is passed correctly |
| Timeout on search | Large date ranges may take several seconds; SSE streaming handles this |
