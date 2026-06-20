import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export type ScrapedLinkedInPost = {
  title: string | null;
  bodyText: string | null;
  authorName: string | null;
  publishedAt: Date | null;
  status: "scraped" | "blocked" | "unavailable" | "disabled";
};

type JsonLdNode = {
  "@type"?: string | string[];
  headline?: string;
  articleBody?: string;
  datePublished?: string;
  author?: { name?: string } | Array<{ name?: string }>;
  "@graph"?: JsonLdNode[];
};

@Injectable()
export class LinkedInPostScraperService {
  private readonly logger = new Logger(LinkedInPostScraperService.name);
  private readonly cache = new Map<
    string,
    { expiresAt: number; value: Promise<ScrapedLinkedInPost> }
  >();

  constructor(private readonly config: ConfigService) {}

  enrich(url: string): Promise<ScrapedLinkedInPost> {
    if (!this.config.get<boolean>("LINKEDIN_SCRAPE_ENABLED", false)) {
      return Promise.resolve(this.empty("disabled"));
    }
    const cached = this.cache.get(url);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const value = this.fetchPublicPost(url).catch((error) => {
      this.logger.warn(
        `LinkedIn public post fetch failed: ${this.errorMessage(error)}`
      );
      return this.empty("unavailable");
    });
    this.cache.set(url, {
      expiresAt: Date.now() + 30 * 60_000,
      value
    });
    return value;
  }

  private async fetchPublicPost(url: string): Promise<ScrapedLinkedInPost> {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "User-Agent":
          "Mozilla/5.0 (compatible; OpportunityIntelligence/1.0; +https://work-opportunity-workflow-production.up.railway.app)"
      },
      signal: AbortSignal.timeout(
        this.config.get<number>("LINKEDIN_SCRAPE_TIMEOUT_MS", 10_000)
      )
    });
    if (!response.ok) return this.empty("unavailable");
    const finalUrl = new URL(response.url || url);
    if (!/(^|\.)linkedin\.com$/i.test(finalUrl.hostname)) {
      return this.empty("blocked");
    }
    if (
      finalUrl.pathname.includes("/signup") ||
      finalUrl.pathname.includes("/login")
    ) {
      return this.empty("blocked");
    }

    const html = await this.readLimited(
      response,
      this.config.get<number>("LINKEDIN_SCRAPE_MAX_BYTES", 1_500_000)
    );
    const post = this.socialPostFromJsonLd(html);
    if (post?.articleBody) {
      return {
        title: this.clean(post.headline) || null,
        bodyText: this.clean(post.articleBody) || null,
        authorName: this.authorName(post.author),
        publishedAt: this.date(post.datePublished),
        status: "scraped"
      };
    }

    const description = this.metaContent(html, "og:description");
    if (
      !description ||
      /manage your professional identity|join linkedin|sign up/i.test(
        description
      )
    ) {
      return this.empty("blocked");
    }
    return {
      title: this.metaContent(html, "og:title"),
      bodyText: description,
      authorName: null,
      publishedAt: null,
      status: "scraped"
    };
  }

  private socialPostFromJsonLd(html: string): JsonLdNode | null {
    const scripts = html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    );
    for (const match of scripts) {
      try {
        const parsed = JSON.parse(match[1]) as JsonLdNode | JsonLdNode[];
        const found = this.findSocialPost(
          Array.isArray(parsed) ? parsed : [parsed]
        );
        if (found) return found;
      } catch {
        continue;
      }
    }
    return null;
  }

  private findSocialPost(nodes: JsonLdNode[]): JsonLdNode | null {
    for (const node of nodes) {
      const types = Array.isArray(node["@type"])
        ? node["@type"]
        : [node["@type"]];
      if (types.includes("SocialMediaPosting")) return node;
      const nested = node["@graph"]
        ? this.findSocialPost(node["@graph"])
        : null;
      if (nested) return nested;
    }
    return null;
  }

  private metaContent(html: string, name: string): string | null {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(
        `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`,
        "i"
      ),
      new RegExp(
        `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
        "i"
      )
    ];
    for (const pattern of patterns) {
      const value = html.match(pattern)?.[1];
      if (value) return this.clean(this.decodeHtml(value)) || null;
    }
    return null;
  }

  private authorName(author: JsonLdNode["author"]): string | null {
    if (!author) return null;
    const item = Array.isArray(author) ? author[0] : author;
    return this.clean(item?.name) || null;
  }

  private date(value?: string): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private clean(value?: string): string {
    return (value ?? "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, 15_000);
  }

  private decodeHtml(value: string): string {
    return value
      .replaceAll("&quot;", '"')
      .replaceAll("&#39;", "'")
      .replaceAll("&amp;", "&")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replace(/&#(\d+);/g, (_, code: string) =>
        String.fromCodePoint(Number(code))
      );
  }

  private async readLimited(
    response: Response,
    maxBytes: number
  ): Promise<string> {
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > maxBytes) throw new Error(`response exceeds ${maxBytes} bytes`);
    if (!response.body) return "";

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`response exceeds ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(bytes);
  }

  private empty(
    status: ScrapedLinkedInPost["status"]
  ): ScrapedLinkedInPost {
    return {
      title: null,
      bodyText: null,
      authorName: null,
      publishedAt: null,
      status
    };
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
