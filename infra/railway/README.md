# Deploy and Host Rakazo on Railway

## About Hosting Rakazo

The template runs Rakazo and PostgreSQL on Railway. Railway has no Docker host, so bot computers are off (`SANDBOX_PROVIDER=none`). Railway usage and any connected model provider are billed separately.

## Deploy

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template/rakazo-template)

1. Deploy the template. Enter your email in `OWNER_EMAIL`.
2. Wait for Rakazo to become healthy. Open its generated HTTPS domain.
3. Sign in with your email and the generated `OWNER_PASSWORD` from the Rakazo service's Variables tab. Change the password in account settings.
4. Connect your model account in Rakazo and send Chief a message.

## Why Deploy Rakazo on Railway

- The initial ordinary account is created before the public web server starts. Public registration is closed on every start; this template is intended for a personal deployment.
- Every install gets separate random database, authentication, encryption, screen and initial owner secrets. Keep the encryption key and database password stable across redeploys.
- PostgreSQL has no public endpoint. Only the web port is published; the API binds to loopback.
- App processes run as the unprivileged `node` user. The entrypoint briefly uses root to set the mounted volume's owner, then drops privileges.
- The API, worker and web share one service and `/data` volume. PostgreSQL has its own volume. The template requests daily backups for both volumes; Railway requires a Pro workspace to use managed backups. Run one application replica; do not enable service sleeping.
- Any process failure restarts the application service. Database migrations finish before startup.

## Updates and backups

To update, connect the service to the desired source branch and deploy its latest commit. The private account bootstrap keeps existing accounts and passwords. Changing `OWNER_PASSWORD` later does not reset an account password.

Back up PostgreSQL, `/data`, and `ENCRYPTION_KEY` before upgrades. Railway volume persistence is not a backup. Keep backups private and test restoring them together. Do not delete volumes to fix a failed deploy.

## Common Use Cases

A personal AI assistant with scheduled tasks. Choose your model through Rakazo's connection settings.

## Dependencies for Rakazo

The template cannot create a model account for you. That is the only outside account setup step.

### Deployment Dependencies

The template supplies Node.js 24, PostgreSQL 16, the application image and two persistent volumes. Railway supplies HTTPS. No local software installation is needed.
