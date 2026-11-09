import { describe, expect, it } from "vitest";
import {
  messagingConnectOptions,
  messagingProviderLabel,
  messagingProviderName,
} from "./messaging-providers.js";

describe("messaging provider labels", () => {
  it("names known providers and falls back to the raw id", () => {
    expect(messagingProviderName("slack")).toBe("Slack");
    expect(messagingProviderName("teams")).toBe("teams");
  });

  it("prefers the message's own transport", () => {
    expect(messagingProviderLabel("chat", "SMS")).toBe("SMS");
    expect(messagingProviderLabel("slack")).toBe("Slack");
  });
});

it("offers Slack authorization once, including before a workspace is installed", () => {
  expect(messagingConnectOptions(["slack", "chat", "slack"], true)).toEqual([
    { provider: "slack", method: "install" },
    { provider: "chat", method: "link" },
  ]);
  expect(messagingConnectOptions([], true)).toEqual([{ provider: "slack", method: "install" }]);
  expect(messagingConnectOptions(["slack"], false)).toEqual([
    { provider: "slack", method: "link" },
  ]);
});
