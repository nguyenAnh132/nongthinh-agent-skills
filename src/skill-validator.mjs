import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

const namePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const allowedMetadataFields = new Set([
    "name",
    "description",
    "license",
    "compatibility",
    "metadata",
    "allowed-tools"
]);

export function validateSkillContent(directoryName, content) {
    const errors = [];
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);

    if (!match) {
        return [`${directoryName}: YAML frontmatter is missing`];
    }

    let metadata;

    try {
        metadata = YAML.parse(match[1], { uniqueKeys: true });
    } catch (error) {
        return [`${directoryName}: Invalid YAML - ${error.message}`];
    }

    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
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
        errors.push(`${directoryName}: Name must match directory name`);
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

    if (
        metadata.compatibility !== undefined &&
        (
            typeof metadata.compatibility !== "string" ||
            !metadata.compatibility.trim() ||
            metadata.compatibility.length > 500
        )
    ) {
        errors.push(
            `${directoryName}: Compatibility must be a non-empty string of at most 500 characters`
        );
    }

    if (
        metadata.license !== undefined &&
        (typeof metadata.license !== "string" || !metadata.license.trim())
    ) {
        errors.push(`${directoryName}: License must be a non-empty string`);
    }

    if (
        metadata["allowed-tools"] !== undefined &&
        (
            typeof metadata["allowed-tools"] !== "string" ||
            !metadata["allowed-tools"].trim()
        )
    ) {
        errors.push(`${directoryName}: Allowed tools must be a non-empty string`);
    }

    if (
        metadata.metadata !== undefined &&
        (
            !metadata.metadata ||
            typeof metadata.metadata !== "object" ||
            Array.isArray(metadata.metadata) ||
            Object.values(metadata.metadata).some((value) => typeof value !== "string")
        )
    ) {
        errors.push(`${directoryName}: Metadata values must be strings`);
    }

    for (const key of Object.keys(metadata)) {
        if (!allowedMetadataFields.has(key)) {
            errors.push(`${directoryName}: Unsupported frontmatter field: ${key}`);
        }
    }

    if (!content.slice(match[0].length).trim()) {
        errors.push(`${directoryName}: Skill instructions are empty`);
    }

    return errors;
}

async function containsSymbolicLink(directory) {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
        const entryPath = path.join(directory, entry.name);
        const stats = await lstat(entryPath);

        if (stats.isSymbolicLink()) {
            return true;
        }

        if (stats.isDirectory() && await containsSymbolicLink(entryPath)) {
            return true;
        }
    }

    return false;
}

export async function validateSkillDirectory(skillsDirectory, directoryName) {
    const directory = path.join(skillsDirectory, directoryName);
    const skillFile = path.join(directory, "SKILL.md");

    if (await containsSymbolicLink(directory)) {
        return [`${directoryName}: Symbolic links are not allowed in skill bundles`];
    }

    let content;

    try {
        content = await readFile(skillFile, "utf8");
    } catch {
        return [`${directoryName}: SKILL.md is missing or unreadable`];
    }

    return validateSkillContent(directoryName, content);
}

export async function validateSkillsDirectory(skillsDirectory) {
    const entries = await readdir(skillsDirectory, { withFileTypes: true });
    const directories = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();

    if (directories.length === 0) {
        throw new Error("No skills found");
    }

    const results = [];

    for (const directoryName of directories) {
        results.push({
            name: directoryName,
            errors: await validateSkillDirectory(skillsDirectory, directoryName)
        });
    }

    return results;
}
