# Contributing

Thank you for your interest in contributing to the SkyFi MCP Server.

## Development Setup

```bash
git clone https://github.com/skyfi/skyfi-mcp.git
cd skyfi-mcp
npm install
npm run build
npm test
```

## Making Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Run checks: `npm run check` (typecheck + lint + test)
5. Commit with a descriptive message
6. Open a pull request

## Code Standards

- TypeScript strict mode
- ESLint + Prettier enforced
- All tools must go through the response envelope layer
- All tool descriptions are product copy — review carefully when modifying
- Tests required for new tools and guardrails

## Adding a New Tool

1. Create the handler in `src/tools/`
2. Define the Zod input schema
3. Register the tool in `src/server.ts` with an LLM-perspective description
4. Add unit tests
5. Update `docs/TOOL_DESCRIPTIONS.md`

## Pull Request Checklist

- [ ] `npm run check` passes (typecheck + lint + test)
- [ ] New tools have descriptions written from the LLM's perspective
- [ ] No API keys or secrets in the diff
- [ ] Response envelope used for all tool responses
- [ ] Destructive tools have `destructiveHint` annotation

## Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.
