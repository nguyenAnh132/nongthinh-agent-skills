# Architecture

## Hybrid Ownership Model

The central repository owns reusable skill definitions, validation, schemas, the synchronization CLI, releases, and documentation. Each consumer owns its selection, target agents, source pin, generated lock, and installed copies.

```text
Central Git revision
        |
        | selected skills only
        v
agent-skills.json -> sync CLI -> agent-skills.lock.json
                         |----> .agents/skills/   (Codex + Antigravity)
                         `----> .claude/skills/   (Claude Code)
```

## Synchronization Flow

1. Validate `agent-skills.json` with JSON Schema and semantic checks.
2. Reuse the lock's resolved commit unless `--update` is requested or `source.ref` changed.
3. Fetch the requested Git revision into an operating-system temporary directory.
4. Read selected blobs with Git without checking out or running repository content.
5. Validate `SKILL.md`, paths, file modes, sizes, and hashes.
6. Compare desired files with the consumer and previous ownership records.
7. Stop before writes when an unowned or locally modified conflict exists.
8. Stage new copies, rename old copies to backup, apply changes, write the lock, and roll back on failure.

`--dry-run` and `--check` finish before staging begins, so they do not modify the consumer repository.

## Versioning

A full commit SHA is immutable and recommended. A tag or branch is resolved to a SHA on the first sync. Later `sync` operations use that locked SHA; `sync --update` explicitly moves a floating ref. Changing `source.ref` in configuration is also an explicit revision change.

## Vercel Skills CLI Decision

The Vercel CLI is useful for discovery and interactive installation, but it is not the synchronization engine here. The Nong Thinh CLI requires its own declarative contract, stable check mode, controlled revision updates, exact ownership, safe cleanup, and rollback. Skills remain compatible with the open Agent Skills format and can still be installed manually with ecosystem tooling.

Compatibility decisions are based on the current [OpenAI Codex skill documentation](https://developers.openai.com/codex/skills), [Claude Code skill documentation](https://code.claude.com/docs/en/skills), [Google Antigravity skill documentation](https://antigravity.google/docs/skills?app=antigravity-ide), [Agent Skills specification](https://agentskills.io/specification), and [Vercel Skills CLI](https://github.com/vercel-labs/skills).

## Scope

Installation is project-scoped. Global user directories, automatic pull requests, package publishing, and agent-specific frontmatter extensions are intentionally excluded.
