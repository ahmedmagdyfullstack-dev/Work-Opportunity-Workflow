import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { SearchResult } from "../domain/types";
import type {
  PublicSearchProvider,
  SearchOptions
} from "./public-search-provider.interface";

@Injectable()
export class ManualSearchProvider implements PublicSearchProvider {
  readonly name = "manual";
  async search(): Promise<SearchResult[]> {
    return [];
  }
}

@Injectable()
export class BraveSearchProvider implements PublicSearchProvider {
  readonly name = "brave";
  constructor(private readonly config: ConfigService) {}

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const key = this.config.getOrThrow<string>("BRAVE_SEARCH_API_KEY");
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(options.limit ?? 10));
    if (options.freshness) {
      url.searchParams.set("freshness", options.freshness);
    }
    url.searchParams.set("extra_snippets", "true");
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache",
        "X-Subscription-Token": key
      }
    });
    if (!response.ok) throw new Error(`Brave search failed: ${response.status}`);
    const data = (await response.json()) as {
      web?: {
        results?: Array<{
          title: string;
          description: string;
          url: string;
          age?: string;
          page_age?: string;
          extra_snippets?: string[];
        }>;
      };
    };
    return (data.web?.results ?? []).map((item) => ({
      title: item.title,
      snippet: [item.description, ...(item.extra_snippets ?? [])]
        .filter(Boolean)
        .join(" "),
      url: item.url,
      discoveredAt: new Date(),
      publishedAt: parseResultDate(item.page_age ?? item.age),
      provider: this.name
    }));
  }
}

@Injectable()
export class SerpApiProvider implements PublicSearchProvider {
  readonly name = "serpapi";
  constructor(private readonly config: ConfigService) {}

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("q", query);
    url.searchParams.set("api_key", this.config.getOrThrow("SERPAPI_API_KEY"));
    url.searchParams.set("num", String(options.limit ?? 10));
    if (options.maxAgeDays) {
      url.searchParams.set("tbs", `qdr:d${options.maxAgeDays}`);
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`SerpApi failed: ${response.status}`);
    const data = (await response.json()) as {
      organic_results?: Array<{
        title: string;
        snippet: string;
        link: string;
        date?: string;
      }>;
    };
    return (data.organic_results ?? []).map((item) => ({
      title: item.title,
      snippet: item.snippet,
      url: item.link,
      discoveredAt: new Date(),
      publishedAt: parseResultDate(item.date),
      provider: this.name
    }));
  }
}

@Injectable()
export class GoogleCustomSearchProvider implements PublicSearchProvider {
  readonly name = "google_custom_search";
  constructor(private readonly config: ConfigService) {}

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const url = new URL("https://www.googleapis.com/customsearch/v1");
    url.searchParams.set("q", query);
    url.searchParams.set(
      "key",
      this.config.getOrThrow("GOOGLE_CUSTOM_SEARCH_API_KEY")
    );
    url.searchParams.set(
      "cx",
      this.config.getOrThrow("GOOGLE_CUSTOM_SEARCH_ENGINE_ID")
    );
    url.searchParams.set("num", String(Math.min(options.limit ?? 10, 10)));
    if (options.maxAgeDays) {
      url.searchParams.set("dateRestrict", `d${options.maxAgeDays}`);
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Google search failed: ${response.status}`);
    const data = (await response.json()) as {
      items?: Array<{
        title: string;
        snippet: string;
        link: string;
        displayLink?: string;
      }>;
    };
    return (data.items ?? []).map((item) => ({
      title: item.title,
      snippet: item.snippet,
      url: item.link,
      displayUrl: item.displayLink,
      discoveredAt: new Date(),
      provider: this.name
    }));
  }
}

export function isLinkedInPostUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      /(^|\.)linkedin\.com$/i.test(url.hostname) &&
      (url.pathname.startsWith("/posts/") ||
        url.pathname.startsWith("/feed/update/"))
    );
  } catch {
    return false;
  }
}

export function parseResultDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;

  const relative = value
    .toLowerCase()
    .match(
      /(\d+)\s*(minute|minutes|hour|hours|day|days|week|weeks|month|months)\s+ago/
    );
  if (!relative) return undefined;
  const amount = Number(relative[1]);
  const unit = relative[2];
  const milliseconds =
    unit.startsWith("minute")
      ? amount * 60_000
      : unit.startsWith("hour")
        ? amount * 3_600_000
        : unit.startsWith("day")
          ? amount * 86_400_000
          : unit.startsWith("week")
            ? amount * 7 * 86_400_000
            : amount * 31 * 86_400_000;
  return new Date(Date.now() - milliseconds);
}

export function isLikelyOpenPost(result: SearchResult): boolean {
  const text = `${result.title} ${result.snippet}`.toLowerCase();
  return ![
    /\bposition (?:has been |is )?filled\b/,
    /\brole (?:has been |is )?filled\b/,
    /\bapplications? (?:are )?closed\b/,
    /\bno longer accepting applications?\b/,
    /\bhiring (?:is )?closed\b/,
    /\bvacancy (?:has been |is )?closed\b/,
    /\bjob (?:has been |is )?closed\b/,
    /\bopportunity (?:has been |is )?closed\b/
  ].some((pattern) => pattern.test(text));
}
