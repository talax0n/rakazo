# Self-host sandbox / computer providers

`SANDBOX_PROVIDER` selects where bot computers run. Workspace bots share a Team Computer by
default; Private Computers are optional. See [computer runtime and isolation](./computer-runtime.md)
for the sharing and persistence contract.

## Quick pick

| Goal | Set | Also need |
| --- | --- | --- |
| Local Docker computers | `SANDBOX_PROVIDER=docker` | `SANDBOX_SUPERVISOR_TOKEN`, computer image, Docker socket for supervisor |
| UI only, no computers | `SANDBOX_PROVIDER=none` | No provider credential; published-images Compose still requires `SANDBOX_SUPERVISOR_TOKEN` |

The accepted values are `none`, `docker`, `desktop` (development only, see below) and `fake`
(verification only). Any other value stops the API and worker at startup with
`Unknown SANDBOX_PROVIDER`. Computers created under a provider that is no longer supported are
treated as gone: their next start creates a new computer on the configured provider and restores
the saved workspace.

Published-images [Compose](../infra/compose/docker-compose.images.yml) defaults to **`docker`**.
It always starts the supervisor and requires `SANDBOX_SUPERVISOR_TOKEN`, including for `none`.

## Choosing a provider

The Electron desktop app is a client of the same API. Docker remains the default. For an app-managed local instance, the local operator can choose **Use this Mac** (macOS) or **Use this computer** (Windows/Linux). After native confirmation, an authenticated bridge sends commands from the Docker backend to Electron, where they run under your OS account. **Computer Access…** in the app menu changes the choice; **Revoke Local Computer Access** immediately disconnects active operations and revokes the saved permission. Local execution requires the desktop app to remain running. Connecting to an existing remote instance does not grant it access to your computer. Browser and mobile clients use the deployment’s configured computer; they do not expose their own host. `SANDBOX_PROVIDER=desktop` is a separate, development-only configuration for backends running directly on the intended host.

Native file reads and workspace exports are limited to 8 MiB per file. A larger workspace file fails the checkpoint and preserves the previous saved workspace; local files remain on the computer. Writes are bounded by the 12 MiB encoded request limit.

- **Published images** (`docker-compose.images.yml`) default to `SANDBOX_PROVIDER=docker` with a
  local supervisor and published `ghcr.io/elie222/rakazo/computer` image.
- **Docker** is the quick-start default for published images and for a source checkout / full local
  Compose stack. Workspace bots share a persistent Team Computer by default; Private computers are
  optional. Keep the supervisor private, as the included Compose files do.
- **Local computer access** in the app-managed Electron instance runs commands on Windows, macOS,
  or Linux through the native bridge. Bots can read/change local files and launch installed apps
  through OS commands, subject to your account and OS permissions. Portable file tools and
  checkpoints remain scoped to bot workspaces; use commands for other local folders. Graphical
  screen control is unavailable. Permission is remembered locally and can be revoked from the
  app menu. Only enable this for a trusted personal instance: every bot on that instance can use
  your account’s permissions.
- **Desktop provider** (`SANDBOX_PROVIDER=desktop`) runs commands directly on the API/worker host,
  with only a minimal shell environment (no server secrets). The API and worker refuse it unless
  `NODE_ENV` is `development` or `test`, so a production server never runs bot commands on itself.
  Setting this inside a container does not grant access to the physical computer. Docker deployments
  use the authenticated native bridge when local computer access is selected; they never silently
  fall back to executing on the backend host.
- **Fake** is only an emulator for verification.
- **None** boots the product without a computer host (fallback when Docker/supervisor is not
  configured).

## `docker` (in-stack supervisor)

Compose starts a **sandbox supervisor** (from the app image) on the internal
network (port `7091` in published-images). It creates sibling **computer**
containers from `RAKAZO_COMPUTER_IMAGE` + `RAKAZO_COMPUTER_IMAGE_TAG`.

Requirements:

- Non-empty `SANDBOX_SUPERVISOR_TOKEN` (distinct from auth / screen / encryption secrets)
- Reachable computer image (GHCR default or your mirror; on arm64 pin multi-arch tags for both app and computer)
- Docker Engine available to the supervisor (socket mount on the Compose path)

Verify:

```bash
curl -fsS http://127.0.0.1:3100/internal/health
# expect sandbox: docker
```

Missing supervisor token is a **setup failure**: do not treat `sandbox: "none"` as success for this path.

Resource ceilings, network isolation and shared folders for these computers are covered in
[Docker computers](./self-host-docker-computers.md).

### Bot browser

The published computer image uses Chromium. To use Google Chrome or Brave instead, build the image
with `BROWSER=chrome` or `BROWSER=brave` and point Compose at it:

```bash
docker build --build-arg BROWSER=chrome -t rakazo-computer-chrome infra/sandboxes/computer
```

```env
RAKAZO_COMPUTER_IMAGE=rakazo-computer-chrome
RAKAZO_COMPUTER_IMAGE_TAG=latest
```

The image holds one browser, and `rakazo-browser` launches whichever is installed. A locally built
image is not on a registry, so start the stack with `bash install-images.sh --pull-never` after
pulling the other images once. Brave's Rewards, Wallet, Leo, VPN and News are disabled by managed
policy.

`BROWSER=chrome` installs Google Chrome stable from Google's apt repository and checks Google's
signing key by fingerprint. Google publishes Chrome for amd64 only, so the build fails on other
platforms; build those with the default. Chrome identifies itself as Google Chrome and ships the
Widevine module that some sites expect, where Debian's Chromium reports a plain Chromium brand and
has no Widevine. Some payment and sign-in risk checks may count that profile against the device.

Browser identity is only one input to bot-check challenges; the host's IP reputation usually
matters more.

## `none`

Runs API/web without provisioning bot computers.

## Computer run time limits

A run starts its computer only when it first uses a computer tool. With idle sleep on,
a computer suspends after `SANDBOX_IDLE_MS` idle. Docker computers are capped only when
`COMPUTER_MAX_ACTIVE_UNBILLED_MS` is set (off by default; minimum 60000), unless a run is
executing on it, a user is in control of its screen, or a coding agent CLI (Codex, Claude Code,
OpenCode) wrote its session within the last `SANDBOX_IDLE_MS`, so an abandoned background
command cannot keep one running for days. Like every cap, it needs idle sleep on:
`SANDBOX_IDLE_MS=0` turns it off too. This-Mac computers are never capped. The next use resumes
it. Asking for takeover restarts the idle timer, and the run also holds the computer for 30 minutes
after asking, so the user can answer the push on the same open page.

### Computer run time records

Each stretch a computer runs at its provider is a row in `computer_runs`, attributed to the
computer's owner and space. A run starts when the computer becomes ready (boot time is not
counted) and ends when it stops. `endReason` says how: `stopped`, `idle`, `active_limit`,
`replaced` (update, recovery, or reset), `gone` (the provider had already stopped or lost
the sandbox), `deleted`, or `reconciled` (the end was never seen; the worker found the
computer no longer running). For `gone` and `reconciled`, `endedAt` is when Rakazo
noticed, so the true end may be earlier. The worker also opens the run of a running
computer whose start was not recorded. An open run whose computer still reads as running
is a computer that may be left on. Deleting a user or space keeps their runs with
`userId` and `spaceId` cleared. This-Mac computers are not recorded.

The table has row-level security, so query it as the database owner. Timestamps are UTC.
Run hours per user over the last 7 days, counting runs still open up to now:

```sql
WITH now_utc AS (SELECT now() AT TIME ZONE 'UTC' AS at)
SELECT r."userId", u.email,
       round(sum(extract(epoch FROM
         coalesce(r."endedAt", n.at) - greatest(r."startedAt", n.at - interval '7 days')
       )) / 3600, 1) AS hours
FROM computer_runs r
CROSS JOIN now_utc n
LEFT JOIN "user" u ON u.id = r."userId"
WHERE coalesce(r."endedAt", n.at) > n.at - interval '7 days'
GROUP BY r."userId", u.email
ORDER BY hours DESC;
```

Runs open longer than 6 hours:

```sql
SELECT r."computerId", r."userId", r."spaceId", r.kind, r."startedAt",
       round(extract(epoch FROM (now() AT TIME ZONE 'UTC') - r."startedAt") / 3600, 1) AS hours_open
FROM computer_runs r
WHERE r."endedAt" IS NULL
  AND r."startedAt" < (now() AT TIME ZONE 'UTC') - interval '6 hours'
ORDER BY r."startedAt";
```

### Linux background-work inspection

The fallback background-work probe and cancellation commands require Bash,
Python 3.7 or newer, and a readable/searchable `/proc` root. Both supplied images
install `python3` explicitly in `infra/sandboxes/computer/Dockerfile` and
`infra/sandboxes/desktop/Dockerfile`. Custom images must provide this
capability. The scanner itself never installs Python.

The scanner reads marker file descriptors regardless of the holder's UID,
including duplicated, inherited, and deleted-but-open markers. Individual
entries that disappear or deny access are skipped because their links cannot
be observed. A failed root traversal, unexpected filesystem error, or missing
Python capability makes inspection unknown. Such failures do not authorize marker
cleanup or cancellation signals from partial scanner output. Cancellation
rechecks each selected PID's marker descriptors before signaling it.

## Verify a provider change

After changing provider (from the published-images drop directory that holds
`docker-compose.images.yml` and `.env`):

```bash
docker compose --env-file .env -f docker-compose.images.yml up -d
curl -fsS http://127.0.0.1:3100/internal/health
```

Confirm `sandbox` equals the intended provider. Open a bot's computer to verify provisioning and
desktop access.
