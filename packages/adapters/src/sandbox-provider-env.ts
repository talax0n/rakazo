import type { SandboxProviderOptions } from "./sandbox-factory.js";

/** Empty or remote provider without a key becomes none so services can boot for signup. */
export function resolveSandboxProvider(source: NodeJS.ProcessEnv = process.env): string {
  const configured = source.SANDBOX_PROVIDER;
  if (configured !== undefined && !configured.trim()) return "none";
  const requested = configured?.trim() || "docker";
  // Production without a supervisor token cannot run Docker computers; boot as none instead of exiting.
  if (
    requested === "docker" &&
    source.NODE_ENV === "production" &&
    !optional(source.SANDBOX_SUPERVISOR_TOKEN)
  ) {
    return "none";
  }
  return requested;
}

export function sandboxProviderOptionsFromEnv(
  source: NodeJS.ProcessEnv = process.env,
): Pick<SandboxProviderOptions, "hostComputerUrl" | "hostComputerToken"> {
  return {
    hostComputerUrl: source.SANDBOX_HOST_URL,
    hostComputerToken: source.SANDBOX_HOST_TOKEN,
  };
}

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}
