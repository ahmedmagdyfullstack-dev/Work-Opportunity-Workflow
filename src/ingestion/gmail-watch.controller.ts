import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ParsedEmail } from "../domain/types";
import { EmailParserService } from "../email/email-parser.service";
import { GmailService } from "../email/gmail.service";
import { OutlookService } from "../email/outlook.service";
import { OpportunityService } from "../opportunities/opportunity.service";

@Controller()
export class GmailWatchController {
  constructor(
    private readonly config: ConfigService,
    private readonly gmail: GmailService,
    private readonly outlook: OutlookService,
    private readonly parser: EmailParserService,
    private readonly opportunities: OpportunityService
  ) {}

  @Post("webhooks/gmail")
  async gmailWebhook(
    @Body()
    body: {
      message?: { data?: string; messageId?: string };
      email?: ParsedEmail;
    },
    @Headers("x-webhook-token") token?: string
  ) {
    this.validateGmailToken(token);
    if (body.email) return this.processEmails([body.email]);
    const decoded = body.message?.data
      ? JSON.parse(Buffer.from(body.message.data, "base64").toString("utf8"))
      : {};
    const emails = await this.gmail.fetchChangedMessages(decoded.historyId);
    return this.processEmails(emails);
  }

  @Post("admin/gmail/watch")
  async watch(@Headers("x-api-key") key?: string) {
    this.validateAdmin(key);
    return this.gmail.startWatch();
  }

  @Get("webhooks/outlook")
  validateOutlook(@Query("validationToken") validationToken?: string): string {
    return validationToken ?? "ok";
  }

  @Post("webhooks/outlook")
  async outlookWebhook(
    @Body()
    body: {
      value?: Array<{
        clientState?: string;
        email?: ParsedEmail;
        resource?: string;
      }>;
    }
  ) {
    const expected = this.config.get<string>("OUTLOOK_CLIENT_STATE");
    const notifications = body.value ?? [];
    if (
      expected &&
      notifications.some((item) => item.clientState !== expected)
    ) {
      throw new UnauthorizedException("Invalid Outlook clientState");
    }
    const emails: ParsedEmail[] = [];
    for (const item of notifications) {
      if (item.email) emails.push(item.email);
      else if (item.resource) emails.push(await this.outlook.fetchResource(item.resource));
    }
    return this.processEmails(emails);
  }

  private async processEmails(emails: ParsedEmail[]) {
    const results = [];
    for (const email of emails) {
      const parsed = this.parser.parse(email);
      if (parsed.ignore) {
        results.push({ ignored: true, reason: parsed.reason });
      } else {
        results.push(await this.opportunities.ingest(parsed.signal));
      }
    }
    return { processed: results.length, results };
  }

  private validateGmailToken(token?: string): void {
    const expected = this.config.get<string>("GMAIL_WEBHOOK_TOKEN");
    if (expected && token !== expected) throw new UnauthorizedException();
  }

  private validateAdmin(key?: string): void {
    if (key !== this.config.get("ADMIN_API_KEY", "change-me")) {
      throw new UnauthorizedException();
    }
  }
}
