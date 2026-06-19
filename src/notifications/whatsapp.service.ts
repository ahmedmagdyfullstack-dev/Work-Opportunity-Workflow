import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(private readonly config: ConfigService) {}

  async send(message: string): Promise<Record<string, unknown>> {
    if (this.config.get("WHATSAPP_PROVIDER", "log") === "log") {
      this.logger.log(`WhatsApp(log): ${message}`);
      return { provider: "log", accepted: true };
    }

    const phoneNumberId = this.config.getOrThrow<string>(
      "WHATSAPP_PHONE_NUMBER_ID"
    );
    const token = this.config.getOrThrow<string>("WHATSAPP_ACCESS_TOKEN");
    const to = this.config.getOrThrow<string>("WHATSAPP_TO_NUMBER");
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
              type: "text",
              text: { preview_url: true, body: message }
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
