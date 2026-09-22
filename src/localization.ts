import type { Locale } from "./types.js";

export type LocalizedText = Partial<Record<Locale, string>>;

/** Normalize user and browser locale aliases to the platform contract. */
export function normalizeLocale(value: string | undefined): Locale {
  if (value === "zh" || value?.toLowerCase() === "zh-cn") return "zh-CN";
  if (value === "ko-KR" || value?.toLowerCase() === "ko") return "ko";
  return value?.toLowerCase() === "en" || value?.toLowerCase() === "en-us" || value?.toLowerCase() === "en-gb" ? "en" : "en";
}

/** Return the platform fallback chain: requested locale, language, then English. */
export function localeFallbacks(value: string | undefined): readonly Locale[] {
  const locale = normalizeLocale(value);
  const language = locale.split("-")[0];
  return [...new Set([locale, language === "zh" ? "zh-CN" : language === "ko" ? "ko" : "en", "en"])] as Locale[];
}

/** Resolve a plugin-provided localized value without creating a second preference system. */
export function localize(resources: LocalizedText, locale: string | undefined, fallback = ""): string {
  for (const candidate of localeFallbacks(locale)) {
    const value = resources[candidate];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return fallback;
}

export function isSupportedLocale(value: string): value is Locale {
  return value === "en" || value === "zh-CN" || value === "ko";
}
