import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ParsedEmail } from "../domain/types";

type GraphMessage = {
  id: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  body?: { content?: string; contentType?: string };
  receivedDateTime?: string;
  webLink?: string;
  from?: { emailAddress?: { address?: string; name?: string } };
};

@Injectable()
export class OutlookService {
  constructor(private readonly config: ConfigService) {}

  async fetchResource(resource: string): Promise<ParsedEmail> {
    const token = await this.accessToken();
    const response = await fetch(`https://graph.microsoft.com/v1.0/${resource}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error(`Microsoft Graph failed: ${response.status}`);
    const message = (await response.json()) as GraphMessage;
    return {
      externalId: message.id,
      threadId: message.conversationId,
      from: message.from?.emailAddress?.address ?? "",
      fromName: message.from?.emailAddress?.name,
      subject: message.subject ?? "",
      bodyText: this.cleanBody(message.body?.content ?? ""),
      snippet: message.bodyPreview,
      receivedAt: new Date(message.receivedDateTime ?? Date.now()),
      url: message.webLink,
      rawPayload: { id: message.id, conversationId: message.conversationId }
    };
  }

  private async accessToken(): Promise<string> {
    const tenant = this.config.getOrThrow<string>("OUTLOOK_TENANT_ID");
    const body = new URLSearchParams({
      client_id: this.config.getOrThrow("OUTLOOK_CLIENT_ID"),
      client_secret: this.config.getOrThrow("OUTLOOK_CLIENT_SECRET"),
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials"
    });
    const response = await fetch(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
      }
    );
    const data = (await response.json()) as { access_token?: string };
    if (!response.ok || !data.access_token) {
      throw new Error(`Microsoft OAuth failed: ${response.status}`);
    }
    return data.access_token;
  }

  private cleanBody(value: string): string {
    return value
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
}
