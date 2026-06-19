# Opportunity Intelligence

A read-only job-search assistant that unifies:

- public LinkedIn job posts discovered through a search API;
- LinkedIn message notification emails;
- important recruiter, interview, assessment, offer, rejection, and calendar emails.

It explicitly excludes LinkedIn job-alert emails, direct LinkedIn scraping, browser/session automation, auto-replies, and auto-applying.

## What works

The complete pipeline is implemented:

1. Search, Gmail, Outlook, and manual-import ingestion.
2. Normalization into `OpportunitySignal`.
3. Multi-level deduplication and company/role entity matching.
4. Ahmed-specific scoring with deterministic rules, OpenAI, or OpenRouter.
5. Suggested LinkedIn DMs and email replies.
6. Immediate WhatsApp decisions, daily digest decisions, and delivery logging.
7. Opportunity, signal, reply, notification, feedback, settings, and dashboard APIs.
8. SQLite local mode and PostgreSQL production mode.
9. Inline local queue mode and BullMQ/Redis production queue publishing.
10. Audit logs, retries, webhook validation, admin API-key protection, health checks, and backup script.

## Start locally

```bash
cp .env.example .env
npm install
npm run start:dev
```

Local mode needs no external services. It uses SQLite, deterministic rules, logged WhatsApp messages, manual search, and inline queues.

Open:

- Dashboard: `http://localhost:3000/dashboard`
- Health: `http://localhost:3000/health`

Authenticated API calls require:

```text
x-api-key: change-me
```

Change `ADMIN_API_KEY` before deploying.

## Verify

```bash
npm run verify
```

The suite covers:

- LinkedIn job-alert exclusion;
- LinkedIn message detection;
- important-email parsing;
- CV scoring and penalties;
- deduplication;
- full HTTP ingestion → classification → reply → WhatsApp-log delivery;
- authenticated reads.

## Production services

Start PostgreSQL and Redis:

```bash
docker compose up -d
```

Then set:

```env
NODE_ENV=production
DATABASE_TYPE=postgres
DATABASE_URL=postgresql://opportunity:opportunity@localhost:5432/opportunity
QUEUE_MODE=bullmq
REDIS_URL=redis://localhost:6379
```

Run migrations before starting. Keep secrets in the deployment platform’s secret manager, not in `.env` committed to source.

## AI

The default `AI_MODE=rules` is deterministic and testable.

For the free OpenRouter model:

```env
AI_MODE=openrouter
OPENROUTER_API_KEY=...
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=openai/gpt-oss-20b:free
```

OpenRouter uses Chat Completions in JSON mode with the full schema embedded in
the system prompt, reasoning set to low, and strict local Zod validation. This
works across free-model providers that do not consistently enforce native JSON
Schema. If the provider is unavailable, rate-limited, or returns invalid
output, classification safely falls back to deterministic rules.

Direct OpenAI is still supported:

```env
AI_MODE=openai
OPENAI_API_KEY=...
AI_MODEL=gpt-5.5
```

Never commit either API key. Add it as a secret in Railway.

## Public search

Choose one provider:

```env
SEARCH_PROVIDER=brave
BRAVE_SEARCH_API_KEY=...
```

Also supported: `serpapi`, `google_custom_search`, and `manual`. The app only stores indexed title, snippet, and URL. It never fetches the LinkedIn post body.

Trigger a run:

```bash
curl -X POST http://localhost:3000/admin/search/run \
  -H 'x-api-key: change-me'
```

## Gmail push

Configure Gmail OAuth and a Pub/Sub topic, then:

```bash
curl -X POST http://localhost:3000/admin/gmail/watch \
  -H 'x-api-key: change-me'
```

Point the Pub/Sub push subscription to `POST /webhooks/gmail`. Set `GMAIL_WEBHOOK_TOKEN` and send it as `x-webhook-token` from your gateway/subscription. Renew Gmail `watch` at least every seven days.

## Outlook

Point Microsoft Graph change notifications to `/webhooks/outlook` and set a strong `OUTLOOK_CLIENT_STATE`. Validation tokens are echoed by the GET endpoint. Notifications are rejected when `clientState` does not match.

## WhatsApp

Local mode logs messages. For Meta Cloud API:

```env
WHATSAPP_PROVIDER=meta
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_TO_NUMBER=...
WHATSAPP_VERIFY_TOKEN=...
```

The adapter retries transient failures three times and persists provider responses. For business-initiated production messages outside the service window, configure approved templates in Meta and adapt the payload to the approved alert/digest template names.

## Key endpoints

```text
POST /signals/manual-import
GET  /opportunities
GET  /opportunities/:id
GET  /signals
GET  /signals/:id
GET  /notifications
GET  /replies
GET  /digest/today
POST /digest/send
POST /signals/:id/feedback
POST /signals/:id/regenerate-reply
POST /signals/:id/mark-done
POST /webhooks/gmail
GET|POST /webhooks/outlook
GET|POST /webhooks/whatsapp-status
GET  /settings
POST /settings/profile-facts
```

## Backup and operations

Run `scripts/backup.sh` daily with `DATABASE_URL` set. It keeps 14 days by default. Monitor `/health`, failed notification rows, BullMQ failed jobs, webhook error rates, Gmail watch expiration, and the age of the Gmail history checkpoint.
