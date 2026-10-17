import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { runCli } from "../src/cli.mjs";
import {
    cleanup,
    createSourceRepository,
    makeTemporaryDirectory,
    snapshotDirectory,
    sourceFetcher,
    writeConsumerConfig
} from "./helpers.mjs";

function captureIo() {
    const output = [];
    return {
        output,
        io: {
            log: (message) => output.push(String(message)),
            error: (message) => output.push(String(message))
        }
    };
}

test("CLI exposes help and rejects unknown commands", async () => {
    const help = captureIo();
    assert.equal(await runCli(["--help"], help.io), 0);
    assert.match(help.output.join("\n"), /--dry-run/);
    assert.match(help.output.join("\n"), /--check/);

    const unknown = captureIo();
    assert.equal(await runCli(["unknown"], unknown.io), 2);
    assert.match(unknown.output.join("\n"), /Unknown command/);
});

test("CLI rejects mutually exclusive check options before synchronization", async () => {
    const captured = captureIo();
    const exitCode = await runCli(
        ["sync", "--check", "--dry-run"],
        captured.io
    );
    assert.equal(exitCode, 1);
    assert.match(captured.output.join("\n"), /cannot be used together/);
});

test("CLI completes dry-run, sync, and check end to end", async (context) => {
    const root = await makeTemporaryDirectory();
    context.after(() => cleanup(root));
    const source = await createSourceRepository(root);
    const consumer = path.join(root, "consumer");
    await mkdir(consumer);
    await writeConsumerConfig(consumer);
    const dependencies = { fetchSource: sourceFetcher(source) };
    const before = await snapshotDirectory(consumer);

    assert.equal(await runCli(
        ["sync", "--root", consumer, "--dry-run"],
        captureIo().io,
        dependencies
    ), 0);
    assert.deepEqual(await snapshotDirectory(consumer), before);

    assert.equal(await runCli(
        ["sync", "--root", consumer],
        captureIo().io,
        dependencies
    ), 0);
    assert.equal(await runCli(
        ["sync", "--root", consumer, "--check"],
        captureIo().io,
        dependencies
    ), 0);
});
