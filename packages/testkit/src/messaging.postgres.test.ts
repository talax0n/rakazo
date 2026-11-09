import { randomInt } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TeamChatEmulatorInbound } from "@rakazo/adapters";
import { MessagingTeamChatEmulator, ScriptedAgentRuntime } from "@rakazo/adapters";
import { formatMessagingLinkCode, issueMessagingLinkCode } from "@rakazo/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { asSystem } from "./system-db.js";

process.env.WAKEUP_DRIVER = "memory";
process.env.SANDBOX_PROVIDER = "fake";
process.env.AGENT_RUNTIME = "scripted";

const hasDb = process.env.VERIFY_DATABASE === "1" && Boolean(process.env.DATABASE_URL);
const describeMessaging = hasDb ? describe.sequential : describe.skip;

// Offline journeys: a recording messaging surface, no live vendor or paid line.
describeMessaging("messaging surface journeys", () => {
  let stop: () => Promise<void>;
  let prisma: any;
  const emulator = new MessagingTeamChatEmulator({ provider: "chat" });
  const dataDir = mkdtempSync(path.join(tmpdir(), "rakazo-messaging-"));
  // Unique per run: identities, threads, and outbox rows persist in the dev
  // database. Random E.164 fixtures — a timestamp suffix repeats within
  // hours and collides with earlier runs.
  const stamp = Date.now();
  const uniqueNumber = () => `+1555${String(randomInt(10_000_000)).padStart(7, "0")}`;
  const sender = uniqueNumber();
  const dmHandle = `journey-dm-${stamp}`;
  const groupThreadId = (groupId: string) => `chat:${groupId}`;
  const dmThreadId = (address: string) => `chat:dm:${address}`;
  const findIdentity = (address: string) =>
    prisma.messagingIdentity.findUnique({
      where: { provider_address: { provider: "chat", address } },
    });
  /** One inbound message, direct unless it names a group. */
  const deliver = (input: {
    fromNumber: string;
    content: string;
    handle?: string;
    groupId?: string;
    participants?: string[];
    mediaUrl?: string;
  }) => {
    const inbound: TeamChatEmulatorInbound = {
      from: input.fromNumber,
      fromLabel: null,
      content: input.content,
      isDirect: !input.groupId,
      threadId: input.groupId ? groupThreadId(input.groupId) : dmThreadId(input.fromNumber),
      channelName: null,
      participants: input.participants ?? [],
      ...(input.handle ? { handle: input.handle } : {}),
      ...(input.mediaUrl ? { mediaUrl: input.mediaUrl } : {}),
    };
    return emulator.emitInbound(inbound);
  };
  const sentTo = (address: string) =>
    emulator.sent.filter((send) => send.threadId === dmThreadId(address));
  const sentToGroup = (groupId: string) =>
    emulator.sent.filter((send) => send.threadId === groupThreadId(groupId));

  /** Text answers apply only to a request the person has received. */
  const waitForInviteSent = async (address: string) => {
    const identity = await waitForDatabase(async () => findIdentity(address));
    await waitForDatabase(async () =>
      prisma.messagingOutbound.findFirst({
        where: {
          identityId: identity.id,
          idempotencyKey: { startsWith: "invite:" },
          status: "sent",
        },
      }),
    );
  };

  /** A DM to the bot, returned once its reply has gone out, as a person would see it. */
  const dmAndWaitForReply = async (address: string, content: string, handle: string) => {
    await deliver({ fromNumber: address, content, handle });
    const identity = await waitForDatabase(async () => findIdentity(address));
    const thread = await waitForDatabase(async () =>
      prisma.thread.findFirst({ where: { botId: identity.botId } }),
    );
    const message = await waitForDatabase(async () =>
      prisma.message.findUnique({
        where: {
          threadId_clientNonce: {
            threadId: thread.id,
            clientNonce: `messaging:chat:${handle}`,
          },
        },
      }),
    );
    await waitForDatabase(async () => {
      const run = await prisma.run.findFirst({ where: { sourceMessageId: message.id } });
      return run?.messagingMirroredAt ? run : null;
    });
    return identity;
  };

  beforeAll(async () => {
    const { createApp } = await import("@rakazo/api/app");
    const handles = await createApp({
      databaseUrl: process.env.DATABASE_URL!,
      dataDir,
      sandboxProvider: "fake",
      agentRuntime: "scripted",
      // These journeys exercise the Poke-style open line; the linking journey
      // below covers the default (linking-only) posture explicitly.
      messagingOpenSignup: true,
      messaging: emulator,
    });
    stop = handles.stop;
    prisma = asSystem(handles.prisma);
  });

  afterAll(async () => {
    await stop?.();
  });

  it("provisions on first text, runs the bot, and mirrors the reply back out", async () => {
    await deliver({
      fromNumber: sender,
      content: "hello there",
      handle: dmHandle,
    });

    // The reply runs and mirrors after inbound returns, so its effects are
    // eventually consistent.
    const identity = await waitForDatabase(async () => findIdentity(sender));
    // A non-null provider handle is the last durable signal of the whole
    // mirror loop (the claim flips status before the provider call lands).
    await waitForDatabase(async () =>
      Boolean(
        await prisma.messagingOutbound.findFirst({
          where: {
            identityId: identity.id,
            kind: "dm",
            status: "sent",
            providerHandle: { not: null },
          },
        }),
      ),
    );
    expect(sentTo(sender).length).toBeGreaterThan(0);

    const refreshed = await findIdentity(sender);
    // The 1:1 conversation id is learned from the inbound webhook; outbound
    // DMs resolve through it instead of a provider lookup.
    expect(refreshed.dmThreadId).toBe(dmThreadId(sender));
    const outbound = await prisma.messagingOutbound.findMany({
      where: { identityId: identity.id, kind: "dm" },
    });
    expect(outbound).toHaveLength(1);
    expect(outbound[0].providerHandle).toBeTruthy();

    const userMessage = await prisma.message.findFirst({
      where: {
        threadId: (await prisma.thread.findFirst({ where: { botId: identity.botId } })).id,
        role: "user",
      },
    });
    expect(userMessage.clientNonce).toBe(`messaging:chat:${dmHandle}`);
  });

  it("replays the same handle without a duplicate message or send", async () => {
    await deliver({
      fromNumber: sender,
      content: "hello there",
      handle: dmHandle,
    });

    // Give any erroneous duplicate work a chance to appear.
    await new Promise((resolve) => setTimeout(resolve, 500));

    const identity = await findIdentity(sender);
    const thread = await prisma.thread.findFirst({ where: { botId: identity.botId } });
    const userMessages = await prisma.message.findMany({
      where: { threadId: thread.id, role: "user" },
    });
    expect(userMessages).toHaveLength(1);
    const outbound = await prisma.messagingOutbound.findMany({
      where: { identityId: identity.id, kind: "dm" },
    });
    expect(outbound).toHaveLength(1);
    expect(sentTo(sender)).toHaveLength(1);
  });

  it("answers a text sent while an app turn is working back in the chat it came from", async () => {
    const texter = uniqueNumber();
    await deliver({
      fromNumber: texter,
      content: "hello",
      handle: `journey-busy-hello-${stamp}`,
    });
    const identity = await waitForDatabase(async () => findIdentity(texter));
    const sentReplies = () =>
      prisma.messagingOutbound.count({
        where: { identityId: identity.id, kind: "dm", providerHandle: { not: null } },
      });
    await waitForDatabase(async () => (await sentReplies()) === 1);

    // The owner started a turn in the app; it is still queued when the text arrives.
    const thread = await prisma.thread.findFirst({ where: { botId: identity.botId } });
    const task = await prisma.task.create({
      data: {
        spaceId: identity.spaceId,
        botId: identity.botId,
        threadId: thread.id,
        userId: identity.userId,
        prompt: "Plan the offsite",
        status: "queued",
      },
    });
    const appRun = await prisma.run.create({
      data: {
        spaceId: identity.spaceId,
        botId: identity.botId,
        threadId: thread.id,
        taskId: task.id,
        userId: identity.userId,
        status: "queued",
        trigger: "user",
      },
    });

    const histories = new Map<string, string>();
    const scripted = ScriptedAgentRuntime.prototype.run;
    const runtime = vi.spyOn(ScriptedAgentRuntime.prototype, "run").mockImplementation(function (
      this: ScriptedAgentRuntime,
      request,
      context,
    ) {
      histories.set(request.runId, JSON.stringify(request.history));
      return scripted.call(this, request, context);
    });
    try {
      await deliver({
        fromNumber: texter,
        content: "How is it going?",
        handle: `journey-busy-status-${stamp}`,
      });
      await waitForDatabase(async () => {
        const run = await prisma.run.findUnique({ where: { id: appRun.id } });
        return run.status === "completed";
      });
      // The app turn's reply stays in the app, so the text needs its own reply by text.
      await waitForDatabase(async () => (await sentReplies()) === 2);
    } finally {
      runtime.mockRestore();
    }
    expect(sentTo(texter)).toHaveLength(2);
    // Only the run that answers the text sees it.
    const continuation = await prisma.run.findFirst({
      where: { threadId: thread.id, trigger: "messaging", createdAt: { gt: appRun.createdAt } },
    });
    expect(histories.get(appRun.id)).not.toContain("How is it going?");
    expect(histories.get(continuation.id)).toContain("How is it going?");
  });

  it("runs the channel loop: discovery, invite, intro, YES, fan-out, attributed post", async () => {
    const stranger = uniqueNumber();
    const groupId = `grp-${stamp}`;
    const threadId = groupThreadId(groupId);

    // 1. Discovery: first group message creates the channel, invites the
    // linked sender, and posts one intro for the unlinked stranger.
    await deliver({
      fromNumber: sender,
      content: "hey everyone",
      groupId,
      participants: [sender, stranger],
      handle: `grp-discover-${stamp}`,
    });

    await waitForDatabase(async () =>
      Boolean(
        await prisma.messagingOutbound.findFirst({
          where: { threadId, kind: "intro", status: "sent", providerHandle: { not: null } },
        }),
      ),
    );
    const channel = await prisma.messagingChannel.findUnique({ where: { threadId } });
    expect(channel).toBeTruthy();
    expect(channel.provider).toBe("chat");
    const members = await prisma.messagingChannelMember.findMany({
      where: { channelId: channel.id },
      orderBy: { address: "asc" },
    });
    expect(members).toHaveLength(2);
    const senderMember = members.find((m: any) => m.address === sender);
    expect(senderMember.status).toBe("invited");
    expect(senderMember.identityId).toBeTruthy();
    const strangerMember = members.find((m: any) => m.address === stranger);
    expect(strangerMember.identityId).toBeNull();
    // invite DM went out to the sender, intro went to the group, both once
    expect(sentToGroup(groupId)).toHaveLength(1);
    // the invited-only sender's message was not fanned out to any bot
    const identity = await findIdentity(sender);
    const runsBefore = await prisma.run.count({ where: { botId: identity.botId } });

    // 2. The owner approves by text command, sent as plain SMS.
    await waitForInviteSent(sender);
    await deliver({
      fromNumber: sender,
      content: "YES",
      handle: `grp-yes-${stamp}`,
    });
    await waitForDatabase(async () => {
      const member = await prisma.messagingChannelMember.findUnique({
        where: { channelId_address: { channelId: channel.id, address: sender } },
      });
      return member?.status === "approved";
    });

    // 3. The next group message fans out to the approved bot, whose reply
    // is posted back to the group with attribution.
    await deliver({
      fromNumber: sender,
      content: "what do you think?",
      groupId,
      participants: [sender, stranger],
      handle: `grp-second-${stamp}`,
    });

    await waitForDatabase(async () =>
      Boolean(
        await prisma.messagingOutbound.findFirst({
          where: { threadId, kind: "group", status: "sent", providerHandle: { not: null } },
        }),
      ),
    );
    const posts = await prisma.messagingOutbound.findMany({
      where: { threadId, kind: "group", status: "sent" },
    });
    expect(posts).toHaveLength(1);
    // Messaging-provisioned users default to "<Provider> <last4>".
    expect(posts[0].body).toMatch(/^Chat's agent: /);
    expect(await prisma.run.count({ where: { botId: identity.botId } })).toBeGreaterThan(
      runsBefore,
    );
  });

  it("declines a channel invite on NO without waking the bot", async () => {
    const owner = uniqueNumber();
    const stranger = uniqueNumber();
    const groupId = `grp-no-${stamp}`;

    const identity = await dmAndWaitForReply(owner, "link me", `no-dm-${stamp}`);
    const runsBefore = await prisma.run.count({ where: { botId: identity.botId } });

    await deliver({
      fromNumber: owner,
      content: "group hello",
      groupId,
      participants: [owner, stranger],
      handle: `no-discover-${stamp}`,
    });
    const channel = await waitForDatabase(async () =>
      prisma.messagingChannel.findUnique({ where: { threadId: groupThreadId(groupId) } }),
    );

    await waitForInviteSent(owner);
    await deliver({
      fromNumber: owner,
      content: "NO",
      handle: `no-cmd-${stamp}`,
    });
    await waitForDatabase(async () => {
      const member = await prisma.messagingChannelMember.findUnique({
        where: { channelId_address: { channelId: channel.id, address: owner } },
      });
      return member?.status === "declined";
    });

    await deliver({
      fromNumber: owner,
      content: "should not fan out",
      groupId,
      participants: [owner, stranger],
      handle: `no-ignored-${stamp}`,
    });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(await prisma.run.count({ where: { botId: identity.botId } })).toBe(runsBefore);
  });

  it("stops the owner's work on a direct STOP and answers an idle one; media and group stops stay messages", async () => {
    const owner = uniqueNumber();
    const groupId = `grp-stop-${stamp}`;
    const note = "Stopped. Anything already done stays done.";
    const text = (content: string, handle: string, extra: Record<string, unknown> = {}) =>
      deliver({ fromNumber: owner, content, handle, ...extra });
    const runStatus = async (id: string) =>
      (await prisma.run.findUnique({ where: { id }, select: { status: true } })).status;
    const running = () =>
      waitForDatabase(async () =>
        prisma.run.findFirst({ where: { botId: identity.botId, status: "running" } }),
      );
    const confirmations = () =>
      prisma.messagingOutbound.count({ where: { identityId: identity.id, body: note } });
    const notes = async () =>
      (await prisma.message.findMany({ where: { threadId: thread.id, role: "system" } })).filter(
        (message: { blocks: unknown }) => JSON.stringify(message.blocks).includes(note),
      ).length;

    await text("keep working until I stop you", `stop-work-${stamp}`);
    const identity = await waitForDatabase(async () => findIdentity(owner));
    const thread = await prisma.thread.findFirst({ where: { botId: identity.botId } });
    const first = await running();

    await text("stop", `stop-group-${stamp}`, {
      groupId,
      participants: [owner, uniqueNumber()],
    });
    await text("stop", `stop-media-${stamp}`, { mediaUrl: "https://cdn.example.test/photo.jpg" });
    await waitForDatabase(async () =>
      Boolean(
        await prisma.message.findFirst({
          where: { threadId: thread.id, clientNonce: `messaging:chat:stop-media-${stamp}` },
        }),
      ),
    );
    expect(await runStatus(first.id)).toBe("running");

    await text("STOP.", `stop-dm-${stamp}`);
    await waitForDatabase(async () => (await runStatus(first.id)) === "cancelled");
    await waitForDatabase(async () => sentTo(owner).some((send) => send.body === note));

    const runs = await prisma.run.count({ where: { botId: identity.botId } });
    expect([await confirmations(), await notes()]).toEqual([1, 1]);

    // Nothing running: still the command, answered without a turn.
    await text("stop", `stop-idle-${stamp}`);
    await waitForDatabase(async () =>
      sentTo(owner).some((send) => send.body === "Nothing is running."),
    );
    expect(await prisma.run.count({ where: { botId: identity.botId } })).toBe(runs);
    expect([await confirmations(), await notes()]).toEqual([1, 1]);
  });

  it("leaves an approved channel on LEAVE and can rejoin via a later invite", async () => {
    const owner = uniqueNumber();
    const stranger = uniqueNumber();
    const groupId = `grp-leave-${stamp}`;

    await dmAndWaitForReply(owner, "link me again", `leave-dm-${stamp}`);

    await deliver({
      fromNumber: owner,
      content: "group hello",
      groupId,
      participants: [owner, stranger],
      handle: `leave-discover-${stamp}`,
    });
    const channel = await waitForDatabase(async () =>
      prisma.messagingChannel.findUnique({ where: { threadId: groupThreadId(groupId) } }),
    );

    await waitForInviteSent(owner);
    await deliver({
      fromNumber: owner,
      content: "YES",
      handle: `leave-yes-${stamp}`,
    });
    await waitForDatabase(async () => {
      const member = await prisma.messagingChannelMember.findUnique({
        where: { channelId_address: { channelId: channel.id, address: owner } },
      });
      return member?.status === "approved";
    });

    await deliver({
      fromNumber: owner,
      content: "LEAVE",
      handle: `leave-cmd-${stamp}`,
    });
    await waitForDatabase(async () => {
      const member = await prisma.messagingChannelMember.findUnique({
        where: { channelId_address: { channelId: channel.id, address: owner } },
      });
      return member?.status === "left";
    });

    await deliver({
      fromNumber: owner,
      content: "back again",
      groupId,
      participants: [owner, stranger],
      handle: `leave-rejoin-${stamp}`,
    });
    await waitForDatabase(async () => {
      const member = await prisma.messagingChannelMember.findUnique({
        where: { channelId_address: { channelId: channel.id, address: owner } },
      });
      return member?.status === "invited";
    });
  });

  it("answers a group invite by text only right after it", async () => {
    const owner = uniqueNumber();
    const stranger = uniqueNumber();
    const groupId = `grp-answer-${stamp}`;
    await dmAndWaitForReply(owner, "hello", `answer-dm-${stamp}`);
    await deliver({
      fromNumber: owner,
      content: "group hello",
      groupId,
      participants: [owner, stranger],
      handle: `answer-discover-${stamp}`,
    });
    const channel = await waitForDatabase(async () =>
      prisma.messagingChannel.findUnique({ where: { threadId: groupThreadId(groupId) } }),
    );
    const memberStatus = async () =>
      (
        await prisma.messagingChannelMember.findUnique({
          where: { channelId_address: { channelId: channel.id, address: owner } },
        })
      )?.status;
    await waitForDatabase(async () => (await memberStatus()) === "invited");
    await waitForInviteSent(owner);

    // Once the bot has said something since, a bare YES is a reply to the bot.
    await dmAndWaitForReply(owner, "Should I book the table?", `answer-question-${stamp}`);
    await dmAndWaitForReply(owner, "YES", `answer-yes-${stamp}`);
    expect(await memberStatus()).toBe("invited");
  });

  // Runs last: it unlinks the first journey's identity to free its bot.
  it("links a new address to an existing account via a web-issued code", async () => {
    const owner = await findIdentity(sender);
    expect(owner).toBeTruthy();
    // Unlink (as the web UI would) so the bot is free to link again.
    await prisma.messagingIdentity.delete({ where: { id: owner.id } });
    const issued = await issueMessagingLinkCode(prisma, {
      userId: owner.userId,
      spaceId: owner.spaceId,
      botId: owner.botId,
    });
    const newAddress = uniqueNumber();
    await deliver({
      fromNumber: newAddress,
      content: formatMessagingLinkCode(issued.code),
    });
    const linked = await waitForDatabase<{ userId: string; botId: string }>(() =>
      findIdentity(newAddress),
    );
    expect(linked.userId).toBe(owner.userId);
    expect(linked.botId).toBe(owner.botId);
    // The confirmation DM drains through the vendor to the new address.
    await waitForDatabase(async () =>
      sentTo(newAddress).find((message) => message.body.startsWith("Linked")),
    );
    // The code is single-use: a replay never binds another address to the
    // issuer's account. (This suite runs the open line, so the replayer
    // auto-provisions a fresh account of their own instead.)
    const replayAddress = uniqueNumber();
    await deliver({
      fromNumber: replayAddress,
      content: formatMessagingLinkCode(issued.code),
    });
    const replayIdentity = await waitForDatabase<{ userId: string; botId: string }>(() =>
      findIdentity(replayAddress),
    );
    expect(replayIdentity.userId).not.toBe(owner.userId);
    expect(replayIdentity.botId).not.toBe(owner.botId);
  });
});

async function waitForDatabase<T>(pred: () => Promise<T | false | null | undefined>): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < 15_000) {
    const value = await pred();
    if (value) return value as T;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("timeout waiting for database state");
}
