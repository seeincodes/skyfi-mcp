# Claude Code MCP Guide

## Overview

Use SkyFi MCP tools in Claude Code (Anthropic's CLI) for terminal-based satellite imagery workflows.

## Authentication Setup

- **Local STDIO:** `SKYFI_API_KEY` env var or `~/.skyfi/config.json`
- **Remote URL mode:** `X-SkyFi-API-Key` for initialization, then `X-MCP-Token` for ongoing requests

## Server Configuration Snippet

### Local Setup (STDIO)

Add to your Claude Code MCP settings (`~/.claude/settings.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "skyfi": {
      "command": "npx",
      "args": ["skyfi-mcp"],
      "env": {
        "SKYFI_API_KEY": "sk_your_key"
      }
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "skyfi": {
      "command": "skyfi-mcp"
    }
  }
}
```

With config file auth (`~/.skyfi/config.json`):
```json
{ "api_key": "sk_your_key" }
```

### Remote Setup (HTTP+SSE)

```json
{
  "mcpServers": {
    "skyfi": {
      "type": "url",
      "url": "https://your-skyfi-mcp.workers.dev/mcp",
      "headers": {
        "X-SkyFi-API-Key": "sk_your_key"
      }
    }
  }
}
```

## Usage

Once configured, Claude Code has access to all SkyFi tools. Example prompts:

```
> Search for recent satellite imagery over the Port of Rotterdam
> How much would it cost to get high-resolution optical imagery of Central Park?
> Check if we can task a new SAR capture over the Strait of Hormuz next week
> Show me my recent order history
```

## End-to-End Order Flow Example

1. `Search for recent imagery over the Port of Rotterdam`.
2. Claude calls discovery tools and presents candidates.
3. `Quote the best option from last week`.
4. Claude calls `quote_archive_order` and prints quote details.
5. `Yes, place the order`.
6. Claude calls `execute_archive_order` with confirmation and idempotency key.
7. Claude checks progress via `get_order_status`.

## Simulation Mode

For testing without placing real orders, set the env var:

```json
{
  "mcpServers": {
    "skyfi": {
      "command": "npx",
      "args": ["skyfi-mcp"],
      "env": {
        "SKYFI_API_KEY": "sk_your_key",
        "SKYFI_SIMULATE": "true"
      }
    }
  }
}
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Tools not available in Claude Code | Validate MCP settings path and restart Claude Code |
| Auth failures in remote mode | Check header names and API key/token values |
| Execute tool rejected | Ensure user confirmation is explicit and quote is still valid |
