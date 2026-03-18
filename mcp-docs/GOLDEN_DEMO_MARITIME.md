# Golden Demo: Maritime Activity Monitoring

## Why This Demo

This scenario demonstrates clear business value: monitoring shipping activity in strategic ports with auditable imagery ordering.

## Outcome

An agent:
1. Finds recent imagery over a port AOI
2. Ranks candidate scenes by budget/quality
3. Quotes and executes an order only after explicit human confirmation
4. Tracks order status and returns imagery access links

## Demo Prompt

Use this in Claude, OpenAI, Gemini, ADK, or LangChain:

```text
Analyze shipping activity at the Port of Singapore over the last 60 days.
Find the best available archive scenes under a $200 budget, explain the trade-offs,
and prepare an order quote. Do not place the order until I explicitly confirm.
```

## Canonical Tool Flow

1. `geocode` (`Port of Singapore`)
2. `get_bounding_box`
3. `search_archive` (last 60 days)
4. `recommend_archive_purchase` (`strategy: balanced`, `max_budget_usd: 200`)
5. `quote_archive_order` (best option)
6. Human confirmation step in app/chat
7. `execute_archive_order` (`user_confirmed: true`, `idempotency_key`)
8. `get_order_status`
9. `fetch_order_image`

## Success Criteria

- Agent provides at least 2 ranked options with cost rationale.
- Quote is shown before any execute call.
- Execute call includes `user_confirmed: true` and unique idempotency key.
- Returned response includes order ID and trackable status.

## Demo Script (Human Operator)

1. Start with simulation mode for dry runs:
   - `SKYFI_SIMULATE=true npx skyfi-mcp`
2. Run the prompt above.
3. Verify the quote and recommendation rationale.
4. Confirm order and capture transcript + tool call chain.
5. Repeat in non-simulated mode for live validation (optional).

## Judge-Facing Highlights

- Explicit server-side safety controls (quote -> confirm -> execute)
- Cost-intelligent recommendation, not just raw search output
- Reproducible transcript with clear audit trail
