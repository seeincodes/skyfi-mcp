# Vercel AI SDK Integration Guide

## Overview

Build a Next.js app with conversational satellite imagery ordering using the Vercel AI SDK and SkyFi MCP tools.

## Prerequisites

- Node.js 20+
- `npm install ai @ai-sdk/anthropic @ai-sdk/openai`
- SkyFi API key

## Authentication Setup

- Set `SKYFI_API_KEY` in your server runtime environment.
- Pass `X-SkyFi-API-Key` in MCP headers on first connection.
- For long-lived sessions, switch to `X-MCP-Token` after initialization.

## Server Configuration Snippet

```typescript
// app/api/chat/route.ts
import { streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { experimental_createMCPClient } from "ai";

export async function POST(req: Request) {
  const { messages } = await req.json();

  const mcpClient = await experimental_createMCPClient({
    transport: {
      type: "sse",
      url: "https://your-skyfi-mcp.workers.dev/mcp",
      headers: { "X-SkyFi-API-Key": process.env.SKYFI_API_KEY! },
    },
  });

  const tools = await mcpClient.tools();

  const result = streamText({
    model: anthropic("claude-sonnet-4-20250514"),
    messages,
    tools,
    system: "You are a satellite imagery assistant. Always present pricing and get user confirmation before placing orders.",
  });

  return result.toDataStreamResponse();
}
```

## End-to-End Order Flow Example

1. User asks for imagery in chat.
2. MCP tools run `geocode`/`search_archive` and show candidates.
3. App requests `quote_archive_order` and renders quote in UI.
4. User clicks confirm in UI component.
5. Server sends `execute_archive_order` with `user_confirmed: true` and generated `idempotency_key`.
6. Chat continues with `get_order_status` updates.

## Confirmation UI Pattern

```tsx
// components/ConfirmOrder.tsx
export function ConfirmOrder({ quote }: { quote: QuoteData }) {
  return (
    <div className="border rounded p-4">
      <h3>Order Confirmation</h3>
      <p>Price: ${quote.price_usd}</p>
      <p>{quote.summary}</p>
      <button onClick={() => confirmOrder(quote.quote_id)}>
        Confirm Order
      </button>
    </div>
  );
}
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| SSE connection drops | Verify CORS headers on Worker; check network timeouts |
| Tool schemas not loading | Ensure MCP endpoint is accessible from server-side route |
| Streaming not working | Use `streamText` (not `generateText`) for SSE support |
