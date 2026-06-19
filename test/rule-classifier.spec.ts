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
        "Remote B2B Node.js TypeScript NestJS PostgreSQL startup role with AI Agents and RAG",
      url: "https://linkedin.com/posts/example"
    });
    expect(result.importanceScore).toBeGreaterThanOrEqual(80);
    expect(result.priority).toBe("high");
    expect(result.shouldNotifyNow).toBe(true);
    expect(result.matchedSkills).toContain("Node.js");
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
});
