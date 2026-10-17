import { readFile } from "node:fs/promises";

let ajvPromise;

async function loadAjv() {
    if (!ajvPromise) {
        ajvPromise = Promise.all([
            import("ajv/dist/2020.js"),
            import("ajv-formats")
        ]).catch((error) => {
            throw new Error(
                "Ajv and ajv-formats are required. Run npm ci before validation.",
                { cause: error }
            );
        });
    }
    return ajvPromise;
}

export async function validateAgainstSchema(schemaPath, value) {
    const modules = await loadAjv();
    const [{ default: Ajv2020 }, { default: addFormats }] = modules;
    const schema = JSON.parse(await readFile(schemaPath, "utf8"));
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);

    if (validate(value)) {
        return [];
    }

    return validate.errors.map((error) => (
        `${error.instancePath || "/"}: ${error.message}`
    ));
}
