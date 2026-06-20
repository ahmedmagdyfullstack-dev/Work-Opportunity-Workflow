import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EntityManager } from "@mikro-orm/core";
import { google, gmail_v1 } from "googleapis";
import { Checkpoint } from "../database/entities";
import type { ParsedEmail } from "../domain/types";

@Injectable()
export class GmailService {
  private readonly logger = new Logger(GmailService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly em: EntityManager
  ) {}

  async startWatch(): Promise<gmail_v1.Schema$WatchResponse> {
    const gmail = this.client();
    const result = await gmail.users.watch({
      userId: "me",
      requestBody: {
        topicName: this.config.getOrThrow("GMAIL_PUBSUB_TOPIC"),
        labelIds: ["INBOX"]
      }
    });
    if (result.data.historyId) {
      await this.setCheckpoint("gmail.historyId", result.data.historyId);
    }
    return result.data;
  }

  async fetchChangedMessages(historyId?: string): Promise<ParsedEmail[]> {
    const gmail = this.client();
    const startHistoryId =
      (await this.getCheckpoint("gmail.historyId")) ?? historyId;
    if (!startHistoryId) {
      if (historyId) await this.setCheckpoint("gmail.historyId", historyId);
      return [];
    }
    let historyData: gmail_v1.Schema$ListHistoryResponse;
    try {
      const history = await gmail.users.history.list({
        userId: "me",
        startHistoryId,
        historyTypes: ["messageAdded"]
      });
      historyData = history.data;
    } catch (error) {
      if (this.statusCode(error) === 404 && historyId) {
        this.logger.warn(
          "Gmail history checkpoint expired; advancing to the latest Pub/Sub history ID."
        );
        await this.setCheckpoint("gmail.historyId", historyId);
        return [];
      }
      throw error;
    }
    const ids = new Set(
      (historyData.history ?? [])
        .flatMap((item) => item.messagesAdded ?? [])
        .map((item) => item.message?.id)
        .filter((id): id is string => Boolean(id))
    );
    const emails: ParsedEmail[] = [];
    let missing = 0;
    for (const id of ids) {
      try {
        const result = await gmail.users.messages.get({
          userId: "me",
          id,
          format: "full"
        });
        emails.push(this.parseMessage(result.data));
      } catch (error) {
        if (this.statusCode(error) === 404) {
          missing += 1;
          continue;
        }
        throw error;
      }
    }
    const next = historyData.historyId ?? historyId;
    if (next) await this.setCheckpoint("gmail.historyId", next);
    if (missing > 0) {
      this.logger.warn(
        `Skipped ${missing} Gmail message(s) deleted or unavailable before processing.`
      );
    }
    return emails;
  }

  private client(): gmail_v1.Gmail {
    const oauth = new google.auth.OAuth2(
      this.config.getOrThrow("GMAIL_CLIENT_ID"),
      this.config.getOrThrow("GMAIL_CLIENT_SECRET")
    );
    oauth.setCredentials({
      refresh_token: this.config.getOrThrow("GMAIL_REFRESH_TOKEN")
    });
    return google.gmail({ version: "v1", auth: oauth });
  }

  private parseMessage(message: gmail_v1.Schema$Message): ParsedEmail {
    const headers = new Map(
      (message.payload?.headers ?? []).map((header) => [
        header.name?.toLowerCase() ?? "",
        header.value ?? ""
      ])
    );
    const fromHeader = headers.get("from") ?? "";
    const fromMatch = fromHeader.match(/^(?:"?([^"<]+)"?\s*)?<([^>]+)>$/);
    return {
      externalId: message.id ?? headers.get("message-id") ?? "",
      threadId: message.threadId ?? undefined,
      from: fromMatch?.[2] ?? fromHeader,
      fromName: fromMatch?.[1]?.trim(),
      subject: headers.get("subject") ?? "",
      bodyText: this.extractText(message.payload),
      snippet: message.snippet ?? undefined,
      receivedAt: new Date(Number(message.internalDate ?? Date.now())),
      url: message.id
        ? `https://mail.google.com/mail/u/0/#inbox/${message.id}`
        : undefined,
      rawPayload: { id: message.id, threadId: message.threadId }
    };
  }

  private extractText(part?: gmail_v1.Schema$MessagePart): string {
    if (!part) return "";
    if (part.mimeType === "text/plain" && part.body?.data) {
      return Buffer.from(part.body.data, "base64url").toString("utf8");
    }
    const childText = (part.parts ?? [])
      .map((child) => this.extractText(child))
      .filter(Boolean)
      .join("\n");
    if (childText) return childText;
    if (part.mimeType === "text/html" && part.body?.data) {
      return Buffer.from(part.body.data, "base64url")
        .toString("utf8")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
    return "";
  }

  private async getCheckpoint(key: string): Promise<string | null> {
    return (await this.em.findOne(Checkpoint, { key }))?.value ?? null;
  }

  private async setCheckpoint(key: string, value: string): Promise<void> {
    let checkpoint = await this.em.findOne(Checkpoint, { key });
    if (!checkpoint) {
      checkpoint = this.em.create(Checkpoint, { key, value });
      this.em.persist(checkpoint);
    } else {
      checkpoint.value = value;
    }
    await this.em.flush();
  }

  private statusCode(error: unknown): number | undefined {
    if (!error || typeof error !== "object") return undefined;
    const item = error as {
      code?: unknown;
      status?: unknown;
      response?: { status?: unknown };
    };
    for (const value of [item.code, item.status, item.response?.status]) {
      if (typeof value === "number") return value;
    }
    return undefined;
  }
}
