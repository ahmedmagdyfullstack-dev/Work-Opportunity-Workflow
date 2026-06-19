import { Body, Controller, Get, Query, Post } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EntityManager } from "@mikro-orm/core";
import { Notification } from "../database/entities";

@Controller("webhooks/whatsapp-status")
export class WhatsAppController {
  constructor(
    private readonly em: EntityManager,
    private readonly config: ConfigService
  ) {}

  @Get()
  verify(
    @Query("hub.mode") mode?: string,
    @Query("hub.verify_token") token?: string,
    @Query("hub.challenge") challenge?: string
  ): string {
    return mode === "subscribe" &&
      token === this.config.get<string>("WHATSAPP_VERIFY_TOKEN")
      ? challenge ?? ""
      : "verification failed";
  }

  @Post()
  async status(@Body() body: Record<string, any>) {
    const statuses =
      body.entry?.flatMap((entry: any) =>
        entry.changes?.flatMap((change: any) => change.value?.statuses ?? [])
      ) ?? [];
    for (const status of statuses) {
      const notification = await this.em.findOne(Notification, {
        providerResponse: { id: status.id }
      } as any);
      if (notification) notification.status = status.status;
    }
    await this.em.flush();
    return { accepted: true, statuses: statuses.length };
  }
}
