import type { ComputerProviderDescriptor } from "@rakazo/contracts";
import type { SettingsComputerProvider } from "./computer-provider-descriptor.js";

// ponytail: no built-in provider is configurable from Settings today; env-only kinds stay out.
export const computerProviderRegistry: readonly SettingsComputerProvider[] = [];
export function computerProviderDescriptor(id: string) {
  const descriptor = computerProviderRegistry.find((entry) => entry.id === id);
  if (!descriptor) throw new Error("Unknown computer provider");
  return descriptor;
}
export function computerProviderDescriptors(perAccount = false): ComputerProviderDescriptor[] {
  return computerProviderRegistry
    .filter((entry) => !perAccount || entry.capabilities.perAccount)
    .map(({ id, displayName, fields, capabilities }) => ({
      id,
      displayName,
      fields,
      capabilities,
    }));
}
