# Token Exchange Auth Layer — Design Spec

## Problem

The current MCP server requires users to send their raw SkyFi API key in every request header. This exposes the key to agent frameworks, logging, network inspection, and key-sharing. SkyFi operates the hosted MCP server and needs both security (key protection) and revenue visibility (metered usage data).

## Solution

A token exchange layer where the raw API key is sent once during `initialize`, validated, and exchanged for a scoped MCP token. All subsequent requests use the MCP token. Two token types serve interactive and pipeline users.

## Token Types

### Session Token (Interactive)
- **Format:** `mcp_sess_<32 random hex>`
- **Issued:** On `initialize` when `X-SkyFi-API-Key` is provided
- **Idle TTL:** 4 hours, sliding (extends on every request)
- **Max lifetime:** 7 days absolute
- **Stored in:** Workers KV with prefix `sess:`

### Service Token (Pipelines)
- **Format:** `mcp_svc_<32 random hex>`
- **Issued:** Via `create_service_token` tool (requires active session)
- **Idle TTL:** None
- **Max lifetime:** 90 days absolute
- **Optional scopes:** Restrict which tools the token can call
- **Optional budget cap:** Server-side spend limit for this token
- **Managed via:** `list_service_tokens`, `revoke_service_token` tools
- **Stored in:** Workers KV with prefix `svc:`

## Auth Flow

### Initialize (key → session token)
1. Client sends `initialize` with `X-SkyFi-API-Key: sk_xxx`
2. Server validates key against SkyFi API
3. Server generates session token, stores mapping in KV
4. Server returns `X-MCP-Token` in response header
5. Raw API key is encrypted (AES-256-GCM) at rest in KV

### Initialize (service token)
1. Client sends `initialize` with `X-MCP-Token: mcp_svc_xxx`
2. Server validates token in KV, checks not expired
3. Server proceeds (no new token issued — service token is reused)

### Tool calls
1. Client sends request with `X-MCP-Token` header
2. Server resolves token → encrypted API key → decrypt → use for SkyFi API call
3. Session tokens: extend idle TTL
4. Service tokens: check scopes, check budget
5. Log usage event

### Credential routing
- `X-SkyFi-API-Key` on `initialize` → issue session token
- `X-SkyFi-API-Key` on anything else → reject (key only allowed on initialize)
- `X-MCP-Token` (sess) → resolve, extend TTL, proceed
- `X-MCP-Token` (svc) → resolve, check scopes/budget, proceed
- Neither header → reject AUTH_MISSING

## Cryptography

- **API key encryption at rest:** AES-256-GCM with server-side secret (Cloudflare Workers secret)
- **API key hashing for usage aggregation:** HMAC-SHA-256 with the same server secret
- **Token generation:** `crypto.randomUUID()` stripped of hyphens (32 hex chars)

## KV Schema

### Session token
```
Key: sess:mcp_sess_abc123
Value: {
  api_key_encrypted: "enc_...",
  api_key_hash: "hmac_...",
  created_at: <timestamp>,
  last_used_at: <timestamp>,
  idle_ttl_ms: 14400000,
  absolute_expires_at: <created_at + 7 days>
}
TTL: 7 days (KV-level, auto-cleanup)
```

### Service token
```
Key: svc:mcp_svc_def456
Value: {
  api_key_encrypted: "enc_...",
  api_key_hash: "hmac_...",
  name: "nightly-monitor",
  scopes: ["search_archive", "get_order_status"],
  budget_limit_usd: 500,
  budget_spent_usd: 127.50,
  created_at: <timestamp>,
  absolute_expires_at: <created_at + 90 days>
}
TTL: 90 days
```

### Usage log
```
Key: usage:<api_key_hash>:<YYYY-MM-DD>
Value: {
  tool_calls: 47,
  orders: 2,
  spend_usd: 130.00,
  tools: { "search_archive": 20, "geocode": 15, ... }
}
TTL: 90 days
```

## New Error Codes

| Code | Recoverable | Retry Tool | Trigger |
|------|-------------|------------|---------|
| TOKEN_EXPIRED | Yes | initialize | Session idle/max or service expired |
| TOKEN_INVALID | No | — | Malformed or unknown token |
| SCOPE_DENIED | No | — | Service token lacks required scope |
| SERVICE_BUDGET_EXCEEDED | No | — | Service token spend cap hit |

## New MCP Tools

### `create_service_token`
- Requires active session token
- Input: name, scopes (optional), budget_limit_usd (optional)
- Returns: service token string, expiry date

### `list_service_tokens`
- Requires active session token
- Returns: list of service tokens with name, scopes, budget status, expiry

### `revoke_service_token`
- Requires active session token
- Input: service token string or name
- Returns: confirmation

## Usage Logging

Every tool call emits:
```
{
  api_key_hash, token_type, tool, status, duration_ms,
  resulted_in_order, order_price_usd, simulated, timestamp
}
```

Powers: conversion funnel, tool popularity, simulation-to-live tracking.

## Breaking Changes

- `X-SkyFi-API-Key` no longer accepted on tool calls (only on `initialize`)
- All tool calls require `X-MCP-Token` header
- Existing framework integration guides need updating

## Testing Requirements

- Token issuance on initialize
- Token resolution on tool calls
- Idle expiry (4hr) and absolute expiry (7d) for session tokens
- Service token creation, scoping, budget enforcement, revocation
- Rejection of raw API key on non-initialize requests
- Encryption/decryption round-trip
- HMAC-SHA-256 consistency
- Usage logging correctness
- Concurrent tenant isolation (different tokens, different keys)
- Backward-incompatible: old-style key-per-request rejected
