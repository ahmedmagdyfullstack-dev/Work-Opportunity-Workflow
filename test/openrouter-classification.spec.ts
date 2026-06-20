import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClassificationService } from "../src/ai/classification.service";
import type { ClassificationResult } from "../src/domain/types";

const aiPayload = {
  is_job_related: true,
  is_relevant_to_ahmed: true,
  category: "linkedin_job_post",
  importance_score: 92,
  priority: "high",
  company_name: "Acme",
  role_title: "Senior Backend Engineer",
  location: "Remote",
  requires_action: true,
  deadline: null,
  should_notify_now: true,
  should_include_in_digest: false,
  summary: "Strong remote backend role.",
  reason: "Matches Node.js, TypeScript, and remote preferences.",
  matched_skills: ["Node.js", "TypeScript"],
  missing_info: [],
  suggested_action: "Message the hiring manager.",
  suggested_reply_needed: true,
  confidence: 94,
  work_eligibility: "eligible",
  eligibility_reason:
    "Worldwide B2B contractor role explicitly accepts Egypt.",
  engagement_type: "B2B contractor"
};

const fallback: ClassificationResult = {
  isJobRelated: true,
  isRelevantToAhmed: false,
  importanceScore: 42,
  priority: "low",
  category: "generic_update",
  companyName: null,
  roleTitle: null,
  location: null,
  requiresAction: false,
  deadline: null,
  summary: "Rules fallback.",
  reason: "Fallback",
  matchedSkills: [],
  missingInfo: [],
  suggestedAction: "Store.",
  suggestedReplyNeeded: false,
  confidence: 80,
  shouldNotifyNow: false,
  shouldIncludeInDigest: false
};

describe("OpenRouter classification", () => {
  afterEach(() => vi.restoreAllMocks());

  function service() {
    const config = new ConfigService({
      AI_MODE: "openrouter",
      OPENROUTER_API_KEY: "test-key",
      OPENROUTER_BASE_URL: "https://openrouter.test/api/v1",
      AI_MODEL: "openai/gpt-oss-20b:free",
      APP_BASE_URL: "https://workflow.example"
    });
    const rules = { classify: vi.fn(() => fallback) };
    const profile = {
      getFacts: vi.fn(async () => []),
      promptSummary: vi.fn(async () => "skill: Node.js")
    };
    return {
      classifier: new ClassificationService(
        config,
        rules as never,
        profile as never
      ),
      rules
    };
  }

  function glmService() {
    const config = new ConfigService({
      AI_MODE: "openrouter",
      OPENROUTER_API_KEY: "test-key",
      OPENROUTER_BASE_URL: "https://openrouter.test/api/v1",
      AI_MODEL: "z-ai/glm-5.2",
      APP_BASE_URL: "https://workflow.example"
    });
    return new ClassificationService(
      config,
      { classify: vi.fn(() => fallback) } as never,
      {
        getFacts: vi.fn(async () => []),
        promptSummary: vi.fn(async () => "skill: Node.js")
      } as never
    );
  }

  it("uses OpenRouter structured output and maps the result", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(aiPayload) } }],
          usage: { cost: 0 }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const { classifier, rules } = service();

    const result = await classifier.classify({
      source: "linkedin_public_search",
      signalType: "linkedin_public_job_post",
      title: "Senior Backend Engineer",
      snippet: "Worldwide remote B2B contractor using Node.js and TypeScript"
    });

    expect(result.importanceScore).toBe(92);
    expect(result.companyName).toBe("Acme");
    expect(rules.classify).not.toHaveBeenCalled();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://openrouter.test/api/v1/chat/completions");
    expect(options?.headers).toMatchObject({
      Authorization: "Bearer test-key",
      "HTTP-Referer": "https://workflow.example"
    });
    const body = JSON.parse(String(options?.body));
    expect(body.model).toBe("openai/gpt-oss-20b:free");
    expect(body.response_format.type).toBe("json_object");
    expect(body.reasoning.effort).toBe("none");
    expect(body.max_tokens).toBe(1_200);
    expect(body.messages[0].content).toContain("is_job_related:boolean");
    expect(body.messages[0].content).toContain("importance_score: integer 0-100");
  });

  it("falls back to rules when OpenRouter fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "rate limited" } }), {
        status: 429,
        headers: { "Content-Type": "application/json" }
      })
    );
    const { classifier, rules } = service();

    const result = await classifier.classify({
      source: "email",
      signalType: "important_email",
      subject: "Opportunity"
    });

    expect(result).toEqual(fallback);
    expect(rules.classify).toHaveBeenCalledOnce();
  });

  it("enforces reply and notification policy after AI classification", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  ...aiPayload,
                  importance_score: 85,
                  suggested_reply_needed: false,
                  should_notify_now: false
                })
              }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const { classifier } = service();

    const result = await classifier.classify({
      source: "linkedin_public_search",
      signalType: "linkedin_public_job_post",
      title: "Senior Backend Engineer",
      snippet: "Worldwide B2B contractor"
    });

    expect(result.suggestedReplyNeeded).toBe(true);
    expect(result.shouldNotifyNow).toBe(true);
    expect(result.priority).toBe("high");
  });

  it("suppresses a LinkedIn post when AI review fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "rate limited" } }), {
        status: 429,
        headers: { "Content-Type": "application/json" }
      })
    );
    const config = new ConfigService({
      AI_MODE: "openrouter",
      OPENROUTER_API_KEY: "test-key",
      OPENROUTER_BASE_URL: "https://openrouter.test/api/v1"
    });
    const eligibleFallback: ClassificationResult = {
      ...fallback,
      category: "linkedin_job_post",
      isRelevantToAhmed: true,
      importanceScore: 92,
      priority: "high",
      shouldNotifyNow: true,
      workEligibility: "eligible"
    };
    const classifier = new ClassificationService(
      config,
      { classify: vi.fn(() => eligibleFallback) } as never,
      {
        getFacts: vi.fn(async () => []),
        promptSummary: vi.fn(async () => "skill: Node.js")
      } as never
    );

    const result = await classifier.classify({
      source: "linkedin_public_search",
      signalType: "linkedin_public_job_post",
      title: "Worldwide B2B Senior Backend Engineer"
    });

    expect(result.workEligibility).toBe("uncertain");
    expect(result.priority).toBe("ignore");
    expect(result.shouldNotifyNow).toBe(false);
    expect(result.reason).toContain("AI eligibility review did not complete");
  });

  it("recovers JSON wrapped in markdown fences", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          provider: "OpenInference",
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: `\`\`\`json\n${JSON.stringify(aiPayload)}\n\`\`\``
              }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const { classifier, rules } = service();

    const result = await classifier.classify({
      source: "linkedin_public_search",
      signalType: "linkedin_public_job_post",
      title: "Backend opportunity",
      snippet: "Worldwide remote B2B contractor"
    });

    expect(result.importanceScore).toBe(92);
    expect(rules.classify).not.toHaveBeenCalled();
  });

  it("uses GLM 5.2 with its supported high reasoning effort", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(aiPayload) } }]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await glmService().classify({
      source: "email",
      signalType: "important_email",
      subject: "Backend opportunity"
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.model).toBe("z-ai/glm-5.2");
    expect(body.reasoning).toEqual({ effort: "high", exclude: true });
  });
});
