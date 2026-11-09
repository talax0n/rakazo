import { describe, expect, it } from "vitest";
import { resolveSandboxProvider, sandboxProviderOptionsFromEnv } from "./sandbox-provider-env.js";

describe("resolveSandboxProvider", () => {
  it("defaults to docker", () => {
    expect(resolveSandboxProvider({})).toBe("docker");
  });

  it("keeps explicit none", () => {
    expect(resolveSandboxProvider({ SANDBOX_PROVIDER: "none" })).toBe("none");
    expect(resolveSandboxProvider({ SANDBOX_PROVIDER: "" })).toBe("none");
  });

  it("passes a removed provider through so startup refuses it", () => {
    expect(resolveSandboxProvider({ SANDBOX_PROVIDER: "e2b" })).toBe("e2b");
  });

  it("falls back to none in production when Docker has no supervisor token", () => {
    expect(
      resolveSandboxProvider({
        NODE_ENV: "production",
        SANDBOX_PROVIDER: "docker",
      }),
    ).toBe("none");
  });

  it("keeps docker in production when a supervisor token is set", () => {
    expect(
      resolveSandboxProvider({
        NODE_ENV: "production",
        SANDBOX_PROVIDER: "docker",
        SANDBOX_SUPERVISOR_TOKEN: "prod-supervisor-token-with-enough-length",
      }),
    ).toBe("docker");
  });
});

describe("sandboxProviderOptionsFromEnv", () => {
  it("loads the host computer connection", () => {
    expect(
      sandboxProviderOptionsFromEnv({
        SANDBOX_HOST_URL: "http://host.example.test",
        SANDBOX_HOST_TOKEN: "test-token",
      }),
    ).toEqual({ hostComputerUrl: "http://host.example.test", hostComputerToken: "test-token" });
  });
});
