
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
);

const skillsDirectory = path.join(root, "skills");
const namePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function validateSkill(directoryName) {
    const errors = [];
    const skillFile = path.join(
        skillsDirectory,
        directoryName,
        "SKILL.md"
    );

    let content;

    try {
        content = await readFile(skillFile, "utf8");
    } catch {
        return [`${directoryName}: SKILL.md is missing or unreadable`];
    }

    const match = content.match(
        /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/
    );

    if (!match) {
        return [`${directoryName}: YAML frontmatter is missing`];
    }

    let metadata;

    try {
        metadata = YAML.parse(match[1], { uniqueKeys: true });
    } catch (error) {
        return [`${directoryName}: Invalid YAML - ${error.message}`];
    }

    if (
        !metadata ||
        typeof metadata !== "object" ||
        Array.isArray(metadata)
    ) {
        return [`${directoryName}: Frontmatter must be a YAML object`];
    }

    if (
        typeof metadata.name !== "string" ||
        !namePattern.test(metadata.name) ||
        metadata.name.length > 64
    ) {
        errors.push(
            `${directoryName}: Invalid name (use lowercase kebab-case, max 64 characters)`
        );
    } else if (metadata.name !== directoryName) {
        errors.push(
            `${directoryName}: Name must match directory name`
        );
    }

    if (
        typeof metadata.description !== "string" ||
        !metadata.description.trim() ||
        metadata.description.length > 1024
    ) {
        errors.push(
            `${directoryName}: Description must be non-empty and at most 1024 characters`
        );
    }

    const instructions = content.slice(match[0].length).trim();

    if (!instructions) {
        errors.push(`${directoryName}: Skill instructions are empty`);
    }

    return errors;
}

async function main() {
    const entries = await readdir(skillsDirectory, {
        withFileTypes: true
    });

    const directories = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();

    if (directories.length === 0) {
        throw new Error("No skills found");
    }

    let failureCount = 0;

    for (const directory of directories) {
        const errors = await validateSkill(directory);

        if (errors.length === 0) {
            console.log(`PASS ${directory}`);
        } else {
            for (const error of errors) {
                console.error(`FAIL ${error}`);
            }
            failureCount += errors.length;
        }
    }

    console.log(
        `\nValidated ${directories.length} skills. Errors: ${failureCount}`
    );

    if (failureCount > 0) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error(`Validation failed: ${error.message}`);
    process.exitCode = 1;
});
