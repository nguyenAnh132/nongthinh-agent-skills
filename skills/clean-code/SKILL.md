---
name: clean-code
description: Apply Clean Code, SOLID, and maintainability principles when writing, reviewing, or refactoring application code. Use when improving code quality, reducing duplication, simplifying complex logic, or restructuring code.
---

# Clean Code

## Purpose

Improve code readability, maintainability, testability, and consistency without introducing unnecessary complexity.

## Core Principles

1. Use meaningful and consistent names.
2. Keep functions focused on a single responsibility.
3. Prefer simple solutions over unnecessary abstractions.
4. Avoid duplicated business logic.
5. Follow SOLID principles when applicable.
6. Prefer explicit dependencies over hidden coupling.
7. Handle errors clearly and consistently.
8. Keep code easy to test and maintain.

## Workflow

When writing or refactoring code:

1. Understand the existing behavior and requirements.
2. Identify concrete code quality problems.
3. Propose the smallest reasonable improvement.
4. Preserve existing functionality unless changes are requested.
5. Follow the project's established architecture and conventions.
6. Add or update relevant tests when appropriate.
7. Explain important changes and trade-offs.

## Refactoring Guidelines

- Do not refactor unrelated modules.
- Do not introduce design patterns without a clear benefit.
- Avoid premature optimization.
- Prefer composition when inheritance adds unnecessary coupling.
- Keep public APIs compatible unless breaking changes are explicitly approved.
- Do not silently change business rules.
- Avoid adding dependencies without justification.

## Validation

Before completing a task:

- Check that the requested behavior is implemented.
- Review naming, readability, and duplication.
- Check error handling and edge cases.
- Run relevant tests and static analysis when available.
- Report any tests that could not be executed.

## Output Expectations

When suggesting improvements:

1. Explain the identified problem.
2. Describe the proposed change.
3. Implement the change when authorized.
4. Explain relevant trade-offs.
5. Summarize validation results.

## Project Adaptation

Follow repository-specific instructions and technology conventions.

Do not assume the project uses a particular language, framework, database, or architecture unless confirmed by the repository context.
