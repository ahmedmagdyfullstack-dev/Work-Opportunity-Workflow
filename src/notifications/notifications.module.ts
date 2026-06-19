import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { DecisionEngineService } from "./decision-engine.service";
import { NotificationFormatterService } from "./notification-formatter.service";
import { WhatsAppService } from "./whatsapp.service";
import { DigestController } from "./digest.controller";
import { DigestService } from "./digest.service";
import { WhatsAppController } from "./whatsapp.controller";

@Module({
  imports: [DatabaseModule],
  controllers: [DigestController, WhatsAppController],
  providers: [
    DecisionEngineService,
    NotificationFormatterService,
    WhatsAppService,
    DigestService
  ],
  exports: [
    DecisionEngineService,
    NotificationFormatterService,
    WhatsAppService,
    DigestService
  ]
})
export class NotificationsModule {}
