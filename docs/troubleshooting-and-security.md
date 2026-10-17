# Troubleshooting and Security

## Common Errors

### `Invalid configuration`

Check spelling, duplicate entries, unsupported agents, unknown fields, and the Git ref. Validate a file from the central repository with:

```powershell
npm run config:validate -- C:\path\to\agent-skills.json
```

### `Cannot resolve source revision`

Confirm Git is on `PATH`, GitHub is reachable, and the branch, tag, or full commit SHA exists. The configured repository is intentionally restricted to the Nong Thinh central repository.

### `Unknown skill at source revision`

The selected skill is absent from the resolved commit. Skill availability is checked at that commit, not against the latest `master` branch.

### `existing files are not managed by this CLI`

The destination already contains different user-owned files. Move or reconcile them manually. The CLI has no force-overwrite option.

### `managed files were modified locally`

A generated file differs from its recorded hash. Review the local changes. Either preserve them outside the managed target or restore the locked version before syncing.

### `Check failed`

Run `sync --dry-run` locally, then `sync`, review the diff, and commit the result. CI check mode never fixes files automatically.

## Security Model

- Configuration rejects unknown fields, unsafe Git refs, duplicate selections, and unsupported agents.
- Only the configured central GitHub repository is accepted.
- Skill names and every bundled path are validated for traversal and Windows-unsafe components.
- Git symlinks, filesystem symlinks, special files, and submodules are rejected in managed paths.
- Source blobs are read without checking out the remote repository.
- Bundle size and file count are bounded.
- Existing unowned files are never overwritten or deleted.
- Cleanup is limited to targets recorded in the previous lock and only when their hashes still match.
- Normal writes use staging, backup, atomic rename where available, and rollback.
- Downloaded scripts are copied but never executed by the synchronization CLI.
- GitHub Actions use read-only permissions and do not persist checkout credentials.

## Remaining Trust Boundaries

Agent Skills are instructions consumed by powerful coding agents. Review them like source code, especially scripts and instructions requesting network or credential access.

The filesystem safety checks prevent ordinary traversal and symlink attacks, but no portable Node.js API can make a multi-file update fully race-free against a separate malicious process rewriting paths concurrently. Run synchronization in a trusted local checkout or isolated CI runner.

Branches float and tags can be moved. The lock records the resolved commit, but use full commit SHAs for production consumers and pin the CLI workflow itself to a commit SHA.
