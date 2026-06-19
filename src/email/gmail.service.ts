import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EntityManager } from "@mikro-orm/core";
import { google, gmail_v1 } from "googleapis";
import { Checkpoint } from "../database/entities";
import type { ParsedEmail } from "../domain/types";

@Injectable()
export class GmailService {
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
    const history = await gmail.users.history.list({
      userId: "me",
      startHistoryId,
      historyTypes: ["messageAdded"]
    });
    const ids = new Set(
      (history.data.history ?? [])
        .flatMap((item) => item.messagesAdded ?? [])
        .map((item) => item.message?.id)
        .filter((id): id is string => Boolean(id))
    );
    const emails: ParsedEmail[] = [];
    for (const id of ids) {
      const result = await gmail.users.messages.get({
        userId: "me",
        id,
        format: "full"
      });
      emails.push(this.parseMessage(result.data));
    }
    const next = history.data.historyId ?? historyId;
    if (next) await this.setCheckpoint("gmail.historyId", next);
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
}
