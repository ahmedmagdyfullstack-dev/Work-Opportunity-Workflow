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
import {
  isLikelyOpenPost,
  isLinkedInPostUrl
} from "../search/providers";
import { OpportunityService } from "../opportunities/opportunity.service";
import { QueueService } from "../jobs/queue.service";
import { SearchCacheService } from "../search/search-cache.service";
import { ConfigService } from "@nestjs/config";

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
    private readonly orm: MikroORM,
    private readonly config: ConfigService
  ) {}

  onModuleInit(): void {
    this.queue.register<{ query: string }>("search-discovery", ({ query }) =>
      this.processQuery(query)
    );
  }

  @Cron(process.env.SEARCH_CRON || "0 2,8,14,20 * * *")
  async scheduled(): Promise<void> {
    await this.run();
  }

  async run(): Promise<{
    queries: number;
    found: number;
    open: number;
    stale: number;
    closed: number;
    ingested: number;
    duplicates: number;
    notified: number;
    digest: number;
    stored: number;
    notificationFailed: number;
  }> {
    const queries = this.queries.build();
    let found = 0;
    let open = 0;
    let stale = 0;
    let closed = 0;
    let ingested = 0;
    let duplicates = 0;
    let notified = 0;
    let digest = 0;
    let stored = 0;
    let notificationFailed = 0;
    for (const query of queries) {
      try {
        const result = (await this.queue.enqueue("search-discovery", {
          query,
          provider: this.provider.name
        })) as
          | {
              found?: number;
              open?: number;
              stale?: number;
              closed?: number;
              ingested?: number;
              duplicates?: number;
              notified?: number;
              digest?: number;
              stored?: number;
              notificationFailed?: number;
            }
          | undefined;
        found += result?.found ?? 0;
        open += result?.open ?? 0;
        stale += result?.stale ?? 0;
        closed += result?.closed ?? 0;
        ingested += result?.ingested ?? 0;
        duplicates += result?.duplicates ?? 0;
        notified += result?.notified ?? 0;
        digest += result?.digest ?? 0;
        stored += result?.stored ?? 0;
        notificationFailed += result?.notificationFailed ?? 0;
      } catch (error) {
        this.logger.error(`Search query failed: ${query}`, error);
      }
    }
    return {
      queries: queries.length,
      found,
      open,
      stale,
      closed,
      ingested,
      duplicates,
      notified,
      digest,
      stored,
      notificationFailed
    };
  }

  @CreateRequestContext()
  private async processQuery(
    query: string
  ): Promise<{
    found: number;
    open: number;
    stale: number;
    closed: number;
    ingested: number;
    duplicates: number;
    notified: number;
    digest: number;
    stored: number;
    notificationFailed: number;
  }> {
    const maxAgeDays = this.config.get<number>(
      "LINKEDIN_POST_MAX_AGE_DAYS",
      4
    );
    const freshness = this.freshnessRange(maxAgeDays);
    const cacheKey = `${query}|${freshness}`;
    let results = this.cache.get(cacheKey);
    if (!results) {
      results = await this.provider.search(query, {
        limit: 10,
        freshness,
        maxAgeDays
      });
      this.cache.set(cacheKey, results);
    }
    const cutoff = Date.now() - maxAgeDays * 86_400_000;
    const linkedInResults = results.filter((result) =>
      isLinkedInPostUrl(result.url)
    );
    const stale = linkedInResults.filter(
      (result) => result.publishedAt && result.publishedAt.getTime() < cutoff
    ).length;
    const recentResults = linkedInResults.filter(
      (result) => !result.publishedAt || result.publishedAt.getTime() >= cutoff
    );
    const closed = recentResults.filter((result) => !isLikelyOpenPost(result)).length;
    const openResults = recentResults
      .filter(isLikelyOpenPost)
      .sort(
        (left, right) =>
          (right.publishedAt?.getTime() ?? right.discoveredAt.getTime()) -
          (left.publishedAt?.getTime() ?? left.discoveredAt.getTime())
      );
    let ingested = 0;
    let duplicates = 0;
    let notified = 0;
    let digest = 0;
    let stored = 0;
    let notificationFailed = 0;
    for (const item of openResults) {
      const result = await this.opportunities.ingest({
        source: "linkedin_public_search",
        signalType: "linkedin_public_job_post",
        title: item.title,
        snippet: item.snippet,
        url: item.url,
        authorName: item.authorName,
        rawPayload: {
          provider: item.provider,
          query,
          publishedAt: item.publishedAt?.toISOString() ?? null,
          maxAgeDays
        },
        receivedAt: item.publishedAt ?? item.discoveredAt
      });
      if (result.duplicate) {
        duplicates += 1;
        continue;
      }
      ingested += 1;
      if (result.decision === "notify_now") {
        if (result.notification?.status === "failed") notificationFailed += 1;
        else notified += 1;
      } else if (result.decision === "daily_digest") {
        digest += 1;
      } else {
        stored += 1;
      }
    }
    return {
      found: linkedInResults.length,
      open: openResults.length,
      stale,
      closed,
      ingested,
      duplicates,
      notified,
      digest,
      stored,
      notificationFailed
    };
  }

  private freshnessRange(maxAgeDays: number): string {
    const end = new Date();
    const start = new Date(end.getTime() - maxAgeDays * 86_400_000);
    const format = (date: Date) => date.toISOString().slice(0, 10);
    return `${format(start)}to${format(end)}`;
  }
}
