# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in the SkyFi MCP Server, please report it responsibly.

**Email:** security@skyfi.com

**Do NOT:**
- Open a public GitHub issue for security vulnerabilities
- Share vulnerability details publicly before a fix is released

**Response timeline:**
- Acknowledgment within 48 hours
- Initial assessment within 5 business days
- Fix target within 30 days for critical issues

## Security Model

### Credential Handling
- API keys are never logged at any layer (request logs, error traces, analytics)
- In remote mode, credentials arrive per-request in the `X-SkyFi-API-Key` header and are never stored server-side
- In local mode, credentials are read from a user-owned config file and held in memory only

### Order Confirmation Integrity
- `execute_*` tools require a valid `quote_id`, `user_confirmed: true`, and `idempotency_key`
- This check is enforced server-side at the Zod schema level — it cannot be bypassed by prompt injection

### Prompt Injection Mitigation
- All user-supplied string inputs are treated as data, never instructions
- String inputs are length-capped (500 chars) and stripped of control characters
- The server-side confirmation check is the primary defense against injection-driven order placement

### Rate Limiting
- Per-key rate limiting: 100 calls/min, 20 calls/10s burst
- Daily order cap: 10 orders/day/key
- Daily spend cap: $10,000/day/key
- All limits are per-key isolated

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |
