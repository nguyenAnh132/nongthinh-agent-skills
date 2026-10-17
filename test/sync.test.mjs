import assert from "node:assert/strict";
import {
    mkdir,
    readFile,
    symlink,
    writeFile
} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { CheckFailedError, syncSkills } from "../src/sync.mjs";
import {
    cleanup,
    commitAll,
    createSkill,
    createSourceRepository,
    makeTemporaryDirectory,
    runGit,
    snapshotDirectory,
    sourceFetcher,
    writeConsumerConfig
} from "./helpers.mjs";

async function setup(context, overrides = {}) {
    const root = await makeTemporaryDirectory();
    context.after(() => cleanup(root));
    const source = await createSourceRepository(root);
    const consumer = path.join(root, "consumer");
    await mkdir(consumer);
    await writeConsumerConfig(consumer, overrides);
    return {
        root,
        source,
        consumer,
        fetchSource: sourceFetcher(source)
    };
}

test("installs selected skills for Codex, Claude Code, and Antigravity", async (context) => {
    const fixture = await setup(context, {
        skills: ["clean-code"],
        agents: ["codex", "claude-code", "antigravity"]
    });

    const plan = await syncSkills(
        { root: fixture.consumer },
        { fetchSource: fixture.fetchSource }
    );

    assert.equal(plan.changed, true);
    assert.match(
        await readFile(
            path.join(fixture.consumer, ".agents", "skills", "clean-code", "SKILL.md"),
            "utf8"
        ),
        /name: clean-code/
    );
    assert.match(
        await readFile(
            path.join(fixture.consumer, ".claude", "skills", "clean-code", "SKILL.md"),
            "utf8"
        ),
        /name: clean-code/
    );

    const lock = JSON.parse(await readFile(
        path.join(fixture.consumer, "agent-skills.lock.json"),
        "utf8"
    ));
    assert.match(lock.source.resolvedCommit, /^[a-f0-9]{40}$/);
    assert.equal(lock.skills["clean-code"].targets.length, 2);
    assert.deepEqual(
        lock.skills["clean-code"].targets[0].agents,
        ["antigravity", "codex"]
    );
});

test("repeated synchronization is idempotent", async (context) => {
    const fixture = await setup(context);
    await syncSkills(
        { root: fixture.consumer },
        { fetchSource: fixture.fetchSource }
    );
    const before = await snapshotDirectory(fixture.consumer);
    const plan = await syncSkills(
        { root: fixture.consumer },
        { fetchSource: fixture.fetchSource }
    );
    const after = await snapshotDirectory(fixture.consumer);

    assert.equal(plan.changed, false);
    assert.deepEqual(after, before);
});

test("sync respects the lock and --update moves a floating ref", async (context) => {
    const fixture = await setup(context);
    await syncSkills(
        { root: fixture.consumer },
        { fetchSource: fixture.fetchSource }
    );
    const firstLock = JSON.parse(await readFile(
        path.join(fixture.consumer, "agent-skills.lock.json"),
        "utf8"
    ));

    await createSkill(fixture.source, "clean-code", "Updated instructions.");
    const nextCommit = await commitAll(fixture.source, "update clean code");

    const beforeDryRun = await snapshotDirectory(fixture.consumer);
    const dryUpdate = await syncSkills(
        { root: fixture.consumer, update: true, dryRun: true },
        { fetchSource: fixture.fetchSource }
    );
    assert.equal(dryUpdate.resolvedCommit, nextCommit);
    assert.deepEqual(await snapshotDirectory(fixture.consumer), beforeDryRun);

    const lockedPlan = await syncSkills(
        { root: fixture.consumer },
        { fetchSource: fixture.fetchSource }
    );
    assert.equal(lockedPlan.changed, false);
    assert.equal(lockedPlan.resolvedCommit, firstLock.source.resolvedCommit);

    const updatePlan = await syncSkills(
        { root: fixture.consumer, update: true },
        { fetchSource: fixture.fetchSource }
    );
    assert.equal(updatePlan.changed, true);
    const updatedLock = JSON.parse(await readFile(
        path.join(fixture.consumer, "agent-skills.lock.json"),
        "utf8"
    ));
    assert.equal(updatedLock.source.resolvedCommit, nextCommit);
});

test("resolves tags and full commit SHA references", async (context) => {
    const fixture = await setup(context);
    const commit = await runGit(fixture.source, ["rev-parse", "HEAD"]);
    await runGit(fixture.source, ["tag", "v1.0.0"]);

    await writeConsumerConfig(fixture.consumer, {
        source: {
            repository: "nguyenAnh132/nongthinh-agent-skills",
            ref: "v1.0.0"
        }
    });
    const tagPlan = await syncSkills(
        { root: fixture.consumer, dryRun: true },
        { fetchSource: fixture.fetchSource }
    );
    assert.equal(tagPlan.resolvedCommit, commit);

    await writeConsumerConfig(fixture.consumer, {
        source: {
            repository: "nguyenAnh132/nongthinh-agent-skills",
            ref: commit
        }
    });
    const shaPlan = await syncSkills(
        { root: fixture.consumer, dryRun: true },
        { fetchSource: fixture.fetchSource }
    );
    assert.equal(shaPlan.resolvedCommit, commit);
});

test("dry-run does not modify the consumer repository", async (context) => {
    const fixture = await setup(context);
    const before = await snapshotDirectory(fixture.consumer);
    const plan = await syncSkills(
        { root: fixture.consumer, dryRun: true },
        { fetchSource: fixture.fetchSource }
    );
    const after = await snapshotDirectory(fixture.consumer);

    assert.equal(plan.changed, true);
    assert.deepEqual(after, before);
});

test("check mode succeeds when synchronized and detects missing files without writes", async (context) => {
    const fixture = await setup(context);
    await syncSkills(
        { root: fixture.consumer },
        { fetchSource: fixture.fetchSource }
    );
    const synchronized = await syncSkills(
        { root: fixture.consumer, check: true },
        { fetchSource: fixture.fetchSource }
    );
    assert.equal(synchronized.changed, false);
    const cleanDirectory = path.join(
        fixture.consumer,
        ".agents",
        "skills",
        "clean-code"
    );
    await import("node:fs/promises").then(({ rm }) => (
        rm(cleanDirectory, { recursive: true })
    ));
    const before = await snapshotDirectory(fixture.consumer);

    await assert.rejects(
        syncSkills(
            { root: fixture.consumer, check: true },
            { fetchSource: fixture.fetchSource }
        ),
        CheckFailedError
    );
    assert.deepEqual(await snapshotDirectory(fixture.consumer), before);
});

test("check mode reports locally modified managed files without changing them", async (context) => {
    const fixture = await setup(context);
    await syncSkills(
        { root: fixture.consumer },
        { fetchSource: fixture.fetchSource }
    );
    const skillFile = path.join(
        fixture.consumer,
        ".agents",
        "skills",
        "clean-code",
        "SKILL.md"
    );
    await writeFile(skillFile, "locally modified", "utf8");
    const before = await snapshotDirectory(fixture.consumer);

    await assert.rejects(
        syncSkills(
            { root: fixture.consumer, check: true },
            { fetchSource: fixture.fetchSource }
        ),
        /managed files were modified locally/
    );
    assert.deepEqual(await snapshotDirectory(fixture.consumer), before);
});

test("refuses unowned conflicts and preserves their content", async (context) => {
    const fixture = await setup(context);
    const target = path.join(
        fixture.consumer,
        ".agents",
        "skills",
        "clean-code"
    );
    await mkdir(target, { recursive: true });
    await writeFile(path.join(target, "SKILL.md"), "user-owned", "utf8");

    await assert.rejects(
        syncSkills(
            { root: fixture.consumer },
            { fetchSource: fixture.fetchSource }
        ),
        /not managed by this CLI/
    );
    assert.equal(await readFile(path.join(target, "SKILL.md"), "utf8"), "user-owned");
});

test("preserves unrelated skills while cleaning removed managed skills", async (context) => {
    const fixture = await setup(context, {
        skills: ["clean-code", "code-review"],
        agents: ["codex"]
    });
    const unrelated = path.join(
        fixture.consumer,
        ".agents",
        "skills",
        "local-skill"
    );
    await mkdir(unrelated, { recursive: true });
    await writeFile(path.join(unrelated, "SKILL.md"), "local", "utf8");
    await syncSkills(
        { root: fixture.consumer },
        { fetchSource: fixture.fetchSource }
    );

    await writeConsumerConfig(fixture.consumer, {
        skills: ["code-review"],
        agents: ["codex"]
    });
    await syncSkills(
        { root: fixture.consumer },
        { fetchSource: fixture.fetchSource }
    );

    assert.equal(await readFile(path.join(unrelated, "SKILL.md"), "utf8"), "local");
    await assert.rejects(
        readFile(path.join(
            fixture.consumer,
            ".agents",
            "skills",
            "clean-code",
            "SKILL.md"
        )),
        { code: "ENOENT" }
    );
});

test("rejects unknown skills, unsafe names, and missing source revisions", async (context) => {
    const fixture = await setup(context, { skills: ["unknown-skill"] });
    await assert.rejects(
        syncSkills(
            { root: fixture.consumer },
            { fetchSource: fixture.fetchSource }
        ),
        /Unknown skill/
    );

    await writeConsumerConfig(fixture.consumer, { skills: ["../outside"] });
    await assert.rejects(
        syncSkills(
            { root: fixture.consumer },
            { fetchSource: fixture.fetchSource }
        ),
        /Invalid configuration/
    );

    await writeConsumerConfig(fixture.consumer, {
        source: {
            repository: "nguyenAnh132/nongthinh-agent-skills",
            ref: "missing-revision"
        }
    });
    await assert.rejects(
        syncSkills(
            { root: fixture.consumer },
            { fetchSource: fixture.fetchSource }
        ),
        /Cannot resolve source revision/
    );
});

test("rejects source skill directories without SKILL.md", async (context) => {
    const fixture = await setup(context);
    const broken = path.join(fixture.source, "skills", "broken-skill");
    await mkdir(broken);
    await writeFile(path.join(broken, "README.md"), "broken", "utf8");
    await commitAll(fixture.source, "add broken skill");
    await writeConsumerConfig(fixture.consumer, { skills: ["broken-skill"] });

    await assert.rejects(
        syncSkills(
            { root: fixture.consumer },
            { fetchSource: fixture.fetchSource }
        ),
        /SKILL.md is missing/
    );
});

test("rejects symbolic links stored in a source skill", async (context) => {
    const fixture = await setup(context);
    await createSkill(fixture.source, "linked-skill");
    await runGit(fixture.source, ["add", "skills/linked-skill/SKILL.md"]);
    const objectId = await runGit(fixture.source, [
        "hash-object",
        "-w",
        "skills/linked-skill/SKILL.md"
    ]);
    await runGit(fixture.source, [
        "update-index",
        "--add",
        "--cacheinfo",
        `120000,${objectId},skills/linked-skill/link`
    ]);
    await runGit(fixture.source, ["commit", "-m", "add unsafe link"]);
    await writeConsumerConfig(fixture.consumer, { skills: ["linked-skill"] });

    await assert.rejects(
        syncSkills(
            { root: fixture.consumer },
            { fetchSource: fixture.fetchSource }
        ),
        /Symbolic links and submodules are not allowed/
    );
});

test("rejects symlinks in managed paths", async (context) => {
    const fixture = await setup(context);
    const outside = path.join(fixture.root, "outside");
    const agentsPath = path.join(fixture.consumer, ".agents");
    await mkdir(outside);

    try {
        await symlink(outside, agentsPath, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
        if (["EPERM", "EACCES"].includes(error.code)) {
            context.skip("Symbolic links are not available in this environment");
            return;
        }
        throw error;
    }

    await assert.rejects(
        syncSkills(
            { root: fixture.consumer },
            { fetchSource: fixture.fetchSource }
        ),
        /Symbolic links are not allowed/
    );
    assert.deepEqual(await snapshotDirectory(outside), []);
});

test("rejects unsafe ownership paths in a lock file", async (context) => {
    const fixture = await setup(context);
    const hash = `sha256:${"0".repeat(64)}`;
    const maliciousLock = {
        schemaVersion: 1,
        source: {
            repository: "nguyenAnh132/nongthinh-agent-skills",
            ref: "main",
            resolvedCommit: "0".repeat(40)
        },
        skills: {
            "clean-code": {
                digest: hash,
                targets: [{
                    path: "../../outside",
                    agents: ["codex"],
                    files: [{ path: "SKILL.md", sha256: hash }]
                }]
            }
        }
    };
    await writeFile(
        path.join(fixture.consumer, "agent-skills.lock.json"),
        JSON.stringify(maliciousLock),
        "utf8"
    );

    await assert.rejects(
        syncSkills(
            { root: fixture.consumer },
            { fetchSource: fixture.fetchSource }
        ),
        /Unsafe lock target path|does not match/
    );
});

test("rolls back completed mutations after a partial failure", async (context) => {
    const fixture = await setup(context, {
        agents: ["codex", "claude-code"]
    });
    await syncSkills(
        { root: fixture.consumer },
        { fetchSource: fixture.fetchSource }
    );
    const before = await snapshotDirectory(fixture.consumer);
    await createSkill(fixture.source, "clean-code", "New source content.");
    await commitAll(fixture.source, "change source");

    await assert.rejects(
        syncSkills(
            { root: fixture.consumer, update: true },
            {
                fetchSource: fixture.fetchSource,
                hooks: {
                    afterMutation: async (_operation, index) => {
                        if (index === 0) {
                            throw new Error("Injected write failure");
                        }
                    }
                }
            }
        ),
        /Injected write failure/
    );

    assert.deepEqual(await snapshotDirectory(fixture.consumer), before);
});
