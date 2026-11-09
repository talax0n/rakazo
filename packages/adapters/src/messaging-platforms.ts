import type { MessagingInboundMessage } from "@rakazo/adapter-kit";
import type { Adapter } from "chat";
import type { MessagingPlatform } from "./chat-sdk-surface.js";
import { boundInboundMarkdown } from "./chat-sdk-surface.js";
import { lazyChatAdapter } from "./lazy-chat-adapter.js";
import { isVitestRuntime } from "./test-runtime.js";

/**
 * Parsed platform credentials, filled from process.env at the composition
 * roots. A platform mounts when its full credential set is present.
 */
export interface MessagingEnvironmentValues {
  slackBotToken?: string | undefined;
  slackSigningSecret?: string | undefined;
}

export function messagingEnvFromProcess(
  env: Record<string, string | undefined>,
): MessagingEnvironmentValues {
  // Same trim/empty-to-undefined normalization the API's env loader applies,
  // so a credential with stray whitespace behaves identically in both roles.
  const clean = (value: string | undefined) => value?.trim() || undefined;
  return {
    slackBotToken: clean(env.SLACK_BOT_TOKEN),
    slackSigningSecret: clean(env.SLACK_SIGNING_SECRET),
  };
}

export function messagingPlatformsFromEnv(env: MessagingEnvironmentValues): MessagingPlatform[] {
  const platforms: MessagingPlatform[] = [];

  if (env.slackBotToken && env.slackSigningSecret) {
    const config = {
      botToken: env.slackBotToken,
      signingSecret: env.slackSigningSecret,
      // WebClient defaults to ten retries over ~30 minutes with no timeout,
      // sleeping through rate limits; that duplicates posts and stalls the
      // outbox. Fail fast and let the outbox back off (honouring retryAfter).
      webClientOptions: {
        retryConfig: { retries: 0 },
        rejectRateLimitedCalls: true,
        timeout: MESSAGING_SEND_TIMEOUT_MS,
      },
    };
    const adapter = lazyChatAdapter("slack", async () => {
      const { createSlackAdapter } = await import("@chat-adapter/slack");
      const slack = createSlackAdapter(config);
      boundInboundMarkdown(slack);
      // Slack's reactions.add fails with already_reacted when a replayed inbound reacts twice.
      const addReaction = slack.addReaction.bind(slack);
      Object.assign(slack, {
        addReaction: (threadId, messageId, emoji) =>
          addReaction(threadId, messageId, emoji).catch((error: unknown) => {
            if (slackPlatformError(error) !== "already_reacted") throw error;
          }),
      } satisfies Pick<Adapter, "addReaction">);
      return slack;
    });
    platforms.push({
      provider: "slack",
      capabilities: { direct: true, groups: true, receipt: "reaction" },
      adapter,
      enrichTeamRoom: enrichSlackTeamRoom,
      redeliveryKeys: slackRedeliveryKeys,
      isPermanentSendError: (error) => SLACK_PERMANENT_ERRORS.has(slackPlatformError(error) ?? ""),
    });
  }

  return platforms;
}

/** Never live under the test runner; tests build surfaces explicitly. */
export function isMessagingEnabled(platforms: MessagingPlatform[]): boolean {
  return platforms.length > 0 && !isVitestRuntime();
}

/**
 * Linked users run on their own credentials, so linking-only deployments
 * need no deployment model. Open signup provisions users with no credential
 * of their own, so that mode requires a configured deployment model — without
 * it their runs cannot execute.
 */
export function isMessagingSurfaceEnabled(
  platforms: MessagingPlatform[],
  options: { deploymentModelConfigured: boolean; openSignup: boolean },
): boolean {
  if (!isMessagingEnabled(platforms)) return false;
  return options.openSignup ? options.deploymentModelConfigured : true;
}

/** Bounds one vendor send so a hung request cannot stall the sequential outbox drain. */
const MESSAGING_SEND_TIMEOUT_MS = 10_000;

/** Slack errors a retry cannot fix: the bot cannot reach the channel or its token is dead. */
const SLACK_PERMANENT_ERRORS = new Set([
  "channel_not_found",
  "not_in_channel",
  "is_archived",
  "invalid_auth",
  "account_inactive",
  "token_revoked",
]);

/** Slack's marker for a dispatched event; it turns Slack's retries into no-ops. */
function slackRedeliveryKeys(payload: unknown): string[] {
  const eventId = stringField(asRecord(payload) ?? {}, "event_id");
  return eventId ? [`slack:event-delivered:${eventId}`] : [];
}

/** Pull Slack team-room fields the Chat SDK does not expose on Message. */
export function enrichSlackTeamRoom(
  raw: unknown,
  base: MessagingInboundMessage,
): Partial<MessagingInboundMessage> {
  const root = asRecord(raw);
  if (!root) return {};
  const event = asRecord(root.event) ?? root;
  const teamId =
    stringField(root, "team_id") ?? stringField(event, "team") ?? stringField(event, "team_id");
  const eventType = stringField(event, "type");
  const botProfile = asRecord(event.bot_profile) ?? {};
  const botId = stringField(event, "bot_id") ?? stringField(botProfile, "id");
  const threadTs = stringField(event, "thread_ts");
  const channel = stringField(event, "channel");
  const enrichment: Partial<MessagingInboundMessage> = {};
  if (teamId) enrichment.workspaceId = teamId;
  if (channel) enrichment.conversationKey = channel;
  if (botId) enrichment.senderIsBot = true;
  else if (typeof event.bot_id === "string" || event.subtype === "bot_message") {
    enrichment.senderIsBot = true;
  }
  if (threadTs) enrichment.replyThreadId = threadTs;
  else enrichment.replyThreadId = null;
  if (!base.isDirect) {
    // Slack sends both app_mention and message.* for one channel mention and
    // the SDK keeps whichever arrives first, so the plain event relies on the
    // SDK's own mention check. A mention of someone else stays ambient so
    // listen policy still applies.
    enrichment.kind = eventType === "app_mention" || base.mentionsBot ? "mention" : "ambient";
  }
  return enrichment;
}

function slackPlatformError(error: unknown): string | undefined {
  const record = asRecord(error);
  if (record?.code !== "slack_webapi_platform_error") return undefined;
  return stringField(asRecord(record.data) ?? {}, "error");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value ? value : undefined;
}
