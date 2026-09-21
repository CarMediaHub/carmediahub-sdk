import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

type CatalogEntry = {
  code: string;
  retryable: boolean;
  messageKey: string;
};

type Catalog = {
  schemaVersion: string;
  errors: CatalogEntry[];
};

async function loadCatalog(): Promise<Catalog> {
  const path = fileURLToPath(new URL("../spec/v0/errors.json", import.meta.url));
  return JSON.parse(await readFile(path, "utf8")) as Catalog;
}

test("v0 error catalog has unique stable entries", async () => {
  const catalog = await loadCatalog();
  assert.match(catalog.schemaVersion, /^0\.\d+$/u);
  assert.ok(catalog.errors.length > 0);

  const codes = catalog.errors.map((entry) => entry.code);
  assert.equal(new Set(codes).size, codes.length);
  for (const entry of catalog.errors) {
    assert.match(entry.code, /^CMH\.[A-Z0-9_.]+$/u);
    assert.match(entry.messageKey, /^errors\.[A-Za-z0-9.]+$/u);
    assert.equal(typeof entry.retryable, "boolean");
  }
});

test("job size errors are part of the public v0 contract", async () => {
  const catalog = await loadCatalog();
  const entries = new Map(catalog.errors.map((entry) => [entry.code, entry]));
  assert.deepEqual(entries.get("CMH.JOBS.PAYLOAD_TOO_LARGE"), {
    code: "CMH.JOBS.PAYLOAD_TOO_LARGE",
    retryable: false,
    messageKey: "errors.jobs.payloadTooLarge"
  });
  assert.deepEqual(entries.get("CMH.JOBS.RESULT_TOO_LARGE"), {
    code: "CMH.JOBS.RESULT_TOO_LARGE",
    retryable: false,
    messageKey: "errors.jobs.resultTooLarge"
  });
});
