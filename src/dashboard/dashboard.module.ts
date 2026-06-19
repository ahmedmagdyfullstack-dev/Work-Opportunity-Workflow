import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { DatabaseModule } from "../database/database.module";
import { SearchModule } from "../search/search.module";
import { DashboardController } from "./dashboard.controller";
import { SettingsController } from "./settings.controller";

@Module({
  imports: [DatabaseModule, AiModule, SearchModule],
  controllers: [DashboardController, SettingsController]
})
export class DashboardModule {}
