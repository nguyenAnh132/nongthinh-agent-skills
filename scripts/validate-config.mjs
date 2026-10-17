import path from "node:path";
import {
    getProjectRoot,
    readConfig,
    validateConfiguredSkills
} from "../src/config.mjs";

async function main() {
    const root = getProjectRoot();
    const requestedPath = process.argv[2] ?? path.join(
        "docs",
        "agent-skills.example.json"
    );
    const configPath = path.resolve(process.cwd(), requestedPath);
    const config = await readConfig(configPath);
    const errors = await validateConfiguredSkills(
        config,
        path.join(root, "skills")
    );

    if (errors.length > 0) {
        throw new Error(errors.join("\n"));
    }

    console.log(`PASS ${path.relative(process.cwd(), configPath)}`);
}

main().catch((error) => {
    console.error(`Configuration validation failed: ${error.message}`);
    process.exitCode = 1;
});
