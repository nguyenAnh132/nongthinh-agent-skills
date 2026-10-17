# Nong Thinh Centralized Agent Skills

This repository is the source of truth for reusable AI coding Agent Skills used by the **Nong Thinh - Agri System** repositories. Consumer repositories select only the skills and coding agents they need through `agent-skills.json`.

## What Is Included

- `skills/`: portable skills that follow the open Agent Skills format.
- `schemas/`: JSON Schema contracts for consumer configuration and generated lock files.
- `bin/` and `src/`: the cross-platform synchronization CLI.
- `scripts/`: repository validation commands.
- `test/`: automated tests using temporary consumer and Git repositories.
- `.github/workflows/`: central validation and a reusable consumer check.

The currently maintained skills are `clean-code` and `code-review`. Technology-specific skills are intentionally not included yet.

## Requirements

- Node.js 20 or newer
- npm
- Git available on `PATH`
- Network access to GitHub when synchronizing from the central repository

## Repository Validation

```powershell
npm ci
npm run skills:validate
npm run config:validate
npm test
```

Run every check with:

```powershell
npm run validate
```

## Consumer Quick Start

Add `agent-skills.json` to the consumer repository root. Start from [the example](docs/agent-skills.example.json), but replace `source.ref` with the commit SHA that should provide the skills.

From this repository, preview and apply synchronization to a consumer:

```powershell
node .\bin\agent-skills.mjs sync --root C:\Projects\nong-thinh\my-service --dry-run
node .\bin\agent-skills.mjs sync --root C:\Projects\nong-thinh\my-service
node .\bin\agent-skills.mjs sync --root C:\Projects\nong-thinh\my-service --check
```

Commit the consumer's `agent-skills.json`, generated `agent-skills.lock.json`, `.agents/skills/`, and/or `.claude/skills/`. The lock records the resolved commit and hashes of files owned by the CLI.

Normal `sync` reuses the resolved commit in the lock. Use `sync --update` only when intentionally moving a branch or tag. An explicit change to `source.ref` also selects a new revision.

## Agent Locations

| Agent | Project directory |
|---|---|
| OpenAI Codex | `.agents/skills/` |
| Google Antigravity | `.agents/skills/` |
| Anthropic Claude Code | `.claude/skills/` |

Codex and Antigravity share one physical copy when both are selected. The CLI uses regular copied files for Windows portability and never executes downloaded scripts.

## Documentation

- [Architecture](docs/architecture.md)
- [Consumer configuration contract](docs/consumer-configuration.md)
- [Consumer installation and synchronization](docs/consumer-guide.md)
- [Creating a skill](docs/creating-skills.md)
- [GitHub Actions integration](docs/github-actions.md)
- [Troubleshooting and security](docs/troubleshooting-and-security.md)

## Project Status

The configuration, synchronization, locking, safety, test, and CI foundations are implemented. Publishing npm packages or GitHub releases is outside the current scope.
