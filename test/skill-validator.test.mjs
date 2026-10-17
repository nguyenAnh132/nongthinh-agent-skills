import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
    validateSkillContent,
    validateSkillDirectory
} from "../src/skill-validator.mjs";
import { cleanup, makeTemporaryDirectory } from "./helpers.mjs";

test("accepts valid Agent Skills metadata", () => {
    const errors = validateSkillContent(
        "clean-code",
        "---\nname: clean-code\ndescription: Use for clean code reviews.\n---\n\n# Instructions"
    );
    assert.deepEqual(errors, []);
});

test("rejects malformed and duplicate YAML metadata", () => {
    assert.match(
        validateSkillContent("bad", "---\nname: [\n---\nBody")[0],
        /Invalid YAML/
    );
    assert.match(
        validateSkillContent(
            "bad",
            "---\nname: bad\nname: bad\ndescription: duplicate\n---\nBody"
        )[0],
        /Invalid YAML/
    );
});

test("rejects invalid names, empty instructions, and unsupported fields", () => {
    const errors = validateSkillContent(
        "expected-name",
        "---\nname: Wrong_Name\ndescription: valid\nunknown: true\n---\n"
    );
    assert.equal(errors.length, 3);
});

test("reports a missing SKILL.md", async (context) => {
    const root = await makeTemporaryDirectory();
    context.after(() => cleanup(root));
    await mkdir(path.join(root, "missing"));
    const errors = await validateSkillDirectory(root, "missing");
    assert.match(errors[0], /SKILL.md is missing/);
});

test("rejects symbolic links inside a skill bundle", async (context) => {
    const root = await makeTemporaryDirectory();
    context.after(() => cleanup(root));
    const skill = path.join(root, "linked-skill");
    await mkdir(skill);
    await writeFile(
        path.join(skill, "SKILL.md"),
        "---\nname: linked-skill\ndescription: Test.\n---\nBody",
        "utf8"
    );

    try {
        await import("node:fs/promises").then(({ symlink }) => (
            symlink(path.join(skill, "SKILL.md"), path.join(skill, "linked.md"), "file")
        ));
    } catch (error) {
        if (["EPERM", "EACCES"].includes(error.code)) {
            context.skip("Symbolic links are not available in this environment");
            return;
        }
        throw error;
    }

    const errors = await validateSkillDirectory(root, "linked-skill");
    assert.match(errors[0], /Symbolic links are not allowed/);
});
