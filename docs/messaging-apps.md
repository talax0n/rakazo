# Chat apps

Message your bots from Slack, and add them to channels there.

> [!NOTE]
> **Settings → Messaging** appears only when your server has Slack set up. On a self-hosted server
> the operator configures it; see
> [Self-hosting](./self-host.md).

## Link a bot to a chat app

1. Open **Settings → Messaging**.
2. Pick the bot, then choose the app under **Connect a chat app**.
3. Send the code shown from that app within 10 minutes.

From then on, messages you send there go to that bot's chat, and its replies come back to you there.
The conversation is the same one you see in the Rakazo app.

In direct messages, a voice note the chat app delivers as an audio file is transcribed when a voice provider that supports transcription is connected in **Voice**
settings; without one, the bot receives the audio file.

To stop, choose **Unlink**.

## Slack

Choose **Connect** next to Slack to add Rakazo to your Slack workspace, then **Link DMs** so direct
messages reach your bot.

The bot uses its memory and notes only for your own messages: the Slack account that connected the
workspace or linked its DMs. It answers anyone else in the workspace, including guests and other
apps, the way it answers a group chat.

A [routine](./routines.md) can also start from a **Slack message**.

## Group chats

Add your bot to a group or channel in the chat app. The invite appears under **Requests** in
**Settings → Messaging**; choose **Approve** or **Decline**. Approved groups are listed under
**Conversations**, where you can **Leave** one at any time.

You can also answer an invite or a connection request by replying YES or NO to its message, within a
day and before anything else arrives from the line.

Slack rooms added through a workspace are team conversations, the only ones with per-room
settings. Open a conversation's **Settings** to decide how the bot behaves there:

- **Listening**: **Listen** to everything, or **Mentions only**. Either way, the bot answers when
  mentioned directly.
- **Room guidance**: plain-language rules for the room, such as "Engage when someone asks about
  invoices. Ignore small talk."
- **Automated senders**: for each bot or integration that posts in the room, choose **Ignore**,
  **Group updates** into a periodic digest, **Always act**, or **Treat like a person**.
