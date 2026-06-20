import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type {
  ClassificationResult,
  NormalizedSignalInput
} from "../domain/types";
import { classificationResultSchema } from "./classification.schema";
import { CvProfileService } from "./cv-profile.service";
import { RuleClassifierService } from "./rule-classifier.service";
import { assessWorkEligibility } from "./work-eligibility";

@Injectable()
export class ClassificationService {
  private readonly logger = new Logger(ClassificationService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly rules: RuleClassifierService,
    private readonly profile: CvProfileService
  ) {}

  async classify(input: NormalizedSignalInput): Promise<ClassificationResult> {
    const senderRules = (await this.profile.getFacts()).filter(
      (fact) => fact.category === "sender_rule" && fact.value === input.senderEmail
    );
    const mode = this.config.get<"rules" | "openai" | "openrouter">(
      "AI_MODE",
      "rules"
    );
    if (mode === "rules") {
      return this.applySenderRules(this.rules.classify(input), senderRules);
    }

    try {
      const parsed =
        mode === "openrouter"
          ? await this.classifyWithOpenRouter(input)
          : await this.classifyWithOpenAI(input);
      return this.applySenderRules(
        this.enforceProductPolicy(
          this.applyWorkEligibilityGuard(this.mapResult(parsed), input)
        ),
        senderRules
      );
    } catch (error) {
      this.logger.warn(
        `${mode} classification unavailable; using deterministic rules: ${this.errorMessage(error)}`
      );
      const fallback = this.rules.classify(input);
      return this.applySenderRules(
        this.suppressLinkedInPostWithoutAiReview(fallback),
        senderRules
      );
    }
  }

  private async classifyWithOpenAI(
    input: NormalizedSignalInput
  ): Promise<ReturnType<typeof classificationResultSchema.parse>> {
    const apiKey = this.config.get<string>("OPENAI_API_KEY");
    if (!apiKey) throw new Error("OPENAI_API_KEY is required for AI_MODE=openai");

    const client = new OpenAI({ apiKey });
    const response = await client.responses.parse({
      model: this.config.get("AI_MODEL", "gpt-5.5"),
      reasoning: { effort: "low" },
      text: {
        format: zodTextFormat(
          classificationResultSchema,
          "job_signal_classification"
        ),
        verbosity: "low"
      },
      input: await this.messages(input)
    });
    if (!response.output_parsed) {
      throw new Error("OpenAI returned no parsed classification");
    }
    return classificationResultSchema.parse(response.output_parsed);
  }

  private async classifyWithOpenRouter(
    input: NormalizedSignalInput
  ): Promise<ReturnType<typeof classificationResultSchema.parse>> {
    const apiKey = this.config.get<string>("OPENROUTER_API_KEY");
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is required for AI_MODE=openrouter");
    }

    const response = await fetch(
      `${this.config.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": this.config.get(
            "APP_BASE_URL",
            "https://github.com/ahmedmagdyfullstack-dev/Work-Opportunity-Workflow"
          ),
          "X-OpenRouter-Title": "Work Opportunity Workflow"
        },
        body: JSON.stringify({
          model: this.openRouterModel(),
          messages: await this.openRouterMessages(input),
          response_format: { type: "json_object" },
          reasoning: {
            effort: this.openRouterReasoningEffort(),
            exclude: true
          },
          temperature: 0,
          seed: 1,
          max_tokens: 1_200,
          provider: {
            require_parameters: true,
            allow_fallbacks: true
          }
        }),
        signal: AbortSignal.timeout(
          this.config.get<number>("OPENROUTER_TIMEOUT_MS", 25_000)
        )
      }
    );
    const payload = (await response.json()) as {
      provider?: string;
      choices?: Array<{
        finish_reason?: string | null;
        message?: { content?: string | null };
      }>;
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(
        `OpenRouter returned ${response.status}: ${
          payload.error?.message ?? "Unknown error"
        }`
      );
    }
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(
        `empty response from ${payload.provider ?? "provider"} (finish: ${
          payload.choices?.[0]?.finish_reason ?? "unknown"
        })`
      );
    }
    return classificationResultSchema.parse(this.parseJsonObject(content));
  }

  private async messages(input: NormalizedSignalInput) {
    const profile = await this.profile.promptSummary();
    return [
      {
        role: "system" as const,
        content:
          "Classify job-search signals for Ahmed, an Egyptian based in Cairo. A LinkedIn job post is eligible when it explicitly accepts Egypt/local work; or explicitly combines independent-contractor/B2B/freelance/project-based engagement with worldwide, global, EMEA, MENA, or Egypt-inclusive geography; or explicitly combines remote work with contractor engagement and contains no conflicting country restriction. “Remote” alone is uncertain and must not be treated as eligible. US-only, UK-only, Canada-only, EU/Europe-only, country residency, local work authorization, W2-only, no-C2C, or hybrid/onsite outside Egypt are ineligible. Include normal LinkedIn job posts, LinkedIn message notification emails, and important recruiter/application emails. Exclude LinkedIn job-alert emails, newsletters, marketing, profile views, and connection suggestions. Return the requested structured JSON only."
      },
      {
        role: "user" as const,
        content: `Profile:\n${profile}\n\nSignal:\n${JSON.stringify(input)}`
      }
    ];
  }

  private async openRouterMessages(input: NormalizedSignalInput) {
    const profile = await this.profile.promptSummary();
    return [
      {
        role: "system" as const,
        content:
          `You classify job-search signals for Ahmed. Return exactly one valid JSON object, no markdown and no commentary.
Required keys and types:
is_job_related:boolean
is_relevant_to_ahmed:boolean
category: one of linkedin_job_post, linkedin_message, recruiter_email, interview_invite, assessment_invite, offer, rejection, calendar_update, generic_update, noise
importance_score: integer 0-100
priority: one of high, medium, low, ignore
company_name:string|null
role_title:string|null
location:string|null
requires_action:boolean
deadline:ISO datetime string|null
should_notify_now:boolean
should_include_in_digest:boolean
summary:string
reason:string
matched_skills:string[]
missing_info:string[]
suggested_action:string
suggested_reply_needed:boolean
confidence:integer 0-100
work_eligibility: one of eligible, ineligible, uncertain
eligibility_reason:string
engagement_type:string|null

Ahmed is Egyptian and based in Cairo. For LinkedIn job posts:
- eligible: explicitly accepts Egypt/local work; explicitly offers independent contractor, B2B, freelance, outstaffing, or project-based engagement AND explicitly allows worldwide, global, EMEA, MENA, or Egypt; or explicitly combines remote work with contractor engagement and has no conflicting country restriction.
- uncertain: says only remote; geography may include Egypt but contractor engagement is not explicit; or contractor terms exist but Egypt-compatible geography is not explicit.
- ineligible: US-only, UK-only, Canada-only, EU/Europe-only, country residency, local work authorization, W2-only, no-C2C, or hybrid/onsite outside Egypt.
Never mark “remote” alone as eligible. Uncertain and ineligible posts must not notify or enter the digest.

Include normal LinkedIn job posts, LinkedIn message notifications, and important recruiter/application emails. Exclude LinkedIn job-alert emails, newsletters, marketing, profile views, and connection suggestions. Prefer senior backend/full-stack/product roles matching Node.js, TypeScript, NestJS, React, PostgreSQL, Redis, AWS/GCP, distributed systems, and AI/RAG.`
      },
      {
        role: "user" as const,
        content: `Profile:\n${profile}\n\nSignal:\n${JSON.stringify(input)}`
      }
    ];
  }

  private parseJsonObject(content: string): unknown {
    const trimmed = content
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    try {
      return JSON.parse(trimmed);
    } catch {
      const start = trimmed.indexOf("{");
      const end = trimmed.lastIndexOf("}");
      if (start >= 0 && end > start) {
        return JSON.parse(trimmed.slice(start, end + 1));
      }
      throw new Error("OpenRouter returned malformed JSON");
    }
  }

  private openRouterModel(): string {
    return this.config.get("AI_MODEL", "openai/gpt-oss-20b:free");
  }

  private openRouterReasoningEffort():
    | "none"
    | "low"
    | "medium"
    | "high"
    | "xhigh" {
    const configured = this.config.get<
      "none" | "low" | "medium" | "high" | "xhigh"
    >("AI_REASONING_EFFORT");
    if (configured) return configured;
    return this.openRouterModel() === "z-ai/glm-5.2" ? "high" : "none";
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }

  private mapResult(
    parsed: ReturnType<typeof classificationResultSchema.parse>
  ): ClassificationResult {
    return {
      isJobRelated: parsed.is_job_related,
      isRelevantToAhmed: parsed.is_relevant_to_ahmed,
      importanceScore: parsed.importance_score,
      priority: parsed.priority,
      category: parsed.category,
      companyName: parsed.company_name,
      roleTitle: parsed.role_title,
      location: parsed.location,
      requiresAction: parsed.requires_action,
      deadline: parsed.deadline,
      shouldNotifyNow: parsed.should_notify_now,
      shouldIncludeInDigest: parsed.should_include_in_digest,
      workEligibility: parsed.work_eligibility,
      eligibilityReason: parsed.eligibility_reason,
      engagementType: parsed.engagement_type,
      summary: parsed.summary,
      reason: parsed.reason,
      matchedSkills: parsed.matched_skills,
      missingInfo: parsed.missing_info,
      suggestedAction: parsed.suggested_action,
      suggestedReplyNeeded: parsed.suggested_reply_needed,
      confidence: parsed.confidence
    };
  }

  private applyWorkEligibilityGuard(
    result: ClassificationResult,
    input: NormalizedSignalInput
  ): ClassificationResult {
    if (result.category !== "linkedin_job_post") return result;

    const deterministic = assessWorkEligibility(input);
    const rank = { eligible: 0, uncertain: 1, ineligible: 2 } as const;
    const modelStatus = result.workEligibility ?? "uncertain";
    const finalStatus =
      rank[deterministic.status] >= rank[modelStatus]
        ? deterministic.status
        : modelStatus;
    const reason =
      finalStatus === deterministic.status
        ? deterministic.reason
        : result.eligibilityReason ?? deterministic.reason;

    return {
      ...result,
      workEligibility: finalStatus,
      eligibilityReason: reason,
      engagementType:
        deterministic.engagementType ?? result.engagementType ?? null
    };
  }

  private enforceProductPolicy(
    result: ClassificationResult
  ): ClassificationResult {
    if (result.category === "noise") {
      return {
        ...result,
        priority: "ignore",
        requiresAction: false,
        shouldNotifyNow: false,
        shouldIncludeInDigest: false,
        suggestedReplyNeeded: false
      };
    }

    if (
      result.category === "linkedin_job_post" &&
      result.workEligibility !== "eligible"
    ) {
      const eligibilityLabel =
        result.workEligibility === "ineligible" ? "Ineligible" : "Unverified";
      return {
        ...result,
        isRelevantToAhmed: false,
        importanceScore: Math.min(result.importanceScore, 39),
        priority: "ignore",
        requiresAction: false,
        shouldNotifyNow: false,
        shouldIncludeInDigest: false,
        suggestedReplyNeeded: false,
        suggestedAction:
          "Skip unless the author confirms Egypt-based contractor eligibility.",
        reason: `${result.reason} ${eligibilityLabel} for an Egypt-based applicant: ${result.eligibilityReason ?? "location and engagement terms are not explicit."}`,
        missingInfo: [
          ...new Set([
            ...result.missingInfo,
            "Egypt/contractor eligibility"
          ])
        ]
      };
    }

    const immediateCategories = [
      "linkedin_message",
      "interview_invite",
      "assessment_invite",
      "offer",
      "calendar_update"
    ];
    const notifyNow =
      immediateCategories.includes(result.category) ||
      result.importanceScore >= 80;
    const replyNeeded =
      result.suggestedReplyNeeded ||
      immediateCategories.includes(result.category) ||
      (result.category === "linkedin_job_post" &&
        result.importanceScore >= 80);

    return {
      ...result,
      priority:
        result.importanceScore >= 80
          ? "high"
          : result.importanceScore >= 60
            ? "medium"
            : result.importanceScore > 0
              ? "low"
              : "ignore",
      shouldNotifyNow: notifyNow,
      shouldIncludeInDigest: !notifyNow && result.importanceScore >= 60,
      suggestedReplyNeeded: replyNeeded
    };
  }

  private suppressLinkedInPostWithoutAiReview(
    result: ClassificationResult
  ): ClassificationResult {
    if (result.category !== "linkedin_job_post") return result;

    return {
      ...result,
      isRelevantToAhmed: false,
      importanceScore: Math.min(result.importanceScore, 39),
      priority: "ignore",
      requiresAction: false,
      shouldNotifyNow: false,
      shouldIncludeInDigest: false,
      suggestedReplyNeeded: false,
      workEligibility: "uncertain",
      eligibilityReason:
        "The post was not approved because the configured AI reviewer was unavailable.",
      suggestedAction: "Retry after the AI reviewer is available.",
      reason: `${result.reason} AI eligibility review did not complete, so the post was suppressed.`
    };
  }

  private applySenderRules(
    result: ClassificationResult,
    rules: Array<{ key: string }>
  ): ClassificationResult {
    if (rules.some((rule) => rule.key === "ignore")) {
      return {
        ...result,
        priority: "ignore",
        shouldNotifyNow: false,
        shouldIncludeInDigest: false,
        reason: `${result.reason} Sender is explicitly ignored.`
      };
    }
    if (
      rules.some((rule) => rule.key === "always_notify") &&
      !(
        result.category === "linkedin_job_post" &&
        result.workEligibility !== "eligible"
      )
    ) {
      return {
        ...result,
        priority: "high",
        shouldNotifyNow: true,
        shouldIncludeInDigest: false,
        reason: `${result.reason} Sender is on the always-notify list.`
      };
    }
    return result;
  }
}
