const PROVIDER_NAMES: Record<string, string> = {
  slack: "Slack",
};

/** User-facing name of a messaging provider (falls back to the raw id). */
export function messagingProviderName(provider: string): string {
  return PROVIDER_NAMES[provider] ?? provider;
}

/** Per-message provider label: the message's own transport when the platform reports one. */
export function messagingProviderLabel(provider: string, transport?: string): string {
  return transport || messagingProviderName(provider);
}

/** One connection option per app; workspace authorization replaces Slack's code setup. */
export function messagingConnectOptions(
  providers: readonly string[],
  slackInstallAvailable: boolean,
) {
  const available = new Set(providers);
  if (slackInstallAvailable) available.add("slack");
  return [...available].map((provider) => ({
    provider,
    method:
      provider === "slack" && slackInstallAvailable ? ("install" as const) : ("link" as const),
  }));
}
