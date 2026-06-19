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
    if (
      this.config.get("AI_MODE", "rules") !== "openai" ||
      !this.config.get("OPENAI_API_KEY")
    ) {
      return this.applySenderRules(this.rules.classify(input), senderRules);
    }

    try {
      const client = new OpenAI({
        apiKey: this.config.getOrThrow<string>("OPENAI_API_KEY")
      });
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
        input: [
          {
            role: "system",
            content:
              "Classify job-search signals for Ahmed. LinkedIn normal job posts, LinkedIn message notification emails, and important recruiter/application emails are included. LinkedIn job-alert emails, newsletters, marketing, profile views, and connection suggestions are excluded. Prefer remote/B2B senior backend, full-stack, product, and AI roles. Return the requested structured output only."
          },
          {
            role: "user",
            content: `Profile:\n${await this.profile.promptSummary()}\n\nSignal:\n${JSON.stringify(input)}`
          }
        ]
      });
      const parsed = response.output_parsed;
      if (!parsed) throw new Error("OpenAI returned no parsed classification");
      return this.applySenderRules({
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
        summary: parsed.summary,
        reason: parsed.reason,
        matchedSkills: parsed.matched_skills,
        missingInfo: parsed.missing_info,
        suggestedAction: parsed.suggested_action,
        suggestedReplyNeeded: parsed.suggested_reply_needed,
        confidence: parsed.confidence
      }, senderRules);
    } catch (error) {
      this.logger.error("AI classification failed; using deterministic rules", error);
      return this.applySenderRules(this.rules.classify(input), senderRules);
    }
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
    if (rules.some((rule) => rule.key === "always_notify")) {
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
