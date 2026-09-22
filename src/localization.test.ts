import assert from "node:assert/strict";
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
