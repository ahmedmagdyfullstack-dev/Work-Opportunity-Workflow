import { Migration } from "@mikro-orm/migrations";

export class Migration20260620000001 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      'alter table "notifications" add column if not exists "provider_message_id" varchar(255) null;'
    );
    this.addSql(
      'alter table "notifications" add column if not exists "delivery_error" jsonb null;'
    );
    this.addSql(
      'create index if not exists "notification_provider_message_id_idx" on "notifications" ("provider_message_id");'
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      'drop index if exists "notification_provider_message_id_idx";'
    );
    this.addSql(
      'alter table "notifications" drop column if exists "delivery_error";'
    );
    this.addSql(
      'alter table "notifications" drop column if exists "provider_message_id";'
    );
  }
}
