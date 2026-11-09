import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import path from "node:path";
import type { WorkspaceExportLimits } from "@rakazo/adapter-kit";

/** The most one save copies; a larger home keeps running unsaved. */
export const WORKSPACE_SAVE_LIMITS: WorkspaceExportLimits = {
  maxBytes: 5 * 1024 ** 3,
  maxFiles: 1_000_000,
};

const browserDirectories = [
  "Cache",
  "Code Cache",
  "CacheStorage",
  "GPUCache",
  "GrShaderCache",
  "ShaderCache",
  "DawnGraphiteCache",
  "DawnWebGPUCache",
  "GraphiteDawnCache",
  "Crashpad",
  "startup_cache",
  "cache2",
  // Components and models the browser downloads again on its own; each copy is per bot.
  "ActorSafetyLists",
  "CertificateRevocation",
  "component_crx_cache",
  "Crowd Deny",
  "DeferredBrowserMetrics",
  "Dictionaries",
  "extensions_crx_cache",
  "hyphen-data",
  "OnDeviceHeadSuggestModel",
  "optimization_guide_model_store",
  "OptimizationHints",
  "PKIMetadata",
  "Safe Browsing",
  "SafetyTips",
  "screen_ai",
  "Subresource Filter",
  "WasmTtsEngine",
  "WidevineCdm",
  "ZxcvbnData",
];
const browserFiles = [
  "BrowserMetrics",
  "BrowserMetrics-spare.pma",
  "DevToolsActivePort",
  "SingletonCookie",
  "SingletonLock",
  "SingletonSocket",
  ".parentlock",
  "lock",
];
const alternatives = (names: readonly string[]) =>
  names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");

// POSIX extended expressions also run in GNU find. Keep the policy here, including the
// browser's historical name matching, rather than maintaining separate shell exclusions.
const exclusions = [
  {
    pattern:
      "(.*/)?(\\.cache|\\.npm|\\.pnpm-store|node_modules|\\.venv|__pycache__|\\.next|\\.turbo|\\.yarn/cache)",
    kind: "directory",
  },
  { pattern: "(.*/)?([^/]*\\.log|core|core\\.[0-9]+)", kind: "file" },
  { pattern: `\\.browser-profiles/(.*/)?(${alternatives(browserDirectories)})`, kind: "any" },
  { pattern: `\\.browser-profiles/(.*/)?(${alternatives(browserFiles)})`, kind: "entry" },
] as const;
const rules = exclusions.map((rule) => ({ ...rule, regex: new RegExp(`^${rule.pattern}$`) }));

/** Paths are relative to the home; file patterns never exclude directories. */
export function shouldSkipPortableWorkspaceFile(relative: string, isDirectory = false): boolean {
  const segments = relative.replace(/^\.\//, "").split("/");
  return rules.some((rule) =>
    segments.some((_, index) => {
      const last = index === segments.length - 1;
      if (rule.kind === "file" && (!last || isDirectory)) return false;
      if (rule.kind === "directory" && last && !isDirectory) return false;
      if (rule.kind === "entry" && !last) return false;
      return rule.regex.test(segments.slice(0, index + 1).join("/"));
    }),
  );
}

/** Cache Directory Tagging (bford.info/cachedir): build tools mark rebuildable output this way. */
const CACHE_DIRECTORY_TAG = "CACHEDIR.TAG";
const CACHE_DIRECTORY_SIGNATURE = "Signature: 8a477f597d28d172789f06886806bc55";
/** Real tags are a few lines; a larger file is not one. */
const MAX_CACHE_DIRECTORY_TAG_BYTES = 1024;

/** True when `directory` holds a cache directory tag; a save leaves the whole directory out. */
export async function isTaggedCacheDirectory(directory: string): Promise<boolean> {
  // Like find's -type f: a symlinked tag is not followed and a pipe named like one cannot block.
  // Windows has no O_NOFOLLOW, so the type is checked first as well.
  const tag = path.join(directory, CACHE_DIRECTORY_TAG);
  const info = await lstat(tag).catch(() => null);
  if (!info?.isFile() || info.size >= MAX_CACHE_DIRECTORY_TAG_BYTES) return false;
  const handle = await open(
    tag,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  ).catch(() => null);
  if (!handle) return false;
  try {
    const expected = Buffer.from(CACHE_DIRECTORY_SIGNATURE);
    const { buffer, bytesRead } = await handle.read(
      Buffer.alloc(expected.length),
      0,
      expected.length,
      0,
    );
    return bytesRead === expected.length && buffer.equals(expected);
  } catch {
    return false;
  } finally {
    await handle.close().catch(() => undefined);
  }
}
