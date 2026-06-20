import { Module } from "@nestjs/common";
import { EmailParserService } from "../email/email-parser.service";
import { GmailService } from "../email/gmail.service";
import { OutlookService } from "../email/outlook.service";
import { JobsModule } from "../jobs/jobs.module";
import { OpportunitiesModule } from "../opportunities/opportunities.module";
import { SearchModule } from "../search/search.module";
import { GmailWatchController } from "./gmail-watch.controller";
import { IngestionController } from "./ingestion.controller";
import { LinkedInPostScraperService } from "./linkedin-post-scraper.service";
import { PublicPostSearchWorker } from "./public-post-search.worker";

@Module({
  imports: [OpportunitiesModule, SearchModule, JobsModule],
  controllers: [GmailWatchController, IngestionController],
  providers: [
    EmailParserService,
    GmailService,
    OutlookService,
    LinkedInPostScraperService,
    PublicPostSearchWorker
  ],
  exports: [EmailParserService, PublicPostSearchWorker]
})
export class IngestionModule {}
