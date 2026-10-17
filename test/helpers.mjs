import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    rm,
    writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CENTRAL_REPOSITORY } from "../src/config.mjs";
import { fetchGitSkills } from "../src/git-source.mjs";

export function runGit(repository, args) {
    return new Promise((resolve, reject) => {
        execFile(
            "git",
            args,
            { cwd: repository, encoding: "utf8", windowsHide: true },
            (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(String(stderr || error.message).trim()));
                    return;
                }
                resolve(stdout.trim());
            }
        );
    });
}

export async function makeTemporaryDirectory(prefix = "agent-skills-test-") {
    return mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function createSkill(repository, name, body = "Follow the instructions.") {
    const directory = path.join(repository, "skills", name);
    await mkdir(directory, { recursive: true });
    await writeFile(
        path.join(directory, "SKILL.md"),
        `---\nname: ${name}\ndescription: Use this skill when testing ${name}.\n---\n\n# ${name}\n\n${body}\n`,
        "utf8"
    );
}

export async function createSourceRepository(root) {
    const repository = path.join(root, "source");
    await mkdir(repository);
    await runGit(repository, ["init", "-b", "main"]);
    await runGit(repository, ["config", "user.name", "Agent Skills Test"]);
    await runGit(repository, ["config", "user.email", "test@example.com"]);
    await createSkill(repository, "clean-code");
    await createSkill(repository, "code-review");
    await runGit(repository, ["add", "."]);
    await runGit(repository, ["commit", "-m", "initial skills"]);
    return repository;
}

export async function commitAll(repository, message) {
    await runGit(repository, ["add", "."]);
    await runGit(repository, ["commit", "-m", message]);
    return runGit(repository, ["rev-parse", "HEAD"]);
}

export async function writeConsumerConfig(root, overrides = {}) {
    const config = {
        schemaVersion: 1,
        source: {
            repository: CENTRAL_REPOSITORY,
            ref: "main"
        },
        skills: ["clean-code"],
        agents: ["codex"],
        ...overrides
    };
    await writeFile(
        path.join(root, "agent-skills.json"),
        `${JSON.stringify(config, null, 2)}\n`,
        "utf8"
    );
    return config;
}

export function sourceFetcher(repository) {
    return (request) => fetchGitSkills({
        ...request,
        repositoryUrlResolver: () => repository
    });
}

async function collectSnapshot(root, current, snapshot) {
    const entries = await readdir(current, { withFileTypes: true });

    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        const absolutePath = path.join(current, entry.name);
        const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");

        if (entry.isDirectory()) {
            snapshot.push(`D ${relativePath}`);
            await collectSnapshot(root, absolutePath, snapshot);
        } else if (entry.isSymbolicLink()) {
            snapshot.push(`L ${relativePath}`);
        } else {
            const content = await readFile(absolutePath);
            const hash = createHash("sha256").update(content).digest("hex");
            snapshot.push(`F ${relativePath} ${hash}`);
        }
    }
}

export async function snapshotDirectory(root) {
    const snapshot = [];
    await collectSnapshot(root, root, snapshot);
    return snapshot;
}

export async function cleanup(root) {
    await rm(root, { recursive: true, force: true });
}
