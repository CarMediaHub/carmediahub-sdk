import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("SDK production source does not read host environment variables", () => {
  const sourceRoot = path.resolve(import.meta.dirname);
  const files: string[] = [];
  for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) files.push(path.join(sourceRoot, entry.name));
  }
  const offenders = files.filter((location) => /(?:process\.env|Deno\.env|Bun\.env)/u.test(fs.readFileSync(location, "utf8")));
  assert.deepEqual(offenders, [], `SDK source must not read host environment variables: ${offenders.join(", ")}`);
});
