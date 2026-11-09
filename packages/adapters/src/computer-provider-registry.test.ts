import { expect, it } from "vitest";
import {
  computerProviderDescriptor,
  computerProviderDescriptors,
} from "./computer-provider-registry.js";

it("offers no built-in Settings provider and rejects unregistered ids", () => {
  expect(computerProviderDescriptors()).toEqual([]);
  expect(computerProviderDescriptors(true)).toEqual([]);
  expect(() => computerProviderDescriptor("unregistered")).toThrow();
});
