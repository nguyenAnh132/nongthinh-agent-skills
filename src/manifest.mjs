import { readFile } from "node:fs/promises";
import path from "node:path";
import { getProjectRoot, isSafeGitRef, SUPPORTED_AGENTS } from "./config.mjs";
import { assertSafeRelativePath } from "./paths.mjs";
import { validateAgainstSchema } from "./schema-validator.mjs";

function hasOnlyKeys(value, allowed) {
    return Boolean(value) &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.keys(value).every((key) => allowed.includes(key));
}

function mappedTargetPaths(skillName, agents) {
    return new Set(agents.map((agent) => (
        agent === "claude-code"
            ? `.claude/skills/${skillName}`
            : `.agents/skills/${skillName}`
    )));
}

export async function validateManifest(manifest) {
    const schemaPath = path.join(
        getProjectRoot(),
        "schemas",
        "agent-skills-lock.schema.json"
    );
    const schemaErrors = await validateAgainstSchema(schemaPath, manifest);
    if (schemaErrors.length > 0) {
        throw new Error(
            `Invalid agent-skills.lock.json:\n${schemaErrors.join("\n")}`
        );
    }

    if (
        !hasOnlyKeys(manifest, ["schemaVersion", "source", "skills"]) ||
        manifest.schemaVersion !== 1 ||
        !hasOnlyKeys(manifest.source, ["repository", "ref", "resolvedCommit"]) ||
        manifest.source.repository !== "nguyenAnh132/nongthinh-agent-skills" ||
        !/^[a-f0-9]{40}$/.test(manifest.source.resolvedCommit ?? "") ||
        !manifest.skills ||
        typeof manifest.skills !== "object" ||
        Array.isArray(manifest.skills)
    ) {
        throw new Error("Invalid agent-skills.lock.json: invalid structure");
    }

    if (!isSafeGitRef(manifest.source.ref)) {
        throw new Error("Invalid agent-skills.lock.json: unsafe source ref");
    }

    const targetPaths = new Set();

    for (const [skillName, skill] of Object.entries(manifest.skills)) {
        if (
            !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skillName) ||
            !hasOnlyKeys(skill, ["digest", "targets"]) ||
            !/^sha256:[a-f0-9]{64}$/.test(skill.digest ?? "") ||
            !Array.isArray(skill.targets) ||
            skill.targets.length === 0
        ) {
            throw new Error(`Invalid agent-skills.lock.json: invalid skill ${skillName}`);
        }

        for (const target of skill.targets) {
            if (
                !hasOnlyKeys(target, ["path", "agents", "files"]) ||
                typeof target.path !== "string" ||
                !Array.isArray(target.agents) ||
                target.agents.length === 0 ||
                new Set(target.agents).size !== target.agents.length ||
                target.agents.some((agent) => !SUPPORTED_AGENTS.includes(agent)) ||
                !Array.isArray(target.files) ||
                target.files.length === 0
            ) {
                throw new Error(
                    `Invalid agent-skills.lock.json: invalid target for ${skillName}`
                );
            }
            assertSafeRelativePath(target.path, "lock target path");
            const allowedPaths = mappedTargetPaths(skillName, target.agents);

            if (allowedPaths.size !== 1 || !allowedPaths.has(target.path)) {
                throw new Error(
                    `Invalid agent-skills.lock.json: target ${target.path} does not match its skill and agents`
                );
            }

            if (targetPaths.has(target.path)) {
                throw new Error(
                    `Invalid agent-skills.lock.json: duplicate target ${target.path}`
                );
            }
            targetPaths.add(target.path);

            const filePaths = new Set();
            for (const file of target.files) {
                if (
                    !hasOnlyKeys(file, ["path", "sha256"]) ||
                    typeof file.path !== "string" ||
                    !/^sha256:[a-f0-9]{64}$/.test(file.sha256 ?? "")
                ) {
                    throw new Error(
                        `Invalid agent-skills.lock.json: invalid file entry for ${skillName}`
                    );
                }
                assertSafeRelativePath(file.path, "lock file path");
                const key = file.path.toLowerCase();
                if (filePaths.has(key)) {
                    throw new Error(
                        `Invalid agent-skills.lock.json: duplicate file ${file.path}`
                    );
                }
                filePaths.add(key);
            }
        }
    }

    return manifest;
}

export async function readManifest(lockPath) {
    let content;

    try {
        content = await readFile(lockPath, "utf8");
    } catch (error) {
        if (error.code === "ENOENT") {
            return null;
        }
        throw new Error(`Cannot read lock file ${lockPath}: ${error.message}`);
    }

    let manifest;
    try {
        manifest = JSON.parse(content);
    } catch (error) {
        throw new Error(`Invalid JSON in lock file ${lockPath}: ${error.message}`);
    }

    return validateManifest(manifest);
}

export function serializeManifest(manifest) {
    return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function buildManifest(config, commit, resolvedSkills) {
    const targetsByDirectory = new Map();

    for (const agent of config.agents) {
        if (!SUPPORTED_AGENTS.includes(agent)) {
            throw new Error(`Unsupported agent: ${agent}`);
        }
        const directory = agent === "claude-code"
            ? ".claude/skills"
            : ".agents/skills";
        const agents = targetsByDirectory.get(directory) ?? [];
        agents.push(agent);
        targetsByDirectory.set(directory, agents);
    }

    const skills = {};

    for (const skill of [...resolvedSkills].sort((left, right) => (
        left.name.localeCompare(right.name)
    ))) {
        skills[skill.name] = {
            digest: skill.digest,
            targets: [...targetsByDirectory.entries()]
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([directory, agents]) => ({
                    path: `${directory}/${skill.name}`,
                    agents: [...agents].sort(),
                    files: skill.files
                        .map((file) => ({ ...file }))
                        .sort((left, right) => left.path.localeCompare(right.path))
                }))
        };
    }

    return {
        schemaVersion: 1,
        source: {
            repository: config.source.repository,
            ref: config.source.ref,
            resolvedCommit: commit
        },
        skills
    };
}
