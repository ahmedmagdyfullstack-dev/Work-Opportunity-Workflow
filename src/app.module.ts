import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { validateEnv } from "./config/env.schema";
import { DashboardModule } from "./dashboard/dashboard.module";
import { DatabaseModule } from "./database/database.module";
import { IngestionModule } from "./ingestion/ingestion.module";
import { JobsModule } from "./jobs/jobs.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { OpportunitiesModule } from "./opportunities/opportunities.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    JobsModule,
    OpportunitiesModule,
    NotificationsModule,
    IngestionModule,
    DashboardModule
  ]
})
export class AppModule {}
