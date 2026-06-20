import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LinkedInPostScraperService } from "../src/ingestion/linkedin-post-scraper.service";

describe("LinkedInPostScraperService", () => {
  afterEach(() => vi.restoreAllMocks());

  function service(enabled = true) {
    return new LinkedInPostScraperService(
      new ConfigService({
        LINKEDIN_SCRAPE_ENABLED: enabled,
        LINKEDIN_SCRAPE_TIMEOUT_MS: 5_000,
        LINKEDIN_SCRAPE_MAX_BYTES: 500_000
      })
    );
  }

  it("extracts full public post JSON-LD", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        `<html><script type="application/ld+json">${JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SocialMediaPosting",
          headline: "Senior Backend Engineer",
          articleBody:
            "Worldwide B2B contractor role using Node.js and PostgreSQL.",
          datePublished: "2026-06-19T10:30:00Z",
          author: { "@type": "Person", name: "Jane Recruiter" }
        })}</script></html>`,
        {
          status: 200,
          headers: { "Content-Type": "text/html" }
        }
      )
    );

    await expect(
      service().enrich("https://www.linkedin.com/posts/example")
    ).resolves.toMatchObject({
      status: "scraped",
      title: "Senior Backend Engineer",
      bodyText:
        "Worldwide B2B contractor role using Node.js and PostgreSQL.",
      authorName: "Jane Recruiter",
      publishedAt: new Date("2026-06-19T10:30:00Z")
    });
  });

  it("falls back when LinkedIn redirects to signup", async () => {
    const response = new Response("<html>Join LinkedIn</html>", {
      status: 200,
      headers: { "Content-Type": "text/html" }
    });
    Object.defineProperty(response, "url", {
      value: "https://www.linkedin.com/signup/cold-join"
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

    const result = await service().enrich(
      "https://www.linkedin.com/posts/blocked"
    );
    expect(result.status).toBe("blocked");
    expect(result.bodyText).toBeNull();
  });

  it("does not fetch when disabled", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(
      service(false).enrich("https://www.linkedin.com/posts/example")
    ).resolves.toMatchObject({ status: "disabled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caches a post by URL", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        `<script type="application/ld+json">${JSON.stringify({
          "@type": "SocialMediaPosting",
          articleBody: "Remote worldwide B2B contractor"
        })}</script>`,
        { status: 200 }
      )
    );
    const scraper = service();

    await scraper.enrich("https://www.linkedin.com/posts/example");
    await scraper.enrich("https://www.linkedin.com/posts/example");

    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
