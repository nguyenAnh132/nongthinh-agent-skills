import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { assertSafeRelativePath, toPosixPath } from "./paths.mjs";

function hashBuffer(content) {
    return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

export function describeFiles(files) {
    const described = files
        .map((file) => ({
            path: assertSafeRelativePath(file.path, "skill file path"),
            sha256: hashBuffer(file.content)
        }))
        .sort((left, right) => left.path.localeCompare(right.path));
    const digest = createHash("sha256");

    for (const file of described) {
        digest.update(file.path);
        digest.update("\0");
        digest.update(file.sha256);
        digest.update("\0");
    }

    return {
        files: described,
        digest: `sha256:${digest.digest("hex")}`
    };
}

async function walkDirectory(root, current, files) {
    const entries = await readdir(current, { withFileTypes: true });

    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        const absolutePath = path.join(current, entry.name);
        const stats = await lstat(absolutePath);

        if (stats.isSymbolicLink()) {
            throw new Error(`Symbolic links are not allowed in managed directories: ${absolutePath}`);
        }

        if (stats.isDirectory()) {
            await walkDirectory(root, absolutePath, files);
            continue;
        }

        if (!stats.isFile()) {
            throw new Error(`Unsupported file type in managed directory: ${absolutePath}`);
        }

        files.push({
            path: toPosixPath(path.relative(root, absolutePath)),
            content: await readFile(absolutePath)
        });
    }
}

export async function describeDirectory(directory) {
    const files = [];
    await walkDirectory(directory, directory, files);
    return describeFiles(files);
}

export function descriptionsEqual(left, right) {
    if (!left || !right || left.digest !== right.digest) {
        return false;
    }

    return JSON.stringify(left.files) === JSON.stringify(right.files);
}
