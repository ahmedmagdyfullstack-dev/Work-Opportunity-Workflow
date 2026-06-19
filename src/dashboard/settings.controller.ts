import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EntityManager } from "@mikro-orm/core";
import { ProfileFact } from "../database/entities";
import { CvProfileService } from "../ai/cv-profile.service";
import { QueryBuilderService } from "../search/query-builder.service";

@Controller("settings")
export class SettingsController {
  constructor(
    private readonly em: EntityManager,
    private readonly profile: CvProfileService,
    private readonly queries: QueryBuilderService,
    private readonly config: ConfigService
  ) {}

  @Get()
  async get(@Headers("x-api-key") key?: string) {
    this.authorize(key);
    return {
      profileFacts: await this.profile.getFacts(),
      searchQueries: this.queries.build(),
      thresholds: {
        whatsapp: this.config.get("NOTIFICATION_THRESHOLD", 80),
        digest: this.config.get("DIGEST_THRESHOLD", 60)
      },
      schedules: {
        search: this.config.get("SEARCH_CRON"),
        digest: this.config.get("DIGEST_CRON")
      }
    };
  }

  @Post("profile-facts")
  async add(
    @Body() body: { category: string; key: string; value: string; weight?: number },
    @Headers("x-api-key") apiKey?: string
  ) {
    this.authorize(apiKey);
    const fact = this.em.create(ProfileFact, { ...body, weight: body.weight ?? 1 });
    this.em.persist(fact);
    await this.em.flush();
    return fact;
  }

  private authorize(key?: string): void {
    if (key !== this.config.get("ADMIN_API_KEY", "change-me")) {
      throw new UnauthorizedException();
    }
  }
}
