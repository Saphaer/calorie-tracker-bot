# Nourish — Telegram calorie tracker

Nourish is a premium Telegram Mini App for calories, macros, water, weight, habits, and streaks. It is designed for a small private group and deploys as a Vite static app plus a Hono Cloudflare Worker backed by D1.

## Structure

- `apps/web` — React + Vite Mini App UI
- `apps/worker` — Hono REST API, Telegram bot webhook, and D1 access
- `apps/worker/migrations` — D1 SQL migrations
- `packages/shared` — shared types and nutrition helpers

## Local development

```bash
pnpm install
pnpm dev
```

The web app works with a local demo user when the Worker is not configured. To run the Worker locally in another terminal:

```bash
pnpm dev:worker
```

Copy `apps/worker/.dev.vars.example` to `.dev.vars` and set `TELEGRAM_BOT_TOKEN` if you want to exercise the bot webhook.

## Cloudflare deployment

1. Create a D1 database and put its id in `apps/worker/wrangler.toml`.
2. Run `pnpm --filter worker db:migrate:local` locally, or `wrangler d1 migrations apply nourish-db --remote` for production.
3. Set Worker secrets: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, and optionally `APP_ORIGIN`.
4. Deploy the API with `pnpm --filter worker deploy`.
5. Set `VITE_API_URL` in `apps/web/.env.production` to the Worker URL and deploy the web app to any static host.
6. Configure the bot menu button to open the Mini App URL:

```bash
curl -X POST "https://api.telegram.org/bot<token>/setChatMenuButton" \
  -H "content-type: application/json" \
  -d '{"menu_button":{"type":"web_app","text":"Open Nourish","web_app":{"url":"https://your-app.example"}}}'
```

## API authentication

The Worker accepts Telegram `initData` in the `X-Telegram-Init-Data` header and validates it with the bot token. For local development, `X-Demo-User-Id` is accepted and maps to a seeded demo profile.

## Included product surfaces

Onboarding, dashboard, food search/custom food, meal logging, water quick-add, weight history, daily/weekly/monthly statistics, missions, achievements, profile, settings, theme switching, export/delete data, and Telegram bot commands (`/start`, `/open`, `/help`).
