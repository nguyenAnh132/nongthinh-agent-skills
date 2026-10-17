# Creating an Agent Skill

## Directory Layout

Create a lowercase kebab-case directory under `skills/`:

```text
skills/my-skill/
|-- SKILL.md          # required
|-- scripts/          # optional; never run by the sync CLI
|-- references/       # optional
`-- assets/           # optional
```

Do not add symbolic links or Git submodules to a skill bundle.

## SKILL.md

Every skill needs YAML frontmatter followed by non-empty Markdown instructions:

```markdown
---
name: my-skill
description: Performs a focused task. Use when the user asks for that task.
---

# My Skill

Follow these steps...
```

`name` must match the parent directory, use lowercase letters, digits, and single hyphens, and contain at most 64 characters. `description` must explain what the skill does and when it applies, with at most 1,024 characters.

Portable optional fields are `license`, `compatibility`, `metadata`, and experimental `allowed-tools`. Do not use vendor-specific behavior unless compatibility is documented and reviewed.

## Authoring Guidelines

- Keep one skill focused on one job.
- Prefer instructions over executable scripts.
- Reference bundled files with relative paths.
- Never embed credentials or private data.
- Clearly document required commands, network access, and side effects.
- Keep the main file concise; place detailed material in `references/`.

## Validate Before Review

```powershell
npm run skills:validate
npm test
```

The pull request should explain the trigger scope, bundled scripts or assets, security implications, and how the skill was tested.
