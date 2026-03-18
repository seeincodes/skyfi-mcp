# Claude Web Custom Integration Guide

## Overview

Use SkyFi MCP tools directly in Claude.ai via custom integrations (remote MCP).

## Authentication Setup

Claude Web custom integrations authenticate with request headers:

- `X-SkyFi-API-Key` for first request/auth initialization
- `X-MCP-Token` for subsequent requests (recommended)

## Server Configuration Snippet

1. Go to [Claude.ai](https://claude.ai) → Settings → Integrations
2. Click "Add Custom Integration"
3. Enter the MCP server URL: `https://your-skyfi-mcp.workers.dev/mcp`
4. Add the authentication header:
   - Header name: `X-SkyFi-API-Key`
   - Header value: `sk_your_skyfi_api_key`
5. Save and enable the integration

## Usage

Once connected, Claude has access to all 18 SkyFi tools. You can ask:

- "Find satellite imagery of the Suez Canal from last week"
- "How much would 0.3m imagery of downtown Tokyo cost?"
- "Is it feasible to task a new SAR capture of the Panama Canal?"
- "Set up monitoring for new imagery over my farm in Iowa"

Claude will use the appropriate tools, present pricing, and ask for confirmation before placing orders.

## Confirmation Flow

Claude's built-in confirmation handling works with the two-step quote→execute pattern:

1. Claude calls `quote_archive_order` and presents the quote
2. You review the price and details
3. You say "Yes, proceed" or "No, cancel"
4. Only on explicit approval does Claude call `execute_archive_order`

## End-to-End Order Flow Example

1. Ask: "Find imagery of Port of Singapore from the past month."
2. Claude calls `geocode` -> `search_archive` and summarizes candidates.
3. Ask: "Quote the best optical option."
4. Claude calls `quote_archive_order` and presents the quote.
5. Confirm: "Yes, proceed."
6. Claude calls `execute_archive_order`, then `get_order_status`.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Integration cannot connect | Ensure MCP endpoint is public HTTPS and reachable |
| Auth error (`AUTH_MISSING`) | Verify header name is exactly `X-SkyFi-API-Key` |
| Execute rejected | Confirm quote is still valid and confirmation was explicit |
