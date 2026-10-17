---
name: code-review
description: Review code changes for correctness, security, reliability, performance, and maintainability. Use when reviewing pull requests, commits, diffs, or existing code to identify actionable issues and risks.
---

# Code Review

## Purpose

Identify actionable defects and risks in code changes before they are merged or released.

Prioritize correctness, security, and reliability over subjective style preferences.

## Review Scope

1. Understand the task requirements and expected behavior.
2. Identify the files and changes within the requested scope.
3. Examine relevant surrounding code and dependencies.
4. Review the changes without modifying files unless explicitly requested.

## Review Checklist

### Correctness
- Check logic, conditions, and calculations.
- Identify unhandled edge cases.
- Verify input validation and error handling.
- Check compatibility with existing behavior.

### Security
- Identify potential injection vulnerabilities.
- Check authentication and authorization boundaries.
- Look for exposed credentials and sensitive data.
- Review handling of untrusted inputs.
- Avoid logging secrets or personal information.

### Reliability
- Check failure handling and resource cleanup.
- Identify race conditions and concurrency issues.
- Review transaction boundaries when relevant.
- Check timeout and retry behavior where applicable.

### Performance
- Identify unnecessary expensive operations.
- Check for inefficient queries or repeated network calls.
- Evaluate resource usage when there is evidence of risk.
- Avoid speculative optimization findings.

### Maintainability
- Identify confusing logic and unnecessary coupling.
- Check consistency with existing conventions.
- Flag duplication when it creates a concrete maintenance risk.
- Avoid subjective formatting comments handled by linters.

### Testing
- Check coverage of changed behavior.
- Identify missing important edge-case tests.
- Review whether existing tests remain valid.
- Do not claim tests passed unless they were executed.

## Severity Levels

- Critical: Exploitable security vulnerabilities, severe data loss, or similarly catastrophic defects.
- High: Bugs likely to cause significant incorrect behavior or production failures.
- Medium: Meaningful defects that affect specific scenarios or maintainability.
- Low: Minor actionable issues with limited impact.

## Review Workflow

1. Read the requirements and change summary.
2. Inspect the diff and relevant context.
3. Identify potential issues.
4. Verify each finding against the actual code.
5. Remove speculative or unsupported findings.
6. Assign severity based on impact and likelihood.
7. Report actionable findings with precise locations.

## Output Format

For each finding, provide:

- Severity
- File and line number, when available
- Problem description
- Conditions that trigger the issue
- Potential impact
- Recommended fix

Order findings by severity, highest first.

If no actionable findings are identified, state that explicitly and mention any review limitations.

## Constraints

- Do not invent defects.
- Do not claim code was executed when it was not.
- Do not modify source code during a review unless requested.
- Do not expose secrets discovered during review.
- Do not recommend major architectural changes without evidence.
- Follow repository-specific instructions and technology conventions.
