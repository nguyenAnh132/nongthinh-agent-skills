import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateAgainstSchema } from "./schema-validator.mjs";

const projectRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
);

export const CONFIG_FILE_NAME = "agent-skills.json";
export const LOCK_FILE_NAME = "agent-skills.lock.json";
export const CENTRAL_REPOSITORY = "nguyenAnh132/nongthinh-agent-skills";
export const SUPPORTED_AGENTS = Object.freeze([
    "codex",
    "claude-code",
    "antigravity"
]);

const configSchemaPath = path.join(
    projectRoot,
    "schemas",
    "agent-skills.schema.json"
);

export function isSafeGitRef(ref) {
    if (typeof ref !== "string" || ref.length === 0 || ref.length > 255) {
        return false;
    }

    if (/^[a-f0-9]{40}$/i.test(ref)) {
        return true;
    }

    if (
        ref.startsWith("-") ||
        ref.startsWith(".") ||
        ref.endsWith(".") ||
        ref.endsWith("/") ||
        ref.includes("..") ||
        ref.includes("//") ||
        ref.includes("@{") ||
        /[~^:?*[\]\\\s]/.test(ref)
    ) {
        return false;
    }

    return ref.split("/").every((segment) => (
        segment.length > 0 &&
        !segment.startsWith(".") &&
        !segment.endsWith(".lock")
    ));
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unknownFields(value, allowed, location) {
    if (!isPlainObject(value)) {
        return [];
    }
    return Object.keys(value)
        .filter((key) => !allowed.includes(key))
        .map((key) => `${location}: unknown field ${key}`);
}

function hasDuplicates(values) {
    return new Set(values).size !== values.length;
}

function validateConfigContract(config) {
    if (!isPlainObject(config)) {
        return ["/: must be an object"];
    }

    const errors = unknownFields(
        config,
        ["$schema", "schemaVersion", "source", "skills", "agents"],
        "/"
    );

    if (
        config.$schema !== undefined &&
        (
            typeof config.$schema !== "string" ||
            !config.$schema.trim() ||
            /[\x00-\x20]/.test(config.$schema)
        )
    ) {
        errors.push("/$schema: must be a non-empty URI reference");
    }
    if (config.schemaVersion !== 1) {
        errors.push("/schemaVersion: must equal 1");
    }
    if (!isPlainObject(config.source)) {
        errors.push("/source: must be an object");
    } else {
        errors.push(...unknownFields(config.source, ["repository", "ref"], "/source"));
        if (config.source.repository !== CENTRAL_REPOSITORY) {
            errors.push(`/source/repository: must equal ${CENTRAL_REPOSITORY}`);
        }
        if (!isSafeGitRef(config.source.ref)) {
            errors.push("/source/ref: must be a safe Git branch, tag, or full commit SHA");
        }
    }

    if (!Array.isArray(config.skills) || config.skills.length === 0) {
        errors.push("/skills: must be a non-empty array");
    } else {
        if (hasDuplicates(config.skills)) {
            errors.push("/skills: must not contain duplicates");
        }
        for (const skill of config.skills) {
            if (
                typeof skill !== "string" ||
                skill.length > 64 ||
                !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill)
            ) {
                errors.push(`/skills: invalid skill name ${String(skill)}`);
            }
        }
    }

    if (!Array.isArray(config.agents) || config.agents.length === 0) {
        errors.push("/agents: must be a non-empty array");
    } else {
        if (hasDuplicates(config.agents)) {
            errors.push("/agents: must not contain duplicates");
        }
        for (const agent of config.agents) {
            if (!SUPPORTED_AGENTS.includes(agent)) {
                errors.push(`/agents: unsupported agent ${String(agent)}`);
            }
        }
    }

    return errors;
}

export async function validateConfigObject(config) {
    const contractErrors = validateConfigContract(config);
    if (contractErrors.length > 0) {
        return contractErrors;
    }
    return validateAgainstSchema(configSchemaPath, config);
}

export async function readConfig(configPath) {
    let content;

    try {
        content = await readFile(configPath, "utf8");
    } catch (error) {
        throw new Error(`Cannot read configuration ${configPath}: ${error.message}`);
    }

    let config;

    try {
        config = JSON.parse(content);
    } catch (error) {
        throw new Error(`Invalid JSON in ${configPath}: ${error.message}`);
    }

    const errors = await validateConfigObject(config);

    if (errors.length > 0) {
        throw new Error(
            `Invalid configuration ${configPath}:\n${errors.map((error) => `- ${error}`).join("\n")}`
        );
    }

    return config;
}

export async function validateConfiguredSkills(config, skillsDirectory) {
    const entries = await readdir(skillsDirectory, { withFileTypes: true });
    const available = new Set(
        entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    );
    return config.skills
        .filter((skill) => !available.has(skill))
        .map((skill) => `Unknown skill: ${skill}`);
}

export function getProjectRoot() {
    return projectRoot;
}
