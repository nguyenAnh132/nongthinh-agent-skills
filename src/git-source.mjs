import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CENTRAL_REPOSITORY, isSafeGitRef } from "./config.mjs";
import { describeFiles } from "./content.mjs";
import { assertSafeRelativePath } from "./paths.mjs";
import { validateSkillContent } from "./skill-validator.mjs";

const MAX_SKILL_FILES = 1_000;
const MAX_SKILL_BYTES = 25 * 1024 * 1024;

function gitEnvironment() {
    return {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : os.devNull,
        GIT_TERMINAL_PROMPT: "0",
        GCM_INTERACTIVE: "Never",
        LC_ALL: "C"
    };
}

function runGit(args, options = {}) {
    return new Promise((resolve, reject) => {
        execFile(
            "git",
            args,
            {
                cwd: options.cwd,
                encoding: options.binary ? "buffer" : "utf8",
                env: gitEnvironment(),
                maxBuffer: 64 * 1024 * 1024,
                windowsHide: true
            },
            (error, stdout, stderr) => {
                if (error) {
                    const detail = String(stderr || error.message).trim().split(/\r?\n/)[0];
                    reject(new Error(`Git command failed: ${detail}`));
                    return;
                }
                resolve(stdout);
            }
        );
    });
}

function defaultRepositoryUrl(repository) {
    if (repository !== CENTRAL_REPOSITORY) {
        throw new Error(`Unsupported source repository: ${repository}`);
    }
    return `https://github.com/${repository}.git`;
}

function parseTree(output, prefix) {
    const records = output.toString("utf8").split("\0").filter(Boolean);
    const seen = new Set();

    return records.map((record) => {
        const separator = record.indexOf("\t");
        const header = record.slice(0, separator).split(" ");
        const repositoryPath = record.slice(separator + 1);

        if (separator < 0 || header.length !== 3 || header[1] !== "blob") {
            throw new Error(`Unsupported Git tree entry in ${prefix}`);
        }

        if (header[0] === "120000" || header[0] === "160000") {
            throw new Error(`Symbolic links and submodules are not allowed in ${prefix}`);
        }

        if (!repositoryPath.startsWith(`${prefix}/`)) {
            throw new Error(`Unexpected path returned by Git: ${repositoryPath}`);
        }

        if (repositoryPath.includes("\uFFFD")) {
            throw new Error(`Skill path is not valid UTF-8 in ${prefix}`);
        }

        const relativePath = repositoryPath.slice(prefix.length + 1);
        assertSafeRelativePath(relativePath, "skill file path");
        const comparisonKey = relativePath.toLowerCase();

        if (seen.has(comparisonKey)) {
            throw new Error(`Case-insensitive duplicate skill path: ${relativePath}`);
        }
        seen.add(comparisonKey);

        return {
            mode: header[0],
            objectId: header[2],
            path: relativePath
        };
    });
}

async function readSkill(gitDirectory, commit, skillName) {
    const prefix = `skills/${skillName}`;
    const treeOutput = await runGit([
        `--git-dir=${gitDirectory}`,
        "ls-tree",
        "-r",
        "-z",
        "--full-tree",
        commit,
        "--",
        prefix
    ], { binary: true });
    const entries = parseTree(treeOutput, prefix);

    if (entries.length === 0) {
        throw new Error(`Unknown skill at source revision: ${skillName}`);
    }

    if (entries.length > MAX_SKILL_FILES) {
        throw new Error(`${skillName}: Skill bundle exceeds ${MAX_SKILL_FILES} files`);
    }

    const files = [];
    let totalBytes = 0;

    for (const entry of entries) {
        const content = await runGit([
            `--git-dir=${gitDirectory}`,
            "cat-file",
            "blob",
            entry.objectId
        ], { binary: true });
        totalBytes += content.length;

        if (totalBytes > MAX_SKILL_BYTES) {
            throw new Error(`${skillName}: Skill bundle exceeds 25 MiB`);
        }

        files.push({
            path: entry.path,
            content,
            executable: entry.mode === "100755"
        });
    }

    const skillFile = files.find((file) => file.path === "SKILL.md");

    if (!skillFile) {
        throw new Error(`${skillName}: SKILL.md is missing at source revision`);
    }

    const validationErrors = validateSkillContent(
        skillName,
        skillFile.content.toString("utf8")
    );

    if (validationErrors.length > 0) {
        throw new Error(validationErrors.join("\n"));
    }

    const description = describeFiles(files);
    return {
        name: skillName,
        bundleFiles: files,
        files: description.files,
        digest: description.digest
    };
}

export async function fetchGitSkills({
    repository,
    ref,
    skills,
    repositoryUrlResolver = defaultRepositoryUrl
}) {
    if (!isSafeGitRef(ref)) {
        throw new Error(`Unsafe Git reference: ${ref}`);
    }

    const temporaryRoot = await mkdtemp(path.join(
        os.tmpdir(),
        "nongthinh-agent-skills-"
    ));
    const gitDirectory = path.join(temporaryRoot, "source.git");

    try {
        await runGit(["init", "--bare", gitDirectory]);
        const repositoryUrl = repositoryUrlResolver(repository);

        try {
            await runGit([
                `--git-dir=${gitDirectory}`,
                "fetch",
                "--force",
                "--depth=1",
                "--no-tags",
                repositoryUrl,
                ref
            ]);
        } catch (error) {
            throw new Error(`Cannot resolve source revision ${ref}: ${error.message}`);
        }

        const commit = String(await runGit([
            `--git-dir=${gitDirectory}`,
            "rev-parse",
            "FETCH_HEAD^{commit}"
        ])).trim().toLowerCase();

        if (!/^[a-f0-9]{40}$/.test(commit)) {
            throw new Error(`Git returned an invalid commit SHA for ${ref}`);
        }

        if (/^[a-f0-9]{40}$/i.test(ref) && commit !== ref.toLowerCase()) {
            throw new Error(`Resolved commit ${commit} does not match requested SHA ${ref}`);
        }

        const resolvedSkills = [];

        for (const skillName of [...skills].sort()) {
            resolvedSkills.push(await readSkill(gitDirectory, commit, skillName));
        }

        return { commit, skills: resolvedSkills };
    } finally {
        await rm(temporaryRoot, { recursive: true, force: true });
    }
}
