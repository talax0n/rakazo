-- deferred
-- The consecutive-outbound counter only fed a vendor send cap for a messaging platform that is
-- gone. The previous release still writes it, so it drops once that release has stopped.
ALTER TABLE "messaging_identities" DROP COLUMN "outboundSinceInbound";
