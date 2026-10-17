# Consumer Installation and Synchronization

## 1. Prepare the Consumer

At the consumer repository root, create `agent-skills.json`. Choose only the required skills and agents. Pin `source.ref` to a 40-character central repository commit SHA.

Commit generated project skills so local development and CI inspect the same files:

```text
agent-skills.json
agent-skills.lock.json
.agents/skills/       # when Codex or Antigravity is selected
.claude/skills/       # when Claude Code is selected
```

## 2. Prepare a Pinned CLI Copy

Use a separate tool revision from the skill source revision. After this implementation is committed, replace `<TOOL_COMMIT_SHA>` with that commit:

```powershell
$ToolPath = "C:\Tools\nongthinh-agent-skills"
git clone https://github.com/nguyenAnh132/nongthinh-agent-skills.git $ToolPath
git -C $ToolPath fetch --depth 1 origin <TOOL_COMMIT_SHA>
git -C $ToolPath checkout --detach FETCH_HEAD
npm ci --prefix $ToolPath
```

Developers working in the central repository can use its current working tree instead.

## 3. Preview and Install

From the consumer repository:

```powershell
node "$ToolPath\bin\agent-skills.mjs" sync --root . --dry-run
node "$ToolPath\bin\agent-skills.mjs" sync --root .
git diff -- agent-skills.json agent-skills.lock.json .agents .claude
```

Review every generated skill before committing it. The CLI never executes downloaded skill scripts.

## 4. Verify in CI

```powershell
node "$ToolPath\bin\agent-skills.mjs" sync --root . --check
```

Check mode fails if the lock or installed files need changes. It does not write to the consumer.

## 5. Synchronize Updates

For a commit-pinned configuration, change `source.ref` to the reviewed new SHA, run dry-run, then sync.

For a development branch or tag whose name remains unchanged:

```powershell
node "$ToolPath\bin\agent-skills.mjs" sync --root . --update --dry-run
node "$ToolPath\bin\agent-skills.mjs" sync --root . --update
```

Without `--update`, the existing locked commit remains selected. Review and commit the updated lock and generated skill files together.

## Agent Behavior

- Codex discovers repository skills from `.agents/skills/`.
- Antigravity uses `.agents/skills/` and therefore shares those copies with Codex.
- Claude Code discovers repository skills from `.claude/skills/`.

Selecting only Codex or only Antigravity still writes to their shared directory. If both products are used in that repository, both can see those skills.

## Complete Nong Thinh Example

A Spring Boot consumer can initially select the shared skills without introducing Java-specific skills:

1. Copy `docs/agent-skills.example.json` to the consumer root as `agent-skills.json`.
2. Keep `clean-code` and `code-review`.
3. Select `codex` and `claude-code` if those are the team's active agents.
4. Replace `source.ref` with the reviewed central commit SHA.
5. Run dry-run, sync, inspect the diff, and commit the configuration, lock, and generated directories.
6. Add the reusable CI check described in `docs/github-actions.md`.
