import type { SourceLink } from "../alternatives";
import { absolute, articleMarkdown, cell, sectionMarkdown } from "../provider-article/markdown";
import type { ArticleHub, ArticleLink, ArticleSection } from "../provider-article/types";
import { SITE_URL } from "../site";
import { docker } from "./docker";
import {
  COMPUTER_PROVIDERS_DOCS_PATH,
  MONTH_HOURS,
  PRICES_NOTE,
  PRICING,
  SANDBOXES_PATH,
  SANDBOXES_UPDATED,
  SERVERS,
  aboutUsd,
  dockerComputersFit,
  euro,
  macMiniMonthly,
  sandboxPath,
} from "./shared";
import type { Sandbox } from "./types";
import { yourComputer } from "./your-computer";

export * from "./shared";
export type { Sandbox, SandboxImage, SandboxSection } from "./types";

/** Display order everywhere sandboxes are listed. */
export const SANDBOXES: readonly Sandbox[] = [docker, yourComputer];

const About = (amount: number) => `A${aboutUsd(amount).slice(1)}`;

/** Hub sections after the comparison table: prices and isolation. */
const HUB_SECTIONS: readonly ArticleSection[] = [
  {
    heading: "Pricing compared",
    id: "pricing",
    paragraphs: [
      "Every price on these pages is for one person's bots, which share one computer by default. Rakazo gives each person one team computer per space, plus one for each bot you give a computer of its own.",
    ],
    table: {
      caption: "What a bot computer costs on each option Rakazo supports",
      columns: ["Option", "How you pay", "Free to start", "Around the clock"],
      rows: [
        {
          topic: "[Docker](/sandboxes/docker/)",
          cells: [
            "Your own server",
            "Free software",
            `A ${euro(SERVERS.hetznerCx43)} server fits Rakazo and about ${dockerComputersFit(16)} computers`,
          ],
        },
        {
          topic: "[Your computer](/sandboxes/your-computer/)",
          cells: ["Nothing extra", "Free", `${About(macMiniMonthly(MONTH_HOURS))} for a Mac mini`],
        },
      ],
      note: `${PRICES_NOTE} Each option's page shows the rates and assumptions behind its numbers.`,
    },
  },
  {
    heading: "Isolation",
    paragraphs: [
      "Containers share the host's kernel, so a kernel bug can let a process out. Your own computer has no boundary at all: a bot works as you.",
    ],
    table: {
      caption: "Isolation for each option Rakazo supports",
      columns: ["Boundary", "Option", "Good for", "Trade-off"],
      rows: [
        {
          topic: "Container",
          cells: ["[Docker](/sandboxes/docker/)", "Your own bots on your own server", "Shares the host's kernel"],
        },
        {
          topic: "None",
          cells: [
            "[Your computer](/sandboxes/your-computer/)",
            "Work that needs your real apps",
            "A bot can reach everything you can",
          ],
        },
      ],
    },
  },
];

const HUB_SOURCES: readonly SourceLink[] = [PRICING.hetzner, PRICING.rakazo];

export const SANDBOXES_HUB = {
  title: "Where AI agents' computers run in Rakazo: Docker or your own computer",
  description:
    "Where should an AI agent's computer run? Prices and isolation compared for Rakazo's two options: Docker containers on your own server, or your own Mac or PC.",
  h1: "Where Rakazo bots' computers run",
  intro: [
    "An AI agent that only chats can't do much. To clean up an inbox, research a list of companies or fix a bug, it needs a computer: a browser it can sign in with, files it can keep, and a terminal to run things in.",
    "[Rakazo](/) is an open source app for AI teammates that do real work. You talk to each bot in chat, and each one gets its own computer. You can watch its screen and take over at any moment. That computer runs either as a Docker container on your own server or on your own Mac or PC.",
  ],
  scene: {
    bot: "Inbox Manager",
    color: "#6A6BF5",
    where: "Computer on your server",
    ask: "inbox got away from me over the weekend, sweep it?",
    reply: "on it. 41 unread since friday. archiving the noise, drafting the rest.",
    computer: {
      task: "Sweeping Gmail back to Friday.",
      screen: {
        host: "mail.google.com",
        title: "Inbox: 5 drafts parked",
        lines: ["41 threads read", "26 archived · 9 replied", "Nora's renewal held"],
      },
    },
  },
  sections: HUB_SECTIONS,
  choose: [
    {
      heading: "You want bots on their own computers",
      text: "[Docker](/sandboxes/docker/) is the default when you [self-host Rakazo](/self-hosted-ai-agent/): each bot gets a locked-down container with a desktop, on your own machine, with no cloud account.",
    },
    {
      heading: "You want your bots on your real apps",
      text: "The Rakazo desktop app can let bots use [your own computer](/sandboxes/your-computer/), with your files, apps and logins. That isn't a sandbox, so only turn it on for bots you'd trust unattended.",
    },
  ],
  faq: [
    {
      question: "What is an AI agent sandbox?",
      answer:
        "An isolated computer where an agent can run commands, use a browser and change files without touching your own machine. In Rakazo it's the bot's computer, which you can watch and take over.",
    },
    {
      question: "Do I need a sandbox provider to run Rakazo?",
      answer:
        "No. When you [self-host](/self-hosted-ai-agent/), Docker computers work out of the box with no cloud account.",
    },
    {
      question: "Is Docker a real sandbox for AI agents?",
      answer:
        "It's a real boundary but not the strongest. Rakazo's containers drop every Linux capability and cap memory, CPU and processes, but they share the host's kernel.",
    },
  ],
  sources: HUB_SOURCES,
} as const;

export const SANDBOXES_ARTICLE_HUB: ArticleHub = {
  label: "Sandboxes for AI agents",
  compareLabel: "Compare all sandboxes",
  href: SANDBOXES_PATH,
  moreHeading: "More sandboxes for AI agents",
  guide: { label: "Computer providers guide", href: COMPUTER_PROVIDERS_DOCS_PATH },
};

export function sandboxLink(sandbox: Sandbox): ArticleLink {
  return { name: sandbox.name, href: sandboxPath(sandbox.slug), meta: sandbox.bestFor, image: sandbox.image };
}

export function otherSandboxes(sandbox: Sandbox): ArticleLink[] {
  return SANDBOXES.filter((other) => other.slug !== sandbox.slug).map(sandboxLink);
}

/** Markdown twin of a sandbox page, for agents and `.md` requests. */
export function sandboxMarkdown(sandbox: Sandbox): string {
  return articleMarkdown(sandbox, {
    hub: SANDBOXES_ARTICLE_HUB,
    others: otherSandboxes(sandbox),
    updated: SANDBOXES_UPDATED,
  });
}

/** Markdown twin of the sandboxes hub. */
export function sandboxesHubMarkdown(): string {
  return [
    `# ${SANDBOXES_HUB.h1}`,
    "",
    ...SANDBOXES_HUB.intro.flatMap((paragraph) => [absolute(paragraph), ""]),
    `Updated ${SANDBOXES_UPDATED}.`,
    "",
    "## Compared",
    "",
    "| Sandbox | Runs on | Keeps between sessions | Best for |",
    "| --- | --- | --- | --- |",
    ...SANDBOXES.map(
      (sandbox) =>
        `| [${cell(sandbox.name)}](${SITE_URL}${sandboxPath(sandbox.slug)}) | ${cell(sandbox.runsOn)} | ${cell(sandbox.keeps)} | ${cell(sandbox.bestFor)} |`,
    ),
    "",
    ...SANDBOXES_HUB.sections.flatMap(sectionMarkdown),
    "## How to choose",
    "",
    ...SANDBOXES_HUB.choose.flatMap((item) => [`### ${item.heading}`, "", absolute(item.text), ""]),
    `[Computer providers guide](${SITE_URL}${COMPUTER_PROVIDERS_DOCS_PATH})`,
    "",
    "## FAQ",
    "",
    ...SANDBOXES_HUB.faq.flatMap((item) => [`### ${item.question}`, "", absolute(item.answer), ""]),
    "## Sources",
    "",
    ...SANDBOXES_HUB.sources.map((source) => `- [${source.label}](${source.href})`),
    "",
  ].join("\n");
}
