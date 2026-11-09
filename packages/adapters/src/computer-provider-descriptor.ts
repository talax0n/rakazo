import type { ComputerProviderDescriptor } from "@rakazo/contracts";
import type { SandboxProviderOptions } from "./sandbox-factory.js";

export interface SettingsComputerProvider extends ComputerProviderDescriptor {
  verify(values: Record<string, string>): SandboxProviderOptions;
  verifyConnection?(values: Record<string, string>, signal: AbortSignal): Promise<void>;
}
