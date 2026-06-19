import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { DatabaseModule } from "../database/database.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { DeduplicationService } from "./deduplication.service";
import { OpportunitiesController } from "./opportunities.controller";
import { OpportunityService } from "./opportunity.service";

@Module({
  imports: [DatabaseModule, AiModule, NotificationsModule],
  controllers: [OpportunitiesController],
  providers: [OpportunityService, DeduplicationService],
  exports: [OpportunityService]
})
export class OpportunitiesModule {}
