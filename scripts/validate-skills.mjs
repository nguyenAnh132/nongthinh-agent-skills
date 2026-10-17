import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateSkillsDirectory } from "../src/skill-validator.mjs";

const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
);
const skillsDirectory = path.join(root, "skills");

async function main() {
    const results = await validateSkillsDirectory(skillsDirectory);
    let failureCount = 0;

    for (const result of results) {
        if (result.errors.length === 0) {
            console.log(`PASS ${result.name}`);
            continue;
        }

        for (const error of result.errors) {
            console.error(`FAIL ${error}`);
        }
        failureCount += result.errors.length;
    }

    console.log(`\nValidated ${results.length} skills. Errors: ${failureCount}`);

    if (failureCount > 0) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error(`Validation failed: ${error.message}`);
    process.exitCode = 1;
});
