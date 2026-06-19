import { describe, expect, it } from "vitest";
import { DeduplicationService } from "../src/opportunities/deduplication.service";

describe("DeduplicationService", () => {
  const service = new DeduplicationService();

  it("normalizes URL tracking fragments", () => {
    const first = service.contentHash({
      source: "search",
      signalType: "linkedin_public_job_post",
      title: "Role",
      snippet: "Details",
      url: "https://www.linkedin.com/posts/abc?tracking=1"
    });
    const second = service.contentHash({
      source: "search",
      signalType: "linkedin_public_job_post",
      title: "role",
      snippet: " details ",
      url: "https://linkedin.com/posts/abc"
    });
    expect(first).toBe(second);
  });
});
