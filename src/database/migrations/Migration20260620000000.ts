import { Migration } from "@mikro-orm/migrations";

export class Migration20260620000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql('create extension if not exists "pgcrypto";');
    this.addSql(`
      create table if not exists "opportunities" (
        "id" uuid primary key default gen_random_uuid(),
        "company_name" varchar(255) null,
        "role_title" varchar(255) null,
        "normalized_role" varchar(255) null,
        "location" varchar(255) null,
        "source_first_seen" varchar(255) null,
        "status" varchar(255) not null default 'new',
        "priority" varchar(255) null,
        "match_score" integer null,
        "linkedin_url" varchar(255) null,
        "first_seen_at" timestamptz not null default now(),
        "last_seen_at" timestamptz not null default now(),
        "notes" text null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        unique ("company_name", "normalized_role")
      );
    `);
    this.addSql(`
      create table if not exists "opportunity_signals" (
        "id" uuid primary key default gen_random_uuid(),
        "opportunity_id" uuid null references "opportunities" ("id") on delete set null,
        "source" varchar(255) not null,
        "signal_type" varchar(255) not null,
        "sender_name" varchar(255) null,
        "sender_email" varchar(255) null,
        "author_name" varchar(255) null,
        "title" varchar(255) null,
        "subject" varchar(255) null,
        "snippet" text null,
        "body_text" text null,
        "url" text null,
        "raw_payload" jsonb null,
        "external_id" varchar(255) null,
        "thread_id" varchar(255) null,
        "content_hash" varchar(255) not null,
        "received_at" timestamptz not null,
        "created_at" timestamptz not null default now()
      );
    `);
    this.addSql('create index if not exists "signal_external_id_idx" on "opportunity_signals" ("external_id");');
    this.addSql('create index if not exists "signal_thread_id_idx" on "opportunity_signals" ("thread_id");');
    this.addSql('create index if not exists "signal_content_hash_idx" on "opportunity_signals" ("content_hash");');
    this.addSql(`
      create table if not exists "classifications" (
        "id" uuid primary key default gen_random_uuid(),
        "signal_id" uuid not null references "opportunity_signals" ("id") on delete cascade,
        "is_job_related" boolean not null,
        "is_relevant_to_ahmed" boolean not null,
        "importance_score" integer not null,
        "priority" varchar(255) not null,
        "category" varchar(255) not null,
        "company_name" varchar(255) null,
        "role_title" varchar(255) null,
        "location" varchar(255) null,
        "requires_action" boolean not null,
        "deadline" timestamptz null,
        "summary" text not null,
        "reason" text not null,
        "matched_skills" jsonb not null default '[]',
        "missing_info" jsonb not null default '[]',
        "suggested_action" text not null,
        "suggested_reply_needed" boolean not null,
        "confidence" integer not null,
        "should_notify_now" boolean not null,
        "should_include_in_digest" boolean not null,
        "created_at" timestamptz not null default now()
      );
    `);
    this.addSql(`
      create table if not exists "reply_suggestions" (
        "id" uuid primary key default gen_random_uuid(),
        "signal_id" uuid not null references "opportunity_signals" ("id") on delete cascade,
        "opportunity_id" uuid null references "opportunities" ("id") on delete set null,
        "suggestion_type" varchar(255) not null,
        "suggested_reply" text not null,
        "suggested_action" text not null,
        "tone" varchar(255) not null default 'professional_short_confident',
        "cv_points_used" jsonb not null default '[]',
        "risk_notes" jsonb not null default '[]',
        "status" varchar(255) not null default 'draft',
        "created_at" timestamptz not null default now()
      );
    `);
    this.addSql(`
      create table if not exists "notifications" (
        "id" uuid primary key default gen_random_uuid(),
        "signal_id" uuid null references "opportunity_signals" ("id") on delete set null,
        "channel" varchar(255) not null,
        "recipient" varchar(255) not null,
        "message_text" text not null,
        "status" varchar(255) not null,
        "provider_response" jsonb null,
        "sent_at" timestamptz null,
        "created_at" timestamptz not null default now()
      );
    `);
    this.addSql(`
      create table if not exists "profile_facts" (
        "id" uuid primary key default gen_random_uuid(),
        "category" varchar(255) not null,
        "key" varchar(255) not null,
        "value" varchar(255) not null,
        "weight" integer not null default 1,
        "created_at" timestamptz not null default now(),
        unique ("category", "key", "value")
      );
    `);
    this.addSql(`
      create table if not exists "feedback" (
        "id" uuid primary key default gen_random_uuid(),
        "signal_id" uuid not null references "opportunity_signals" ("id") on delete cascade,
        "feedback" varchar(255) not null,
        "notes" text null,
        "created_at" timestamptz not null default now()
      );
    `);
    this.addSql(`
      create table if not exists "checkpoints" (
        "key" varchar(255) primary key,
        "value" text not null,
        "updated_at" timestamptz not null default now()
      );
    `);
    this.addSql(`
      create table if not exists "audit_logs" (
        "id" uuid primary key default gen_random_uuid(),
        "action" varchar(255) not null,
        "entity_type" varchar(255) null,
        "entity_id" varchar(255) null,
        "metadata" jsonb null,
        "created_at" timestamptz not null default now()
      );
    `);
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "audit_logs" cascade;');
    this.addSql('drop table if exists "checkpoints" cascade;');
    this.addSql('drop table if exists "feedback" cascade;');
    this.addSql('drop table if exists "profile_facts" cascade;');
    this.addSql('drop table if exists "notifications" cascade;');
    this.addSql('drop table if exists "reply_suggestions" cascade;');
    this.addSql('drop table if exists "classifications" cascade;');
    this.addSql('drop table if exists "opportunity_signals" cascade;');
    this.addSql('drop table if exists "opportunities" cascade;');
  }
}
