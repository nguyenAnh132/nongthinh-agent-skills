import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
    CENTRAL_REPOSITORY,
    validateConfiguredSkills,
    validateConfigObject
} from "../src/config.mjs";
import { cleanup, makeTemporaryDirectory } from "./helpers.mjs";

function validConfig() {
    return {
        $schema: "./schemas/agent-skills.schema.json",
        schemaVersion: 1,
        source: {
            repository: CENTRAL_REPOSITORY,
            ref: "01c4a68a43eefca10e76d7f8c9f59bac68924637"
        },
        skills: ["clean-code", "code-review"],
        agents: ["codex", "claude-code", "antigravity"]
    };
}

test("accepts a valid consumer configuration", async () => {
    assert.deepEqual(await validateConfigObject(validConfig()), []);
});

test("rejects unknown fields, duplicates, unsupported agents, and unsafe refs", async () => {
    const cases = [
        { ...validConfig(), unexpected: true },
        { ...validConfig(), skills: ["clean-code", "clean-code"] },
        { ...validConfig(), agents: ["cursor"] },
        {
            ...validConfig(),
            source: { repository: CENTRAL_REPOSITORY, ref: "../main" }
        }
    ];

    for (const config of cases) {
        assert.notEqual((await validateConfigObject(config)).length, 0);
    }
});

test("reports skills that do not exist in a local catalog", async (context) => {
    const root = await makeTemporaryDirectory();
    context.after(() => cleanup(root));
    await mkdir(path.join(root, "clean-code"));
    const config = { ...validConfig(), skills: ["clean-code", "missing-skill"] };

    assert.deepEqual(
        await validateConfiguredSkills(config, root),
        ["Unknown skill: missing-skill"]
    );
});
