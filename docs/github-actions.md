# GitHub Actions Integration

## Central Repository Validation

`.github/workflows/validate.yml` runs on pull requests and pushes to `master`. It installs exact dependencies with `npm ci`, validates skills and the example configuration, and runs all automated tests.

The workflow has only `contents: read` permission. Pull request code receives no write token or deployment secret.

## Reusable Consumer Check

Consumer repositories can call `.github/workflows/consumer-sync-check.yml`. Pin both the reusable workflow and its `tool-ref` input to the same reviewed central commit SHA:

```yaml
name: Agent Skills

on:
  pull_request:
  push:
    branches:
      - master

permissions:
  contents: read

jobs:
  agent-skills:
    uses: nguyenAnh132/nongthinh-agent-skills/.github/workflows/consumer-sync-check.yml@<TOOL_COMMIT_SHA>
    with:
      tool-ref: <TOOL_COMMIT_SHA>
    permissions:
      contents: read
```

Replace both placeholders after the central implementation is committed. A full SHA prevents the workflow implementation from changing unexpectedly.

The reusable workflow:

1. checks out the consumer without persisted credentials;
2. checks out the pinned central tool;
3. runs `npm ci` only for the tool;
4. executes `sync --check` against the consumer.

It does not commit, push, create pull requests, or execute scripts bundled inside downloaded skills.

## Applying Updates

Run `sync` locally, review the diff, and submit the generated changes through the consumer's normal pull request process. Automatic pull request creation can be added later as an optional consumer-owned workflow, but it is deliberately not part of the reusable check.
