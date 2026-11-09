import type { SourceLink } from "../alternatives";
import { GITHUB_URL, SITE_URL } from "../site";
import type { SandboxImage } from "./types";

export const SANDBOXES_PATH = "/sandboxes/";
export const SANDBOXES_UPDATED = "November 4, 2026";
export const COMPUTER_PROVIDERS_DOCS_PATH = "/docs/self-host-sandbox-providers/";

export function sandboxPath(slug: string): string {
  return `${SANDBOXES_PATH}${slug}/`;
}

/** A provider homepage screenshot in `public/graphics/sandboxes/`. */
export function homepage(slug: string, provider: string, alt: string): SandboxImage {
  return {
    webp: `/graphics/sandboxes/${slug}.webp`,
    avif: `/graphics/sandboxes/${slug}.avif`,
    width: 1280,
    height: 800,
    alt,
    caption: `The ${provider} homepage.`,
  };
}

export const PROVIDERS_DOC: SourceLink = {
  label: "Rakazo, computer providers",
  href: `${GITHUB_URL}/blob/main/docs/self-host-sandbox-providers.md`,
};

export const RUNTIME_DOC: SourceLink = {
  label: "Rakazo, computer runtime and isolation",
  href: `${GITHUB_URL}/blob/main/docs/computer-runtime.md`,
};

/** Small print under every price table. */
export const PRICES_NOTE =
  "Prices in US dollars unless marked, from each provider's pricing page, checked November 2026. Your model provider bills separately.";

/** Hours a month a computer runs 4 hours a workday, and around the clock. */
export const WORKDAY_HOURS = 88;
export const MONTH_HOURS = 720;

/** A rounded estimate, such as "about $34". */
export function aboutUsd(amount: number): string {
  return `about $${Math.round(amount)}`;
}

export function euro(amount: number): string {
  return `€${amount.toFixed(2)}`;
}

/** Servers for self-hosted computers, per month. */
export const SERVERS = {
  hetznerCx33: 8.99,
  hetznerCx43: 16.49,
  hetznerAx42: 79,
  digitalOcean16: 96,
  awsM7i2xlarge: 294,
} as const;

/** Docker computers are capped at 2 GB by default; Rakazo and its database take about 4 GB. */
export const DOCKER_MEMORY = { computerGb: 2, rakazoGb: 4 };
export const dockerComputersFit = (serverGb: number) =>
  Math.floor((serverGb - DOCKER_MEMORY.rakazoGb) / DOCKER_MEMORY.computerGb);

/** An always-on Mac mini's electricity, at an assumed average draw and price. */
export const MAC_MINI = { watts: 20, kwh: 0.2 };
export const macMiniMonthly = (hours: number) => (MAC_MINI.watts * hours * MAC_MINI.kwh) / 1000;

/** Pricing pages cited by more than one sandbox page. */
export const PRICING = {
  dockerSandboxes: {
    label: "Docker, Cloud Sandboxes",
    href: "https://www.docker.com/blog/introducing-cloud-sandboxes-start-on-your-laptop-finish-in-the-cloud/",
  },
  hetzner: { label: "Hetzner Cloud pricing", href: "https://www.hetzner.com/cloud/cost-optimized/" },
  digitalocean: { label: "DigitalOcean Droplet pricing", href: "https://www.digitalocean.com/pricing/droplets" },
  rakazo: { label: "Rakazo pricing", href: `${SITE_URL}/pricing/` },
} satisfies Record<string, SourceLink>;
