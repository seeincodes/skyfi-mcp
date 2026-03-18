# LangChain / LangGraph Integration Guide

## Overview

Use SkyFi MCP tools in a LangChain agent or LangGraph workflow with a dedicated confirmation node for order safety.

## Prerequisites

- Python 3.11+
- `pip install langchain langgraph langchain-mcp-adapters`
- SkyFi API key

## Authentication Setup

- Remote mode requires either:
  - `X-SkyFi-API-Key` (initialization), or
  - `X-MCP-Token` (recommended after initialization).
- For local mode, use STDIO transport and `SKYFI_API_KEY`.

## Server Configuration Snippet

```python
from langchain_mcp_adapters.client import MultiServerMCPClient

client = MultiServerMCPClient({
    "skyfi": {
        "url": "https://your-skyfi-mcp.workers.dev/mcp",
        "transport": "streamable_http",
        "headers": {"X-SkyFi-API-Key": "sk_your_key"},
    }
})

tools = await client.get_tools()
```

## LangGraph Confirmation Node Pattern

For order safety, add an explicit confirmation node that interrupts before `execute_*` tools:

```python
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

def should_confirm(state):
    """Route to confirmation if the last tool call was a quote."""
    last_msg = state["messages"][-1]
    if hasattr(last_msg, "tool_calls"):
        for call in last_msg.tool_calls:
            if call["name"].startswith("quote_"):
                return "confirm"
    return "continue"

graph = StateGraph(AgentState)
graph.add_node("agent", agent_node)
graph.add_node("tools", tool_node)
graph.add_node("confirm", confirmation_node)  # Interrupts for user input
graph.add_conditional_edges("agent", should_confirm, {
    "confirm": "confirm",
    "continue": "tools",
})
graph.add_edge("confirm", "tools")
graph.add_edge("tools", "agent")

app = graph.compile(checkpointer=MemorySaver(), interrupt_before=["confirm"])
```

## End-to-End Order Flow Example

1. User request enters graph.
2. Agent/tool node calls `geocode` and `search_archive`.
3. Agent calls `quote_archive_order` for selected scene.
4. Graph routes to confirmation interrupt node.
5. If approved, tool node calls `execute_archive_order` with `user_confirmed: true` and `idempotency_key`.
6. Follow-up node calls `get_order_status` and optionally `fetch_order_image`.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `user_confirmed` validation error | Ensure the confirmation node sets `user_confirmed: true` only after user approval |
| Quote expired | Reduce time between quote and execute; quotes are valid 15 minutes |
| Rate limit 429 | Add retry logic with exponential backoff; check `retry_after` field |
