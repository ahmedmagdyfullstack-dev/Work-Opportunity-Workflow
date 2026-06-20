import { Injectable } from "@nestjs/common";
import type {
  ClassificationCategory,
  ClassificationResult,
  NormalizedSignalInput
} from "../domain/types";
import { assessWorkEligibility } from "./work-eligibility";

const skills = [
  "node.js",
  "typescript",
  "nestjs",
  "react",
  "next.js",
  "postgresql",
  "redis",
  "mongodb",
  "graphql",
  "gcp",
  "aws",
  "docker",
  "kubernetes",
  "ai agents",
  "rag",
  "llm"
];
const roles = [
  "backend engineer",
  "full stack engineer",
  "full-stack engineer",
  "product engineer",
  "senior software engineer",
  "ai engineer",
  "node.js engineer"
];
const remoteTerms = ["remote", "b2b", "contract", "contractor", "freelance"];
const targetGeography = ["emea", "uae", "saudi", "ksa", "europe", "us remote"];
const wrongTerms = [
  "wordpress only",
  "php only",
  "java-only",
  ".net-only",
  "mobile-only",
  "flutter-only",
  "onsite-only",
  "unpaid",
  "commission-only"
];

@Injectable()
export class RuleClassifierService {
  classify(input: NormalizedSignalInput): ClassificationResult {
    const rawText = [
      input.title,
      input.subject,
      input.snippet,
      input.bodyText
    ]
      .filter(Boolean)
      .join(" ");
    const text = rawText.toLowerCase();

    if (this.isNoise(input, text)) {
      return this.result({
        category: "noise",
        score: 0,
        summary: "Excluded job-search noise.",
        reason: "Matched an explicit noise or LinkedIn job-alert rule.",
        action: "No action.",
        confidence: 99
      });
    }

    const category = this.category(input, text);
    const matchedSkills = skills.filter((term) => text.includes(term));
    const roleMatch = roles.some((term) => text.includes(term));
    const stackMatch = matchedSkills.length > 0;
    const remoteMatch = remoteTerms.some((term) => text.includes(term));
    const seniorityMatch = /\b(senior|sr\.?|lead|principal)\b/.test(text);
    const ownershipMatch = /\b(startup|product|ownership|end-to-end)\b/.test(text);
    const aiMatch = /\b(ai agents?|rag|llm)\b/.test(text);
    const geographyMatch = targetGeography.some((term) => text.includes(term));
    const wrongStack = wrongTerms.some((term) => text.includes(term));
    const junior = /\b(junior|intern|internship)\b/.test(text);
    const onsiteIrrelevant =
      /\bonsite(-only)?\b/.test(text) &&
      !/\b(cairo|egypt)\b/.test(text);

    let score = 0;
    if (roleMatch) score += 25;
    if (stackMatch) score += Math.min(25, matchedSkills.length * 7);
    if (remoteMatch) score += 15;
    if (seniorityMatch) score += 10;
    if (ownershipMatch) score += 10;
    if (aiMatch) score += 10;
    if (geographyMatch) score += 5;
    if (wrongStack) score -= 25;
    if (onsiteIrrelevant) score -= 25;
    if (junior) score -= 20;
    if (!input.url && !this.isActionCategory(category)) score -= 15;
    if (!this.extractRole(text) && category === "linkedin_job_post") score -= 10;

    if (this.isActionCategory(category)) score = Math.max(score, 85);
    if (category === "linkedin_message") score = Math.max(score, 85);
    if (category === "recruiter_email") score = Math.max(score, 65);
    if (category === "rejection") score = Math.max(score, 60);
    score = Math.max(0, Math.min(100, score));

    const requiresAction =
      this.isActionCategory(category) ||
      category === "linkedin_message" ||
      category === "recruiter_email";
    const shouldNotifyNow =
      this.isActionCategory(category) ||
      category === "linkedin_message" ||
      score >= 80;
    const companyName = this.extractCompany(rawText);
    const roleTitle = this.extractRole(text);
    const eligibility = assessWorkEligibility(input);
    const eligibilityGated =
      category === "linkedin_job_post" && eligibility.status !== "eligible";
    if (eligibilityGated) score = Math.min(score, 39);
    const priority =
      eligibilityGated
        ? "ignore"
        : score >= 80
          ? "high"
          : score >= 60
            ? "medium"
            : score > 0
              ? "low"
              : "ignore";

    return {
      isJobRelated: category !== "noise",
      isRelevantToAhmed: score >= 60 && !eligibilityGated,
      importanceScore: score,
      priority,
      category,
      companyName,
      roleTitle,
      location: this.extractLocation(text),
      requiresAction: eligibilityGated ? false : requiresAction,
      deadline: this.extractDeadline(text),
      summary: this.summary(category, input, score),
      reason: `${this.reason({
        matchedSkills,
        roleMatch,
        remoteMatch,
        seniorityMatch,
        ownershipMatch,
        aiMatch,
        wrongStack,
        junior
      })} Work eligibility: ${eligibility.reason}`,
      matchedSkills: matchedSkills.map((skill) => this.display(skill)),
      missingInfo: [
        ...(!companyName ? ["company"] : []),
        ...(!roleTitle ? ["role"] : []),
        ...(!input.url ? ["source link"] : []),
        ...(eligibility.status === "uncertain"
          ? ["Egypt/contractor eligibility"]
          : [])
      ],
      suggestedAction: eligibilityGated
        ? "Skip unless the author confirms Egypt-based contractor eligibility."
        : this.action(category, score),
      suggestedReplyNeeded:
        !eligibilityGated && (requiresAction || score >= 80),
      confidence: category === "generic_update" ? 65 : 88,
      shouldNotifyNow: !eligibilityGated && shouldNotifyNow,
      shouldIncludeInDigest:
        !eligibilityGated && !shouldNotifyNow && score >= 60,
      workEligibility: eligibility.status,
      eligibilityReason: eligibility.reason,
      engagementType: eligibility.engagementType
    };
  }

  private isNoise(input: NormalizedSignalInput, text: string): boolean {
    const linkedin = `${input.senderEmail ?? ""} ${input.source}`.toLowerCase();
    if (
      linkedin.includes("linkedin") &&
      /\b(job alert|jobs you may be interested in)\b/.test(text)
    ) {
      return true;
    }
    return /\b(newsletter|profile views?|connection suggestions?|promotion|webinar|course|unsubscribe)\b/.test(
      text
    );
  }

  private category(
    input: NormalizedSignalInput,
    text: string
  ): ClassificationCategory {
    if (input.signalType === "linkedin_public_job_post") return "linkedin_job_post";
    if (input.signalType === "linkedin_message_notification")
      return "linkedin_message";
    if (/\b(offer|salary discussion|compensation|contract offer)\b/.test(text))
      return "offer";
    if (/\b(assessment|coding challenge|technical task|take-home)\b/.test(text))
      return "assessment_invite";
    if (/\b(interview|schedule a call|calendar invite)\b/.test(text))
      return "interview_invite";
    if (/\b(rescheduled|canceled|cancelled|meeting changed)\b/.test(text))
      return "calendar_update";
    if (/\b(rejected|unfortunately|not moving forward)\b/.test(text))
      return "rejection";
    if (/\b(recruiter|hiring manager|opportunity|availability|shortlisted|next step)\b/.test(text))
      return "recruiter_email";
    return "generic_update";
  }

  private isActionCategory(category: ClassificationCategory): boolean {
    return [
      "interview_invite",
      "assessment_invite",
      "offer",
      "calendar_update"
    ].includes(category);
  }

  private extractRole(text: string): string | null {
    const found = roles.find((role) => text.includes(role));
    if (!found) return null;
    const role = this.display(found);
    return /\b(senior|sr\.?)\b/.test(text) && !role.startsWith("Senior")
      ? `Senior ${role}`
      : role;
  }

  private extractCompany(text: string): string | null {
    const matches = text.match(
      /(?:at|with|join)\s+([A-Z][A-Za-z0-9&.-]+(?:\s+[A-Z][A-Za-z0-9&.-]+){0,2})/
    );
    return matches?.[1] ?? null;
  }

  private extractLocation(text: string): string | null {
    const locations = ["remote", "emea", "uae", "saudi", "ksa", "europe", "cairo", "egypt"];
    const found = locations.find((location) => text.includes(location));
    return found ? this.display(found) : null;
  }

  private extractDeadline(text: string): string | null {
    const iso = text.match(/\b20\d{2}-\d{2}-\d{2}\b/);
    if (iso) return new Date(`${iso[0]}T23:59:59Z`).toISOString();
    const within = text.match(/within\s+(\d+)\s+(hour|hours|day|days)/);
    if (!within) return null;
    const amount = Number(within[1]);
    const milliseconds = within[2].startsWith("hour")
      ? amount * 3_600_000
      : amount * 86_400_000;
    return new Date(Date.now() + milliseconds).toISOString();
  }

  private result(input: {
    category: ClassificationCategory;
    score: number;
    summary: string;
    reason: string;
    action: string;
    confidence: number;
  }): ClassificationResult {
    return {
      isJobRelated: false,
      isRelevantToAhmed: false,
      importanceScore: input.score,
      priority: "ignore",
      category: input.category,
      companyName: null,
      roleTitle: null,
      location: null,
      requiresAction: false,
      deadline: null,
      summary: input.summary,
      reason: input.reason,
      matchedSkills: [],
      missingInfo: [],
      suggestedAction: input.action,
      suggestedReplyNeeded: false,
      confidence: input.confidence,
      shouldNotifyNow: false,
      shouldIncludeInDigest: false,
      workEligibility: "uncertain",
      eligibilityReason: "Not evaluated because the signal is excluded noise.",
      engagementType: null
    };
  }

  private summary(
    category: ClassificationCategory,
    input: NormalizedSignalInput,
    score: number
  ): string {
    return `${this.display(category.replaceAll("_", " "))}: ${
      input.subject || input.title || input.snippet || "Job-search update"
    } (${score}/100).`;
  }

  private reason(flags: Record<string, boolean | string[]>): string {
    const reasons: string[] = [];
    const matched = flags.matchedSkills as string[];
    if (flags.roleMatch) reasons.push("target role");
    if (matched.length) reasons.push(`matching stack: ${matched.join(", ")}`);
    if (flags.remoteMatch) reasons.push("remote/B2B fit");
    if (flags.seniorityMatch) reasons.push("seniority fit");
    if (flags.ownershipMatch) reasons.push("product ownership");
    if (flags.aiMatch) reasons.push("AI/RAG relevance");
    if (flags.wrongStack) reasons.push("wrong-stack penalty");
    if (flags.junior) reasons.push("junior-role penalty");
    return reasons.length ? reasons.join("; ") : "Limited matching detail available.";
  }

  private action(category: ClassificationCategory, score: number): string {
    if (category === "linkedin_message") return "Open LinkedIn and reply.";
    if (category === "interview_invite") return "Confirm the interview schedule.";
    if (category === "assessment_invite") return "Acknowledge and plan the assessment.";
    if (category === "offer") return "Review the terms and prepare a response.";
    if (category === "calendar_update") return "Review the changed meeting details.";
    if (score >= 80) return "Open the source and contact the author or recruiter.";
    if (score >= 60) return "Review in today’s digest.";
    return "Store for reference.";
  }

  private display(value: string): string {
    const known: Record<string, string> = {
      "node.js": "Node.js",
      typescript: "TypeScript",
      nestjs: "NestJS",
      react: "React",
      "next.js": "Next.js",
      postgresql: "PostgreSQL",
      redis: "Redis",
      mongodb: "MongoDB",
      graphql: "GraphQL",
      gcp: "GCP",
      aws: "AWS",
      rag: "RAG",
      llm: "LLM",
      emea: "EMEA",
      uae: "UAE",
      ksa: "KSA"
    };
    return known[value] ?? value.replace(/\b\w/g, (char) => char.toUpperCase());
  }
}
