# SEO Materials Telegram Bot

Cloudflare Worker MVP for saving SEO materials from Telegram, storing them in Supabase, generating English SEO article drafts with OpenAI, and publishing approved drafts to GitHub repos that deploy through Cloudflare Pages.

## Features

- `POST /telegram/webhook` receives Telegram updates.
- `GET /health` returns service health.
- `/tools + content` saves material for `toolsfinderhub`.
- `/abrasive + content` saves material for `abrasive`.
- `/generate` processes `status=new` sources and creates drafts.
- `/list` shows the latest 5 drafts.
- `/publish article_id` commits a draft to GitHub.
- `/status` shows source and article counts.
- Plain text and links are organized into `public.knowledge_items`.
- `/idea`, `/tool`, `/amazon`, `/seo`, and `/automation` force a knowledge item type.
- `/admin/knowledge` provides a password-protected knowledge base UI.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create Supabase schema:

Run `supabase/init.sql` in the Supabase SQL editor. It creates:

- `public.seo_sources`
- `public.seo_articles`
- `public.knowledge_items`
- Storage bucket `seo-materials`
- RLS enabled on both tables
- Public read policy for uploaded files
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
wrangler secret put AI_API_KEY
wrangler secret put GITHUB_TOKEN
wrangler secret put ADMIN_PASSWORD
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
/tools Best AI SEO tool list idea: https://example.com
/abrasive CBN grinding wheel buyer guide notes...
/generate
/list
/publish 00000000-0000-0000-0000-000000000000
/status
```

For images, send the photo with a caption beginning with `/tools` or `/abrasive`.

Knowledge base examples:

```text
Today I configured Cloudflare Email Routing for a small SEO site...
/idea A comparison post about AI coding agents for non-technical founders
/tool https://cursor.com/changelog
/amazon Lessons from testing product image angles for conversion
/seo Internal linking checklist for ToolsFinderHub software pages
/automation Telegram to Supabase content capture workflow
```

Open the admin UI:

```text
https://YOUR_WORKER.YOUR_ACCOUNT.workers.dev/admin/knowledge
```

Use username `admin` and the `ADMIN_PASSWORD` secret as the password.

## GitHub Permissions

Create a GitHub fine-grained token with access to:

- `ToolsFinderHub`
- `abrasive-wheel-website`

Required permission:

- Contents: Read and write

Publishing writes:

```text
content/blog/{slug}.md
```

Commit message:

```text
Add SEO article: {title}
```

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
- Draft generation does not publish automatically.
- Video messages are stored as records only; content processing is intentionally deferred for MVP.
