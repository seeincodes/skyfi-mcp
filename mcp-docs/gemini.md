# Gemini MCP / Function Calling Guide

## Overview

Use SkyFi MCP tools with Google Gemini models via MCP function calling or the Google ADK.

## Authentication Setup

- Add `X-SkyFi-API-Key` in MCP server headers for initialization.
- Prefer `X-MCP-Token` on subsequent requests once the server returns it.

## Server Configuration Snippet

## Option 1: Gemini API with MCP Tools

```python
from google import genai

client = genai.Client()

response = client.models.generate_content(
    model="gemini-2.0-flash",
    contents="Find satellite imagery of the Amazon rainforest",
    config=genai.types.GenerateContentConfig(
        tools=[
            genai.types.Tool(
                mcp_servers=[
                    genai.types.McpServer(
                        url="https://your-skyfi-mcp.workers.dev/mcp",
                        headers={"X-SkyFi-API-Key": "sk_your_key"},
                    )
                ]
            )
        ]
    ),
)
```

## Option 2: Google ADK (Recommended)

See the [Google ADK guide](./google-adk.md) for the full ADK integration pattern, which provides better control over the confirmation flow.

## Function Calling Pattern

Gemini's function calling works with SkyFi tools naturally:

1. Gemini receives the tool schemas via MCP
2. It generates function calls based on user requests
3. The MCP server executes the tool and returns results in the standard envelope
4. Gemini presents results to the user

## Confirmation Handling

For order tools, implement a confirmation loop:

```python
# After receiving a quote response, ask the user
quote_data = parse_tool_result(response)
user_input = input(f"Order {quote_data['summary']} for ${quote_data['price_usd']}? (yes/no): ")

if user_input.lower() == "yes":
    # Continue conversation with confirmation
    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=[*history, f"The user confirmed. Proceed with quote {quote_data['quote_id']}."],
        config=config,
    )
```

## End-to-End Order Flow Example

1. User asks for imagery by place/date.
2. Gemini calls `geocode` then `search_archive`.
3. Gemini calls `quote_archive_order` and presents price + summary.
4. App collects explicit user approval.
5. Gemini calls `execute_archive_order` with `user_confirmed: true` and `idempotency_key`.
6. Gemini checks `get_order_status` and returns delivery details.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| MCP tools not available | Ensure Gemini API version supports MCP; check model capabilities |
| Header auth not working | Verify `X-SkyFi-API-Key` is in the `headers` dict |
| Streaming not supported | Use ADK for SSE streaming support |
