import { describe, expect, it } from "vitest";
import { RuleClassifierService } from "../src/ai/rule-classifier.service";

describe("RuleClassifierService", () => {
  const service = new RuleClassifierService();

  it("scores a strong remote senior backend post as high priority", () => {
    const result = service.classify({
      source: "linkedin_public_search",
      signalType: "linkedin_public_job_post",
      title: "We're hiring a Senior Backend Engineer",
      snippet:
        "Worldwide remote B2B contractor Node.js TypeScript NestJS PostgreSQL startup role with AI Agents and RAG",
      url: "https://linkedin.com/posts/example"
    });
    expect(result.importanceScore).toBeGreaterThanOrEqual(80);
    expect(result.priority).toBe("high");
    expect(result.shouldNotifyNow).toBe(true);
    expect(result.matchedSkills).toContain("Node.js");
    expect(result.workEligibility).toBe("eligible");
  });

  it("penalizes junior and wrong-stack roles", () => {
    const result = service.classify({
      source: "linkedin_public_search",
      signalType: "linkedin_public_job_post",
      title: "Junior Flutter-only developer onsite-only",
      snippet: "Intern role",
      url: "https://linkedin.com/posts/example-2"
    });
    expect(result.importanceScore).toBeLessThan(60);
    expect(result.shouldNotifyNow).toBe(false);
  });

  it("forces LinkedIn recruiter messages to immediate attention", () => {
    const result = service.classify({
      source: "linkedin_email",
      signalType: "linkedin_message_notification",
      subject: "New message",
      bodyText: "A recruiter sent you a message"
    });
    expect(result.category).toBe("linkedin_message");
    expect(result.importanceScore).toBeGreaterThanOrEqual(80);
    expect(result.requiresAction).toBe(true);
  });

  it("suppresses posts that only say remote", () => {
    const result = service.classify({
      source: "linkedin_public_search",
      signalType: "linkedin_public_job_post",
      title: "Senior Backend Engineer",
      snippet: "Remote Node.js TypeScript NestJS PostgreSQL role",
      url: "https://linkedin.com/posts/remote-only"
    });
    expect(result.workEligibility).toBe("uncertain");
    expect(result.priority).toBe("ignore");
    expect(result.shouldNotifyNow).toBe(false);
    expect(result.shouldIncludeInDigest).toBe(false);
  });

  it("rejects country-restricted remote posts", () => {
    const result = service.classify({
      source: "linkedin_public_search",
      signalType: "linkedin_public_job_post",
      title: "Senior Backend Engineer",
      snippet:
        "Remote US only. Must have US work authorization. Node.js TypeScript.",
      url: "https://linkedin.com/posts/us-only"
    });
    expect(result.workEligibility).toBe("ineligible");
    expect(result.priority).toBe("ignore");
  });

  it("accepts hybrid roles explicitly located in Egypt", () => {
    const result = service.classify({
      source: "linkedin_public_search",
      signalType: "linkedin_public_job_post",
      title: "Senior Full Stack Engineer",
      snippet: "Hybrid in Cairo, Egypt. Node.js TypeScript React PostgreSQL.",
      url: "https://linkedin.com/posts/cairo-hybrid"
    });
    expect(result.workEligibility).toBe("eligible");
    expect(result.isRelevantToAhmed).toBe(true);
  });
});
