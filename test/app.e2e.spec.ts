import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

const database = join(process.cwd(), "work", "e2e.sqlite");
process.env.NODE_ENV = "test";
process.env.DATABASE_TYPE = "sqlite";
process.env.SQLITE_PATH = database;
process.env.ADMIN_API_KEY = "test-key";
process.env.AI_MODE = "rules";
process.env.WHATSAPP_PROVIDER = "log";
process.env.SEARCH_PROVIDER = "manual";
process.env.QUEUE_MODE = "inline";

describe("Opportunity Intelligence API", () => {
  let app: INestApplication;

  beforeAll(async () => {
    if (existsSync(database)) rmSync(database);
    const { AppModule } = await import("../src/app.module");
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (existsSync(database)) rmSync(database);
  });

  it("is healthy", async () => {
    await request(app.getHttpServer())
      .get("/health")
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe("ok"));
  });

  it("imports, classifies, suggests a reply, and logs a notification", async () => {
    const payload = {
      source: "manual_import",
      signalType: "linkedin_public_job_post",
      title: "We're hiring a Senior Backend Engineer",
      snippet:
        "Remote B2B Node.js TypeScript NestJS PostgreSQL product startup role",
      url: "https://www.linkedin.com/posts/acme-role"
    };
    const response = await request(app.getHttpServer())
      .post("/signals/manual-import")
      .set("x-api-key", "test-key")
      .send(payload)
      .expect(201);
    expect(response.body.duplicate).toBe(false);
    expect(response.body.classification.priority).toBe("high");
    expect(response.body.reply.suggestedReply).toContain("Node.js");
    expect(response.body.decision).toBe("notify_now");
    expect(response.body.notification.status).toBe("sent");

    const duplicate = await request(app.getHttpServer())
      .post("/signals/manual-import")
      .set("x-api-key", "test-key")
      .send(payload)
      .expect(201);
    expect(duplicate.body.duplicate).toBe(true);
  });

  it("ignores LinkedIn job alert emails at ingestion", async () => {
    const response = await request(app.getHttpServer())
      .post("/webhooks/gmail")
      .send({
        email: {
          externalId: "job-alert-1",
          from: "jobs-noreply@linkedin.com",
          subject: "Your LinkedIn job alert",
          bodyText: "Jobs you may be interested in",
          receivedAt: "2026-06-20T10:00:00.000Z"
        }
      })
      .expect(201);
    expect(response.body.results[0].ignored).toBe(true);
  });

  it("requires authentication for admin data", async () => {
    await request(app.getHttpServer()).get("/signals").expect(401);
    const response = await request(app.getHttpServer())
      .get("/signals")
      .set("x-api-key", "test-key")
      .expect(200);
    expect(response.body).toHaveLength(1);
  });
});
