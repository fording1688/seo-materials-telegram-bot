# SEO Materials Telegram Bot

Cloudflare Worker MVP for saving SEO article materials from Telegram into Supabase.

## Features

- `POST /telegram/webhook` receives Telegram updates.
- `GET /health` returns service health.
- Plain text and links without a command are saved as ToolsFinderHub article material in `public.seo_sources`.
- `/tools + content` explicitly saves material for `toolsfinderhub`.
- `/abrasive + content` saves material for `abrasive`.
- `/status` shows source counts from `public.seo_sources`.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create Supabase schema:

Run `supabase/init.sql` in the Supabase SQL editor. It creates:

- `public.seo_sources`
- Storage bucket `seo-materials`
- RLS enabled on `seo_sources`
- Service role storage policy

3. Configure local dev variables:

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` with your real values.

4. Configure Cloudflare secrets:

```bash
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_ALLOWED_CHAT_ID
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

5. Edit `wrangler.toml` vars:

- `GITHUB_OWNER`
- `TOOLS_GITHUB_REPO`
- `ABRASIVE_GITHUB_REPO`
- `GITHUB_BRANCH`
- `AI_API_BASE_URL`
- `AI_MODEL`

For OpenRouter, use:

```text
AI_API_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=openai/gpt-4.1-mini
```

6. Deploy:

```bash
npm run deploy
```

7. Set Telegram webhook:

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://YOUR_WORKER.YOUR_ACCOUNT.workers.dev/telegram/webhook"}'
```

## Telegram Usage

```text
Write an article about how small SEO sites can collect daily ideas from Telegram and turn them into publishable drafts.
/tools Best AI SEO tool list idea: https://example.com
/abrasive CBN grinding wheel buyer guide notes...
/status
```

For images, send the photo with a caption beginning with `/tools` or `/abrasive`.

## Development

```bash
npm run dev
npm run typecheck
```

Generate Cloudflare Worker env types when needed:

```bash
npm run cf-typegen
```

## Notes

- Secrets are read only from Cloudflare Worker secrets or local `.dev.vars`.
- Only `TELEGRAM_ALLOWED_CHAT_ID` can use the bot.
- This version only stores materials in `seo_sources`.
- Video messages are stored as records only; content processing is intentionally deferred for MVP.
