# Nong Thinh — Centralized Agent Skills

Centralized Agent Skills Management for **Nong Thinh – Agri System**.

## Overview

This repository is the single source of truth for reusable AI coding agent skills across Nong Thinh's repositories.

## Goals

- Centralize reusable Agent Skills.
- Support selective skill installation.
- Support OpenAI Codex, Claude Code, and Google Antigravity.
- Enable reproducible and version-controlled synchronization.
- Improve consistency across developers and repositories.

## Repository Structure

| Directory | Purpose |
|---|---|
| `skills/` | Reusable Agent Skills |
| `scripts/` | Validation and synchronization utilities |
| `schemas/` | Configuration schemas |
| `docs/` | Technical documentation |
| `.github/workflows/` | GitHub Actions workflows |

## Planned Workflow

1. Define skills in this repository.
2. Release a version using a Git tag.
3. Declare required skills in each consumer repository.
4. Synchronize skills using a configuration-driven command.
5. Validate installed skills and their versions.

## Project Status

**In development.**

The synchronization tool, version management, and CI workflows have not been implemented yet.

## Security

Review skills and their associated scripts before use. Never commit credentials, access tokens, private keys, or other secrets.

## License

To be determined.