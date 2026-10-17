import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

const windowsReservedName = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const invalidWindowsCharacters = /[<>:"|?*\x00-\x1f]/;

export function toPosixPath(value) {
    return value.split(path.sep).join("/");
}

export function assertSafeRelativePath(relativePath, label = "path") {
    if (
        typeof relativePath !== "string" ||
        relativePath.length === 0 ||
        path.isAbsolute(relativePath) ||
        relativePath.includes("\\")
    ) {
        throw new Error(`Unsafe ${label}: ${relativePath}`);
    }

    const segments = relativePath.split("/");

    for (const segment of segments) {
        if (
            segment.length === 0 ||
            segment === "." ||
            segment === ".." ||
            segment === ".git" ||
            segment.endsWith(".") ||
            segment.endsWith(" ") ||
            invalidWindowsCharacters.test(segment) ||
            windowsReservedName.test(segment)
        ) {
            throw new Error(`Unsafe ${label}: ${relativePath}`);
        }
    }

    return relativePath;
}

export function resolveInside(root, relativePath, label = "path") {
    assertSafeRelativePath(relativePath, label);
    const resolvedRoot = path.resolve(root);
    const resolved = path.resolve(resolvedRoot, ...relativePath.split("/"));
    const relative = path.relative(resolvedRoot, resolved);

    if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error(`Unsafe ${label}: ${relativePath}`);
    }

    return resolved;
}

export async function assertNoSymbolicLinkComponents(root, relativePath) {
    const resolvedRoot = await realpath(root);
    const segments = assertSafeRelativePath(relativePath).split("/");
    let current = resolvedRoot;

    for (const segment of segments) {
        current = path.join(current, segment);

        try {
            const stats = await lstat(current);

            if (stats.isSymbolicLink()) {
                throw new Error(`Symbolic links are not allowed in managed paths: ${current}`);
            }
        } catch (error) {
            if (error.code === "ENOENT") {
                return;
            }
            throw error;
        }
    }
}
