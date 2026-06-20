import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(private readonly config: ConfigService) {}

  messageId(response?: Record<string, unknown>): string | undefined {
    const messages = response?.messages;
    if (!Array.isArray(messages)) return undefined;
    const first = messages[0];
    if (!first || typeof first !== "object") return undefined;
    const id = (first as Record<string, unknown>).id;
    return typeof id === "string" ? id : undefined;
  }

  sendAlert(message: string): Promise<Record<string, unknown>> {
    return this.sendTemplate(
      message,
      this.config.get("WHATSAPP_ALERT_TEMPLATE", "job_search_alert")
    );
  }

  sendDigest(message: string): Promise<Record<string, unknown>> {
    return this.sendTemplate(
      message,
      this.config.get("WHATSAPP_DIGEST_TEMPLATE", "job_search_digest")
    );
  }

  async sendTemplate(
    message: string,
    templateName: string
  ): Promise<Record<string, unknown>> {
    if (this.config.get("WHATSAPP_PROVIDER", "log") === "log") {
      this.logger.log(`WhatsApp(log): ${message}`);
      return { provider: "log", accepted: true };
    }

    const phoneNumberId = this.config.getOrThrow<string>(
      "WHATSAPP_PHONE_NUMBER_ID"
    );
    const token = this.config.getOrThrow<string>("WHATSAPP_ACCESS_TOKEN");
    const to = this.config.getOrThrow<string>("WHATSAPP_TO_NUMBER");
    const language = this.config.get("WHATSAPP_TEMPLATE_LANGUAGE", "en_US");
    const template =
      templateName === "hello_world"
        ? {
            name: templateName,
            language: { code: language }
          }
        : {
            name: templateName,
            language: { code: language },
            components: [
              {
                type: "body",
                parameters: [
                  {
                    type: "text",
                    text: message.slice(0, 950)
                  }
                ]
              }
            ]
          };
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetch(
          `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to,
              type: "template",
              template
            })
          }
        );
        const payload = (await response.json()) as Record<string, unknown>;
        if (!response.ok) {
          throw new Error(`Meta WhatsApp error ${response.status}: ${JSON.stringify(payload)}`);
        }
        return payload;
      } catch (error) {
        lastError = error as Error;
        if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
      }
    }
    throw lastError ?? new Error("WhatsApp delivery failed");
  }
}
