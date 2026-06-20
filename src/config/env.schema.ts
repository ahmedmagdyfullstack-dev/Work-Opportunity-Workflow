import { z } from "zod";

const optionalUrl = z.string().url().optional().or(z.literal(""));

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  ADMIN_API_KEY: z.string().default("change-me"),
  DATABASE_TYPE: z.enum(["sqlite", "postgres"]).default("sqlite"),
  DATABASE_URL: optionalUrl,
  SQLITE_PATH: z.string().default("./data/opportunity.sqlite"),
  REDIS_URL: optionalUrl,
  QUEUE_MODE: z.enum(["inline", "bullmq"]).default("inline"),
  OPENAI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_BASE_URL: z
    .string()
    .url()
    .default("https://openrouter.ai/api/v1"),
  AI_MODEL: z.string().default("openai/gpt-oss-20b:free"),
  AI_MODE: z.enum(["rules", "openai", "openrouter"]).default("rules"),
  SEARCH_PROVIDER: z
    .enum(["manual", "brave", "serpapi", "google_custom_search"])
    .default("manual"),
  BRAVE_SEARCH_API_KEY: z.string().optional(),
  SERPAPI_API_KEY: z.string().optional(),
  GOOGLE_CUSTOM_SEARCH_API_KEY: z.string().optional(),
  GOOGLE_CUSTOM_SEARCH_ENGINE_ID: z.string().optional(),
  GMAIL_CLIENT_ID: z.string().optional(),
  GMAIL_CLIENT_SECRET: z.string().optional(),
  GMAIL_REFRESH_TOKEN: z.string().optional(),
  GMAIL_PUBSUB_TOPIC: z.string().optional(),
  GMAIL_WEBHOOK_TOKEN: z.string().optional(),
  OUTLOOK_CLIENT_ID: z.string().optional(),
  OUTLOOK_CLIENT_SECRET: z.string().optional(),
  OUTLOOK_TENANT_ID: z.string().optional(),
  OUTLOOK_CLIENT_STATE: z.string().optional(),
  WHATSAPP_PROVIDER: z.enum(["log", "meta"]).default("log"),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_TO_NUMBER: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_ALERT_TEMPLATE: z.string().default("job_search_alert"),
  WHATSAPP_DIGEST_TEMPLATE: z.string().default("job_search_digest"),
  NOTIFICATION_THRESHOLD: z.coerce.number().int().min(0).max(100).default(80),
  DIGEST_THRESHOLD: z.coerce.number().int().min(0).max(100).default(60),
  LINKEDIN_POST_MAX_AGE_DAYS: z.coerce.number().int().min(1).max(30).default(4),
  DIGEST_CRON: z.string().default("0 18 * * *"),
  SEARCH_CRON: z.string().default("0 * * * *")
});

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): AppEnv {
  return envSchema.parse(config);
}
