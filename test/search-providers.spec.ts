import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BraveSearchProvider,
  isLikelyOpenPost,
  parseResultDate,
  SerperSearchProvider
} from "../src/search/providers";
import { QueryBuilderService } from "../src/search/query-builder.service";

describe("LinkedIn search freshness", () => {
  afterEach(() => vi.restoreAllMocks());

  it("passes the exact freshness range to Brave and preserves post dates", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          web: {
            results: [
              {
                title: "Senior Backend Engineer",
                description: "Remote Node.js role",
                url: "https://www.linkedin.com/posts/example",
                page_age: "2026-06-19T09:00:00Z"
              }
            ]
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const provider = new BraveSearchProvider(
      new ConfigService({ BRAVE_SEARCH_API_KEY: "test-key" })
    );

    const results = await provider.search("query", {
      limit: 10,
      freshness: "2026-06-16to2026-06-20",
      maxAgeDays: 4
    });

    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestUrl.searchParams.get("freshness")).toBe(
      "2026-06-16to2026-06-20"
    );
    expect(requestUrl.searchParams.get("extra_snippets")).toBe("true");
    expect(results[0].publishedAt?.toISOString()).toBe(
      "2026-06-19T09:00:00.000Z"
    );
  });

  it("parses relative result ages", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T12:00:00Z"));
    expect(parseResultDate("2 days ago")?.toISOString()).toBe(
      "2026-06-18T12:00:00.000Z"
    );
    vi.useRealTimers();
  });

  it("filters posts whose indexed text says hiring is closed", () => {
    expect(
      isLikelyOpenPost({
        title: "Senior Backend Engineer",
        snippet: "Applications are closed for this role.",
        url: "https://www.linkedin.com/posts/closed",
        discoveredAt: new Date(),
        provider: "brave"
      })
    ).toBe(false);
    expect(
      isLikelyOpenPost({
        title: "Senior Backend Engineer",
        snippet: "We are hiring now for a remote role.",
        url: "https://www.linkedin.com/posts/open",
        discoveredAt: new Date(),
        provider: "brave"
      })
    ).toBe(true);
  });

  it("uses Serper Google search with a four-day date restriction", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          organic: [
            {
              title: "Hiring Senior Backend Engineer",
              link: "https://www.linkedin.com/posts/serper-example",
              snippet: "Remote Node.js role",
              date: "1 day ago"
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const provider = new SerperSearchProvider(
      new ConfigService({ SERPER_API_KEY: "serper-test-key" })
    );

    const results = await provider.search("linkedin role", {
      limit: 10,
      maxAgeDays: 4
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://google.serper.dev/search");
    expect(options?.headers).toMatchObject({
      "X-API-KEY": "serper-test-key"
    });
    expect(JSON.parse(String(options?.body))).toMatchObject({
      q: "linkedin role",
      num: 10,
      tbs: "qdr:d4,sbd:1"
    });
    expect(results[0]).toMatchObject({
      provider: "serper",
      url: "https://www.linkedin.com/posts/serper-example"
    });
  });

  it("uses eight consolidated queries per run", () => {
    expect(new QueryBuilderService().build()).toHaveLength(8);
  });
});
