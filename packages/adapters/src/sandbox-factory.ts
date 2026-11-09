import type { SandboxProvider } from "@rakazo/adapter-kit";
import { SandboxKind } from "@rakazo/contracts";
import { assertHostCommandsAllowed, DesktopSandboxProvider } from "./desktop-sandbox.js";
import { DockerSandboxProvider } from "./docker-sandbox.js";
import { FakeSandboxProvider } from "./fake-sandbox.js";
import { NoneSandboxProvider } from "./none-sandbox.js";

export interface SandboxProviderOptions {
  hostComputerUrl?: string;
  hostComputerToken?: string;
  supervisorUrl?: string;
  supervisorToken?: string;
  dataDir?: string;
}

const KINDS = SandboxKind.options.join(" | ");

export async function createSandboxProvider(
  kind: string,
  opts: SandboxProviderOptions,
): Promise<SandboxProvider> {
  if (kind === "") return new NoneSandboxProvider();
  const parsed = SandboxKind.safeParse(kind);
  if (!parsed.success) throw new Error(`Unknown SANDBOX_PROVIDER "${kind}". Use ${KINDS}.`);
  const sandboxKind = parsed.data;
  switch (sandboxKind) {
    case "none":
      return new NoneSandboxProvider();
    case "docker":
      return new DockerSandboxProvider(
        opts.supervisorUrl ?? "http://127.0.0.1:7091",
        opts.supervisorToken,
      );
    case "desktop":
      assertHostCommandsAllowed();
      return new DesktopSandboxProvider({
        root: opts.dataDir,
      });
    case "fake":
      return new FakeSandboxProvider();
    default: {
      const _exhaustive: never = sandboxKind;
      throw new Error(`Unknown SANDBOX_PROVIDER "${_exhaustive}". Use ${KINDS}.`);
    }
  }
}
