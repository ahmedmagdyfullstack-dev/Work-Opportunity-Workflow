import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { EntityManager, EnsureRequestContext, MikroORM } from "@mikro-orm/core";
import { Classification, Notification } from "../database/entities";
import { WhatsAppService } from "./whatsapp.service";

@Injectable()
export class DigestService {
  constructor(
    private readonly em: EntityManager,
    private readonly whatsapp: WhatsAppService,
    private readonly orm: MikroORM
  ) {}

  @Cron(process.env.DIGEST_CRON || "0 18 * * *")
  @EnsureRequestContext()
  async scheduled(): Promise<void> {
    await this.sendToday();
  }

  async today(): Promise<Classification[]> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return this.em.find(
      Classification,
      {
        shouldIncludeInDigest: true,
        createdAt: { $gte: start }
      },
      {
        populate: ["signal", "signal.opportunity"],
        orderBy: { importanceScore: "DESC" }
      }
    );
  }

  async sendToday(): Promise<{ sent: boolean; count: number; message: string }> {
    const items = await this.today();
    if (!items.length) return { sent: false, count: 0, message: "No digest items." };
    const message = [
      "📋 Opportunity Digest",
      "",
      ...items.map(
        (item, index) =>
          `${index + 1}. ${item.roleTitle ?? "Opportunity"} — ${item.companyName ?? "Unknown"} (${item.importanceScore}/100)\n${item.summary}\nAction: ${item.suggestedAction}`
      )
    ].join("\n\n");
    const response = await this.whatsapp.send(message);
    this.em.persist(
      this.em.create(Notification, {
        channel: "whatsapp",
        recipient: process.env.WHATSAPP_TO_NUMBER || "configured-recipient",
        messageText: message,
        status: "sent",
        sentAt: new Date(),
        providerResponse: response
      })
    );
    await this.em.flush();
    return { sent: true, count: items.length, message };
  }
}
