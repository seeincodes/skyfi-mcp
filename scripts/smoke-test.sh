#!/usr/bin/env bash
# Smoke test for SkyFi MCP remote endpoint
# Usage: ./scripts/smoke-test.sh <MCP_URL> <SKYFI_API_KEY>
#
# Example:
#   ./scripts/smoke-test.sh https://skyfi-mcp.your-worker.workers.dev/mcp sk_your_key
#   ./scripts/smoke-test.sh http://localhost:8787/mcp sk_test_key

set -euo pipefail

MCP_URL="${1:?Usage: smoke-test.sh <MCP_URL> <SKYFI_API_KEY>}"
API_KEY="${2:?Usage: smoke-test.sh <MCP_URL> <SKYFI_API_KEY>}"

echo "=== SkyFi MCP Smoke Test ==="
echo "URL: $MCP_URL"
echo ""

# 1. MCP Initialize
echo "--- Step 1: MCP Initialize ---"
INIT_RESPONSE=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "X-SkyFi-API-Key: $API_KEY" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": { "name": "smoke-test", "version": "1.0.0" }
    }
  }')
echo "$INIT_RESPONSE" | head -c 500
echo ""
echo ""

# 2. List Tools
echo "--- Step 2: List Tools ---"
TOOLS_RESPONSE=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "X-SkyFi-API-Key: $API_KEY" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }')
echo "$TOOLS_RESPONSE" | head -c 500
echo ""
echo ""

# 3. Call geocode tool
echo "--- Step 3: Call geocode ---"
GEOCODE_RESPONSE=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "X-SkyFi-API-Key: $API_KEY" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "geocode",
      "arguments": { "query": "Port of Rotterdam" }
    }
  }')
echo "$GEOCODE_RESPONSE" | head -c 500
echo ""
echo ""

echo "=== Smoke Test Complete ==="
