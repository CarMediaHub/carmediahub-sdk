import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { isSupportedLocale, localeFallbacks, localize, normalizeLocale } from "./localization.js";

test("normalizes supported locale aliases and rejects unknown values to English", () => {
  assert.equal(normalizeLocale("zh"), "zh-CN");
  assert.equal(normalizeLocale("zh-CN"), "zh-CN");
  assert.equal(normalizeLocale("ko-KR"), "ko");
  assert.equal(normalizeLocale("fr-FR"), "en");
  assert.equal(isSupportedLocale("ko"), true);
  assert.equal(isSupportedLocale("fr"), false);
});

test("resolves requested locale, language fallback, then English", () => {
  assert.deepEqual(localeFallbacks("zh-CN"), ["zh-CN", "en"]);
  assert.deepEqual(localeFallbacks("ko-KR"), ["ko", "en"]);
  assert.equal(localize({ en: "Hello", "zh-CN": "你好" }, "zh"), "你好");
  assert.equal(localize({ en: "Hello", ko: "안녕하세요" }, "ko-KR"), "안녕하세요");
  assert.equal(localize({ en: "Hello" }, "zh-CN"), "Hello");
  assert.equal(localize({}, "ko", "Fallback"), "Fallback");
});

test("keeps the runtime locale behavior aligned with the published v0 contract", () => {
  const contract = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../spec/v0/locales.json"), "utf8")) as {
    properties: {
      default: { const: string };
      supported: { const: string[] };
      aliases: { properties: Record<string, { const: string }> };
      fallback: { const: string[] };
    };
  };
  assert.equal(contract.properties.default.const, "en");
  assert.deepEqual(contract.properties.supported.const, ["en", "zh-CN", "ko"]);
  assert.equal(normalizeLocale(undefined), contract.properties.default.const);
  for (const locale of contract.properties.supported.const) assert.equal(isSupportedLocale(locale), true);
  for (const [alias, locale] of Object.entries(contract.properties.aliases.properties)) assert.equal(normalizeLocale(alias), locale.const);
  assert.deepEqual(localeFallbacks("zh-CN"), ["zh-CN", "en"]);
  assert.deepEqual(localeFallbacks("ko-KR"), ["ko", "en"]);
  assert.deepEqual(contract.properties.fallback.const, ["requested-locale", "language", "en"]);
});
