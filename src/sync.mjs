import {
    chmod,
    lstat,
    mkdir,
    mkdtemp,
    realpath,
    rename,
    rm,
    rmdir,
    writeFile
} from "node:fs/promises";
import path from "node:path";
import {
    CONFIG_FILE_NAME,
    LOCK_FILE_NAME,
    readConfig
} from "./config.mjs";
import {
    describeDirectory,
    descriptionsEqual
} from "./content.mjs";
import { fetchGitSkills } from "./git-source.mjs";
import {
    buildManifest,
    readManifest,
    serializeManifest
} from "./manifest.mjs";
import {
    assertNoSymbolicLinkComponents,
    assertSafeRelativePath,
    resolveInside,
    toPosixPath
} from "./paths.mjs";

export class CheckFailedError extends Error {
    constructor(plan) {
        super("Installed Agent Skills are not synchronized");
        this.name = "CheckFailedError";
        this.plan = plan;
    }
}

async function getStats(filePath) {
    try {
        return await lstat(filePath);
    } catch (error) {
        if (error.code === "ENOENT") {
            return null;
        }
        throw error;
    }
}

function assertPathInside(root, candidate, label) {
    const relative = path.relative(root, candidate);

    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error(`${label} must be inside the consumer repository`);
    }

    return toPosixPath(relative);
}

async function assertRegularFile(root, filePath, label) {
    const relative = assertPathInside(root, filePath, label);
    await assertNoSymbolicLinkComponents(root, relative);
    const stats = await getStats(filePath);

    if (!stats || !stats.isFile() || stats.isSymbolicLink()) {
        throw new Error(`${label} must be a regular file: ${filePath}`);
    }
}

function manifestTargetMap(manifest) {
    const targets = new Map();

    if (!manifest) {
        return targets;
    }

    for (const [skillName, skill] of Object.entries(manifest.skills)) {
        for (const target of skill.targets) {
            targets.set(target.path, {
                skillName,
                digest: skill.digest,
                files: target.files
            });
        }
    }

    return targets;
}

async function inspectTarget(root, relativePath) {
    await assertNoSymbolicLinkComponents(root, relativePath);
    const absolutePath = resolveInside(root, relativePath, "managed target");
    const stats = await getStats(absolutePath);

    if (!stats) {
        return null;
    }

    if (stats.isSymbolicLink() || !stats.isDirectory()) {
        throw new Error(`Managed target must be a regular directory: ${relativePath}`);
    }

    return describeDirectory(absolutePath);
}

function expectedDescription(skill, target) {
    return {
        digest: skill.digest,
        files: target.files
    };
}

async function createPlan(root, oldManifest, desiredManifest, resolvedSkills) {
    const oldTargets = manifestTargetMap(oldManifest);
    const desiredTargets = manifestTargetMap(desiredManifest);
    const sourceSkills = new Map(resolvedSkills.map((skill) => [skill.name, skill]));
    const operations = [];
    const messages = [];

    for (const [relativePath, desired] of [...desiredTargets.entries()].sort()) {
        const actual = await inspectTarget(root, relativePath);
        const desiredDescription = desired;
        const previous = oldTargets.get(relativePath);

        if (!actual) {
            operations.push({
                type: "create",
                path: relativePath,
                skill: sourceSkills.get(desired.skillName)
            });
            messages.push(`CREATE ${relativePath}`);
            continue;
        }

        if (descriptionsEqual(actual, desiredDescription)) {
            continue;
        }

        if (!previous) {
            throw new Error(
                `Conflict at ${relativePath}: existing files are not managed by this CLI`
            );
        }

        if (!descriptionsEqual(actual, previous)) {
            throw new Error(
                `Conflict at ${relativePath}: managed files were modified locally`
            );
        }

        operations.push({
            type: "replace",
            path: relativePath,
            skill: sourceSkills.get(desired.skillName)
        });
        messages.push(`UPDATE ${relativePath}`);
    }

    for (const [relativePath, previous] of [...oldTargets.entries()].sort()) {
        if (desiredTargets.has(relativePath)) {
            continue;
        }

        const actual = await inspectTarget(root, relativePath);
        if (!actual) {
            continue;
        }

        if (!descriptionsEqual(actual, previous)) {
            throw new Error(
                `Conflict at ${relativePath}: managed files were modified locally; refusing cleanup`
            );
        }

        operations.push({ type: "remove", path: relativePath });
        messages.push(`REMOVE ${relativePath}`);
    }

    const oldSerialized = oldManifest ? serializeManifest(oldManifest) : null;
    const desiredSerialized = serializeManifest(desiredManifest);
    const manifestChanged = oldSerialized !== desiredSerialized;

    if (manifestChanged) {
        messages.push(`${oldManifest ? "UPDATE" : "CREATE"} ${LOCK_FILE_NAME}`);
    }

    return {
        changed: operations.length > 0 || manifestChanged,
        manifestChanged,
        operations,
        messages,
        desiredSerialized
    };
}

async function ensureParentDirectories(root, relativePath, createdDirectories) {
    const parentSegments = assertSafeRelativePath(relativePath).split("/").slice(0, -1);
    let currentRelative = "";

    for (const segment of parentSegments) {
        currentRelative = currentRelative ? `${currentRelative}/${segment}` : segment;
        const current = resolveInside(root, currentRelative);
        const stats = await getStats(current);

        if (stats) {
            if (stats.isSymbolicLink() || !stats.isDirectory()) {
                throw new Error(`Unsafe managed parent directory: ${currentRelative}`);
            }
            continue;
        }

        await mkdir(current);
        createdDirectories.push(current);
    }
}

async function writeSkillBundle(directory, skill) {
    await mkdir(directory, { recursive: true });

    for (const file of skill.bundleFiles) {
        const filePath = resolveInside(directory, file.path, "skill file path");
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, file.content, { flag: "wx" });

        if (file.executable && process.platform !== "win32") {
            await chmod(filePath, 0o755);
        }
    }
}

async function applyPlan(root, lockPath, plan, hooks = {}) {
    if (!plan.changed) {
        return;
    }

    const stagingRoot = await mkdtemp(path.join(root, ".agent-skills-stage-"));
    const stagedTargets = path.join(stagingRoot, "targets");
    const backups = path.join(stagingRoot, "backups");
    const completed = [];
    const createdDirectories = [];
    let lockState = null;

    try {
        await mkdir(stagedTargets);
        await mkdir(backups);

        for (let index = 0; index < plan.operations.length; index += 1) {
            const operation = plan.operations[index];
            if (operation.type === "remove") {
                continue;
            }
            const stagedPath = path.join(stagedTargets, String(index));
            await writeSkillBundle(stagedPath, operation.skill);
        }

        const stagedLock = path.join(stagingRoot, "new-lock.json");
        if (plan.manifestChanged) {
            await writeFile(stagedLock, plan.desiredSerialized, {
                encoding: "utf8",
                flag: "wx"
            });
        }

        for (let index = 0; index < plan.operations.length; index += 1) {
            const operation = plan.operations[index];
            await assertNoSymbolicLinkComponents(root, operation.path);
            const targetPath = resolveInside(root, operation.path, "managed target");
            const backupPath = path.join(backups, String(index));
            const state = { operation, targetPath, backupPath, installed: false, backedUp: false };
            completed.push(state);

            if (operation.type === "replace" || operation.type === "remove") {
                await rename(targetPath, backupPath);
                state.backedUp = true;
            }

            if (operation.type === "create" || operation.type === "replace") {
                await ensureParentDirectories(root, operation.path, createdDirectories);
                await rename(path.join(stagedTargets, String(index)), targetPath);
                state.installed = true;
            }

            if (hooks.afterMutation) {
                await hooks.afterMutation(operation, index);
            }
        }

        if (plan.manifestChanged) {
            const existingLock = await getStats(lockPath);
            lockState = {
                backupPath: path.join(backups, "lock.json"),
                installed: false,
                backedUp: false
            };

            if (existingLock) {
                if (existingLock.isSymbolicLink() || !existingLock.isFile()) {
                    throw new Error(`${LOCK_FILE_NAME} must be a regular file`);
                }
                await rename(lockPath, lockState.backupPath);
                lockState.backedUp = true;
            }

            await rename(stagedLock, lockPath);
            lockState.installed = true;
        }
    } catch (error) {
        const rollbackErrors = [];

        if (lockState) {
            try {
                if (lockState.installed) {
                    await rm(lockPath, { force: true });
                }
                if (lockState.backedUp) {
                    await rename(lockState.backupPath, lockPath);
                }
            } catch (rollbackError) {
                rollbackErrors.push(rollbackError.message);
            }
        }

        for (const state of completed.reverse()) {
            try {
                if (state.installed) {
                    await rm(state.targetPath, { recursive: true, force: true });
                }
                if (state.backedUp) {
                    await rename(state.backupPath, state.targetPath);
                }
            } catch (rollbackError) {
                rollbackErrors.push(rollbackError.message);
            }
        }

        for (const directory of createdDirectories.reverse()) {
            try {
                await rmdir(directory);
            } catch (rollbackError) {
                if (!["ENOENT", "ENOTEMPTY"].includes(rollbackError.code)) {
                    rollbackErrors.push(rollbackError.message);
                }
            }
        }

        if (rollbackErrors.length > 0) {
            throw new Error(
                `${error.message}\nRollback also failed: ${rollbackErrors.join("; ")}`
            );
        }
        throw error;
    } finally {
        await rm(stagingRoot, { recursive: true, force: true });
    }
}

function lockMatchesConfig(lock, config) {
    return Boolean(
        lock &&
        lock.source.repository === config.source.repository &&
        lock.source.ref === config.source.ref
    );
}

export async function syncSkills(options = {}, dependencies = {}) {
    if (options.check && options.dryRun) {
        throw new Error("--check and --dry-run cannot be used together");
    }
    if (options.check && options.update) {
        throw new Error("--check and --update cannot be used together");
    }

    const requestedRoot = path.resolve(options.root ?? process.cwd());
    const rootStats = await getStats(requestedRoot);
    if (!rootStats || !rootStats.isDirectory()) {
        throw new Error(`Consumer repository does not exist: ${requestedRoot}`);
    }
    const root = await realpath(requestedRoot);
    const configPath = path.resolve(
        root,
        options.config ?? CONFIG_FILE_NAME
    );
    await assertRegularFile(root, configPath, "Configuration file");
    const lockPath = path.join(root, LOCK_FILE_NAME);
    const lockRelative = assertPathInside(root, lockPath, "Lock file");
    await assertNoSymbolicLinkComponents(root, lockRelative);
    const config = await readConfig(configPath);
    const oldManifest = await readManifest(lockPath);
    const useLockedCommit = lockMatchesConfig(oldManifest, config) && !options.update;
    const requestedRef = useLockedCommit
        ? oldManifest.source.resolvedCommit
        : config.source.ref;
    const fetchSource = dependencies.fetchSource ?? fetchGitSkills;
    const resolved = await fetchSource({
        repository: config.source.repository,
        ref: requestedRef,
        skills: config.skills
    });
    const desiredManifest = buildManifest(config, resolved.commit, resolved.skills);
    const plan = await createPlan(
        root,
        oldManifest,
        desiredManifest,
        resolved.skills
    );

    plan.repositoryRoot = root;
    plan.requestedRef = requestedRef;
    plan.resolvedCommit = resolved.commit;
    plan.locked = useLockedCommit;

    if (options.check && plan.changed) {
        throw new CheckFailedError(plan);
    }

    if (!options.check && !options.dryRun) {
        await applyPlan(root, lockPath, plan, dependencies.hooks);
    }

    return plan;
}
