# Skill: find-skills

## Context
SkyFi MCP Server — a production-grade MCP server wrapping SkyFi's satellite imagery platform for AI agent access.

## Codebase
- **Target:** TypeScript MCP server + Python demo agent
- **Structure:** Monorepo with src/ (server), examples/demo-agent/ (Python), docs/ (documentation), tests/, infra/

## Stack
- TypeScript 5.x / Node.js 20 LTS / Cloudflare Workers
- @modelcontextprotocol/sdk (MCP protocol)
- Hono 4.x (HTTP framework, Workers-native)
- Zod 3.x (validation + JSON Schema derivation)
- Vitest (testing)
- tsup (bundling)
- Nominatim/OSM (geocoding)
- Cloudflare Workers KV (ephemeral stores: idempotency, rate limits, quotes)
- Prometheus + Grafana (self-hosted observability)
- Python + Google ADK (demo agent)

## Key Files
- `skyfi-mcp-prd.md` — Original detailed PRD from SkyFi
- `docs/PRD.md` — Condensed product requirements
- `docs/TASK_LIST.md` — Phased implementation tasks with checklists
- `docs/TECH_STACK.md` — Technology decisions, architecture diagram, env vars, schema
- `docs/USER_FLOW.md` — User journey, API request/response examples
- `docs/MEMO.md` — Architecture decisions with rationale and rejected alternatives
- `docs/ERROR_FIX_LOG.md` — Error tracking log with category prefixes
- `docs/skill-lifecycle.yml` — Skill lifecycle configuration

## Processing Strategy
Request → Auth (header/config) → Abuse Protection → Input Validation → Simulation Engine → Pre-Auth Policy → Idempotency Store → Tool Handler → SkyFi API/Nominatim → Response Envelope → Transport (STDIO/HTTP+SSE)

## Known Patterns
- Two-step confirmation: quote_* → user confirms → execute_* (server-side enforced)
- Standard response envelope on ALL tools: { status, tool, version, simulated, data, meta, warnings }
- Simulation mode: `simulate: true` flag or SKYFI_SIMULATE=true env var
- Idempotency keys required on all execute_* tools (24h TTL)
- AOI area guardrails enforced before any API call
- Credentials never stored server-side (stateless design)
- Tool descriptions are product copy, not boilerplate (LLM-facing, preconditions documented)

## Post-Execution
After this skill completes, if execution failed or produced errors:
1. Run `/skill-lifecycle observe find-skills` to record the failure
2. If the error involved data loss or contradicted skill instructions, add `--critical`
