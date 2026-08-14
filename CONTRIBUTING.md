# Contributing

## Principles

Changes should preserve the project's core constraints:

1. no central backend;
2. no required runtime dependencies;
3. no Spotify client secret;
4. minimal OAuth scopes;
5. one scheduler trigger per installation;
6. no secret material in Sheet cells or logs;
7. user-facing setup should remain understandable without command-line tooling.

## Development workflow

Requirements for contributors:

- Node.js 22+ for local build/test scripts only.

Run:

```bash
node scripts/build.js
node scripts/test.js
node scripts/build.js --check
```

Local builds generate:

- `dist/SpotiSync.gs`
- `docs/downloads/SpotiSync.gs`

These files are intentionally ignored by Git. GitHub Pages generates its install bundle during deployment. Do not edit generated files manually.

## Source layout

Apps Script source files are deliberately plain global scripts rather than ES modules because Apps Script does not load Node-style modules in a bound project. Internal code lives under the `SpotiSync` namespace; only menu, OAuth callback, and trigger entrypoints are global.

## Pull requests

Keep changes small and include tests for pure planning/parsing logic where practical. If a change affects Spotify API behavior, link the relevant current Spotify developer documentation in the PR description.
