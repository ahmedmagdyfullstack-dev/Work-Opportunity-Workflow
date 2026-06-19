import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit
} from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { CreateRequestContext, MikroORM } from "@mikro-orm/core";
import type { PublicSearchProvider } from "../search/public-search-provider.interface";
import { PUBLIC_SEARCH_PROVIDER } from "../search/public-search-provider.interface";
import { QueryBuilderService } from "../search/query-builder.service";
import { isLinkedInPostUrl } from "../search/providers";
import { OpportunityService } from "../opportunities/opportunity.service";
import { QueueService } from "../jobs/queue.service";
import { SearchCacheService } from "../search/search-cache.service";

@Injectable()
export class PublicPostSearchWorker implements OnModuleInit {
  private readonly logger = new Logger(PublicPostSearchWorker.name);

  constructor(
    @Inject(PUBLIC_SEARCH_PROVIDER)
    private readonly provider: PublicSearchProvider,
    private readonly queries: QueryBuilderService,
    private readonly opportunities: OpportunityService,
    private readonly queue: QueueService,
    private readonly cache: SearchCacheService,
    private readonly orm: MikroORM
  ) {}

  onModuleInit(): void {
    this.queue.register<{ query: string }>("search-discovery", ({ query }) =>
      this.processQuery(query)
    );
  }

  @Cron(process.env.SEARCH_CRON || "0 * * * *")
  async scheduled(): Promise<void> {
    await this.run();
  }

  async run(): Promise<{ queries: number; found: number; ingested: number }> {
    const queries = this.queries.build();
    let found = 0;
    let ingested = 0;
    for (const query of queries) {
      try {
        const result = (await this.queue.enqueue("search-discovery", {
          query,
          provider: this.provider.name
        })) as { found?: number; ingested?: number } | undefined;
        found += result?.found ?? 0;
        ingested += result?.ingested ?? 0;
      } catch (error) {
        this.logger.error(`Search query failed: ${query}`, error);
      }
    }
    return { queries: queries.length, found, ingested };
  }

  @CreateRequestContext()
  private async processQuery(
    query: string
  ): Promise<{ found: number; ingested: number }> {
    let results = this.cache.get(query);
    if (!results) {
      results = await this.provider.search(query, { limit: 10 });
      this.cache.set(query, results);
    }
    let found = 0;
    let ingested = 0;
    for (const item of results.filter((result) =>
      isLinkedInPostUrl(result.url)
    )) {
      found += 1;
      const result = await this.opportunities.ingest({
        source: "linkedin_public_search",
        signalType: "linkedin_public_job_post",
        title: item.title,
        snippet: item.snippet,
        url: item.url,
        authorName: item.authorName,
        rawPayload: { provider: item.provider, query },
        receivedAt: item.discoveredAt
      });
      if (!result.duplicate) ingested += 1;
    }
    return { found, ingested };
  }
}
