import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isTaggedCacheDirectory,
  shouldSkipPortableWorkspaceFile,
} from "./workspace-save-policy.js";

describe("home save exclusions", () => {
  it.each([
    ".cache",
    ".npm",
    ".pnpm-store",
    ".yarn/cache",
    "node_modules",
    ".venv",
    "__pycache__",
    ".next",
    ".turbo",
  ])("prunes %s directories at any depth", (name) => {
    for (const prefix of ["", "project/nested/"]) {
      expect(shouldSkipPortableWorkspaceFile(`${prefix}${name}`, true)).toBe(true);
      expect(shouldSkipPortableWorkspaceFile(`${prefix}${name}/huge/data`)).toBe(true);
      expect(shouldSkipPortableWorkspaceFile(`${prefix}${name}`)).toBe(false);
    }
  });

  it.each(["core", "core.123", "debug.log", "nested/output.log"])(
    "excludes %s only as a regular file",
    (name) => {
      expect(shouldSkipPortableWorkspaceFile(name)).toBe(true);
      expect(shouldSkipPortableWorkspaceFile(name, true)).toBe(false);
      expect(shouldSkipPortableWorkspaceFile(`${name}/notes.txt`)).toBe(false);
    },
  );

  it.each([
    "packages/core/notes.txt",
    "core.txt",
    "core.abc",
    "a.log.txt",
    ".yarn/patches/fix.patch",
    ".yarn/releases/yarn.cjs",
    "project/Cache/data",
    "project/lock",
    "project/WidevineCdm/notes.txt",
  ])("keeps %s", (name) => {
    expect(shouldSkipPortableWorkspaceFile(name)).toBe(false);
  });

  it("retains the existing browser profile name matching", () => {
    for (const name of ["Cache", "Code Cache", "WidevineCdm"]) {
      expect(shouldSkipPortableWorkspaceFile(`.browser-profiles/chromium/${name}`, true)).toBe(
        true,
      );
      expect(shouldSkipPortableWorkspaceFile(`.browser-profiles/chromium/${name}/data`)).toBe(true);
    }
    for (const name of ["SingletonLock", "lock", ".parentlock", "BrowserMetrics"]) {
      expect(shouldSkipPortableWorkspaceFile(`.browser-profiles/chromium/${name}`)).toBe(true);
    }
    expect(shouldSkipPortableWorkspaceFile(".browser-profiles/chromium/Default/Cookies")).toBe(
      false,
    );
  });
});

const CACHE_TAG = "Signature: 8a477f597d28d172789f06886806bc55\n# Created by a build tool\n";

describe("tagged cache directories", () => {
  it("recognizes only a tag that starts with the signature", async () => {
    const scratch = await mkdtemp(path.join(tmpdir(), "rakazo-cachedir-"));
    try {
      const write = async (dir: string, content?: string) => {
        await mkdir(path.join(scratch, dir), { recursive: true });
        if (content !== undefined)
          await writeFile(path.join(scratch, dir, "CACHEDIR.TAG"), content);
        return isTaggedCacheDirectory(path.join(scratch, dir));
      };
      expect(await write("tagged", CACHE_TAG)).toBe(true);
      expect(await write("unsigned", "my notes")).toBe(false);
      expect(await write("short", CACHE_TAG.slice(0, 20))).toBe(false);
      expect(await write("missing")).toBe(false);
      // The shell check skips these unread, so both paths agree.
      expect(await write("oversized", CACHE_TAG + "x".repeat(1024))).toBe(false);
      await mkdir(path.join(scratch, "linked"));
      await symlink(
        path.join(scratch, "tagged", "CACHEDIR.TAG"),
        path.join(scratch, "linked", "CACHEDIR.TAG"),
      );
      expect(await isTaggedCacheDirectory(path.join(scratch, "linked"))).toBe(false);
      if (process.platform !== "win32") {
        await mkdir(path.join(scratch, "pipe"));
        execFileSync("mkfifo", [path.join(scratch, "pipe", "CACHEDIR.TAG")]);
        expect(await isTaggedCacheDirectory(path.join(scratch, "pipe"))).toBe(false);
      }
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });
});
