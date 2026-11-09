import { describe, expect, it, vi } from "vitest";
import type { MessagingEnvironmentValues } from "./messaging-platforms.js";
import {
  enrichSlackTeamRoom,
  isMessagingEnabled,
  isMessagingSurfaceEnabled,
  messagingEnvFromProcess,
  messagingPlatformsFromEnv,
} from "./messaging-platforms.js";

// Fake credentials: adapters are constructed offline, never called.
const fullEnv: MessagingEnvironmentValues = {
  slackBotToken: "xoxb-fake",
  slackSigningSecret: "slack-signing",
};

function providers(env: MessagingEnvironmentValues): string[] {
  return messagingPlatformsFromEnv(env).map((platform) => platform.provider);
}

describe("messagingPlatformsFromEnv", () => {
  it("mounts nothing without credentials and Slack with full credentials", () => {
    expect(providers({})).toEqual([]);
    expect(providers(fullEnv)).toEqual(["slack"]);
  });

  it("requires Slack's full credential set", () => {
    expect(providers({ ...fullEnv, slackSigningSecret: undefined })).toEqual([]);
    expect(providers({ ...fullEnv, slackBotToken: undefined })).toEqual([]);
  });

  it("reads trimmed Slack credentials from process env", () => {
    expect(
      messagingEnvFromProcess({ SLACK_BOT_TOKEN: " xoxb-fake ", SLACK_SIGNING_SECRET: "  " }),
    ).toEqual({ slackBotToken: "xoxb-fake", slackSigningSecret: undefined });
  });

  it("declares group support and the receipt", () => {
    expect(messagingPlatformsFromEnv(fullEnv)[0]!.capabilities).toEqual({
      direct: true,
      groups: true,
      receipt: "reaction",
    });
  });
});

describe("permanent send errors", () => {
  const [slack] = messagingPlatformsFromEnv(fullEnv);
  const slackError = (error: string) =>
    Object.assign(new Error(`An API error occurred: ${error}`), {
      code: "slack_webapi_platform_error",
      data: { ok: false, error },
    });

  it.each([
    [slackError("channel_not_found"), true],
    [slackError("not_in_channel"), true],
    [slackError("invalid_auth"), true],
    [slackError("internal_error"), false],
    [new Error("socket hang up"), false],
  ] as const)("%s is permanent=%s", (error, permanent) => {
    expect(slack!.isPermanentSendError!(error)).toBe(permanent);
  });
});

describe("isMessagingEnabled", () => {
  it("requires at least one platform", () => {
    vi.stubEnv("VITEST", "");
    expect(isMessagingEnabled(messagingPlatformsFromEnv(fullEnv))).toBe(true);
    expect(isMessagingEnabled([])).toBe(false);
    vi.unstubAllEnvs();
  });

  it("is disabled under vitest even with platforms configured", () => {
    expect(process.env.VITEST).toBeTruthy();
    expect(isMessagingEnabled(messagingPlatformsFromEnv(fullEnv))).toBe(false);
  });

  it.each(["0", "false"])("does not treat VITEST=%s as an active test runner", (value) => {
    vi.stubEnv("VITEST", value);
    expect(isMessagingEnabled(messagingPlatformsFromEnv(fullEnv))).toBe(true);
    vi.unstubAllEnvs();
  });
});

describe("isMessagingSurfaceEnabled", () => {
  it("requires a configured deployment model only for open signup", () => {
    vi.stubEnv("VITEST", "");
    const platforms = messagingPlatformsFromEnv(fullEnv);
    const options = (deploymentModelConfigured: boolean, openSignup: boolean) => ({
      deploymentModelConfigured,
      openSignup,
    });
    // Open signup provisions users with no credentials of their own.
    expect(isMessagingSurfaceEnabled(platforms, options(true, true))).toBe(true);
    expect(isMessagingSurfaceEnabled(platforms, options(false, true))).toBe(false);
    // Linking-only deployments run linked users on their own credentials.
    expect(isMessagingSurfaceEnabled(platforms, options(false, false))).toBe(true);
    expect(isMessagingSurfaceEnabled([], options(true, true))).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe("enrichSlackTeamRoom", () => {
  const base = {
    type: "message" as const,
    provider: "slack",
    handle: "Ev1",
    threadId: "slack:C1",
    isDirect: false,
    from: "U_OTHER",
    fromLabel: "Ada",
    channelName: "launch",
    participants: ["U_OTHER"],
    content: "hello <@U_SOMEONE>",
    mediaUrl: null,
  };

  it("marks app_mention events as mention", () => {
    const enrichment = enrichSlackTeamRoom(
      {
        team_id: "T1",
        authorizations: [{ user_id: "U_BOT", is_bot: true }],
        event: { type: "app_mention", channel: "C1", text: "<@U_BOT> ship it", user: "U_OTHER" },
      },
      base,
    );
    expect(enrichment.kind).toBe("mention");
    expect(enrichment.workspaceId).toBe("T1");
    expect(enrichment.conversationKey).toBe("C1");
  });

  it("keeps ambient when another user is mentioned, not the bot", () => {
    const enrichment = enrichSlackTeamRoom(
      {
        team_id: "T1",
        authorizations: [{ user_id: "U_BOT", is_bot: true }],
        event: {
          type: "message",
          channel: "C1",
          text: "hey <@U_SOMEONE> can you look?",
          user: "U_OTHER",
        },
      },
      base,
    );
    expect(enrichment.kind).toBe("ambient");
  });

  it("marks a plain message event as mention when the platform reports a bot mention", () => {
    const raw = {
      type: "message",
      channel: "C1",
      text: "<@U_BOT> respond back please?",
      user: "U_OTHER",
      team: "T1",
    };
    expect(enrichSlackTeamRoom(raw, { ...base, mentionsBot: true }).kind).toBe("mention");
    expect(enrichSlackTeamRoom(raw, base).kind).toBe("ambient");
  });
});
