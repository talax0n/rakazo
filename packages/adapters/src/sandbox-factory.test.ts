import { SandboxKind } from "@rakazo/contracts";
import { describe, expect, it, vi } from "vitest";
import { NO_SANDBOX_MESSAGE } from "./none-sandbox.js";
import { createSandboxProvider } from "./sandbox-factory.js";

const ctx = {
  operationId: "op",
  traceId: "tr",
  spaceId: "ws",
  userId: "user",
  signal: new AbortController().signal,
};

describe("createSandboxProvider", () => {
  it("returns fake sandbox when explicitly requested", async () => {
    const sandbox = await createSandboxProvider("fake", {});
    expect(sandbox.describe().id).toBe("fake");
  });

  it("returns none when requested or when the kind is empty", async () => {
    expect((await createSandboxProvider("none", {})).describe().id).toBe("none");
    expect((await createSandboxProvider("", {})).describe().id).toBe("none");
    await expect(
      (await createSandboxProvider("none", {})).provision({ botId: "b", homePath: "/tmp" }, ctx),
    ).rejects.toThrow(NO_SANDBOX_MESSAGE);
  });

  it("refuses a removed provider at startup instead of falling back", async () => {
    await expect(createSandboxProvider("e2b", {})).rejects.toThrow(
      'Unknown SANDBOX_PROVIDER "e2b". Use none | docker | desktop | fake.',
    );
  });

  it("refuses the desktop provider in a production server process", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      await expect(createSandboxProvider("desktop", {})).rejects.toThrow(
        "SANDBOX_PROVIDER=desktop runs bot commands directly on this host",
      );
    } finally {
      vi.unstubAllEnvs();
    }
    expect((await createSandboxProvider("desktop", {})).describe().id).toBe("desktop");
  });

  it("throws on unknown provider", async () => {
    await expect(createSandboxProvider("bogus", {})).rejects.toThrow(
      'Unknown SANDBOX_PROVIDER "bogus". Use none | docker | desktop | fake.',
    );
  });

  it("accepts only sandbox kinds, including none", async () => {
    expect(SandboxKind.options).toContain("none");
    for (const kind of SandboxKind.options) {
      await expect(createSandboxProvider(kind, {})).resolves.toBeDefined();
    }
    await expect(createSandboxProvider("not-a-provider", {})).rejects.toThrow(
      /Unknown SANDBOX_PROVIDER/,
    );
  });
});
