import { parseArgs } from "node:util";
import { CheckFailedError, syncSkills } from "./sync.mjs";

const helpText = `Nong Thinh Agent Skills

Usage:
  nongthinh-agent-skills sync [options]

Options:
  --root <path>    Consumer repository root (default: current directory)
  --config <path>  Configuration path relative to --root
  --dry-run        Show planned changes without modifying the consumer
  --check          Exit with an error when installed files differ from the lock
  --update         Resolve source.ref again and update the locked commit
  --help, -h       Show this help

Behavior:
  sync respects agent-skills.lock.json when repository and ref are unchanged.
  Use --update explicitly to move a branch or tag to a newer commit.
`;

function printPlan(plan, write) {
    write(`Source commit: ${plan.resolvedCommit}`);
    if (plan.locked) {
        write("Revision source: lock file");
    }

    if (plan.messages.length === 0) {
        write("Agent Skills are synchronized. No changes required.");
        return;
    }

    for (const message of plan.messages) {
        write(message);
    }
}

export async function runCli(argv, io = console, dependencies = {}) {
    const command = argv[0];

    if (!command || command === "--help" || command === "-h") {
        io.log(helpText);
        return 0;
    }

    if (command !== "sync") {
        io.error(`Unknown command: ${command}\n\n${helpText}`);
        return 2;
    }

    let parsed;
    try {
        parsed = parseArgs({
            args: argv.slice(1),
            allowPositionals: false,
            strict: true,
            options: {
                root: { type: "string" },
                config: { type: "string" },
                "dry-run": { type: "boolean" },
                check: { type: "boolean" },
                update: { type: "boolean" },
                help: { type: "boolean", short: "h" }
            }
        });
    } catch (error) {
        io.error(`${error.message}\n\n${helpText}`);
        return 2;
    }

    if (parsed.values.help) {
        io.log(helpText);
        return 0;
    }

    try {
        const plan = await syncSkills({
            root: parsed.values.root,
            config: parsed.values.config,
            dryRun: parsed.values["dry-run"],
            check: parsed.values.check,
            update: parsed.values.update
        }, dependencies);
        printPlan(plan, (message) => io.log(message));

        if (parsed.values["dry-run"] && plan.changed) {
            io.log("Dry run complete. No consumer files were modified.");
        }
        return 0;
    } catch (error) {
        if (error instanceof CheckFailedError) {
            printPlan(error.plan, (message) => io.error(message));
            io.error("Check failed. Run sync and commit the generated changes.");
            return 1;
        }

        io.error(`Error: ${error.message}`);
        return 1;
    }
}

export function getHelpText() {
    return helpText;
}
