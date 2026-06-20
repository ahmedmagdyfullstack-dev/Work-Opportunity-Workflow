export const SIGNAL_TYPES = [
  "linkedin_public_job_post",
  "linkedin_message_notification",
  "important_email",
  "interview_invite",
  "assessment_invite",
  "offer",
  "rejection",
  "calendar_update"
] as const;

export type OpportunitySignalType = (typeof SIGNAL_TYPES)[number];
export type Priority = "high" | "medium" | "low" | "ignore";
export type Decision = "notify_now" | "daily_digest" | "store_only" | "ignore";
export type OpportunityStatus =
  | "new"
  | "interesting"
  | "needs_reply"
  | "applied"
  | "interview"
  | "assessment"
  | "rejected"
  | "offer"
  | "closed"
  | "ignored";

export const CLASSIFICATION_CATEGORIES = [
  "linkedin_job_post",
  "linkedin_message",
  "recruiter_email",
  "interview_invite",
  "assessment_invite",
  "offer",
  "rejection",
  "calendar_update",
  "generic_update",
  "noise"
] as const;

export type ClassificationCategory =
  (typeof CLASSIFICATION_CATEGORIES)[number];

export type NormalizedSignalInput = {
  source: string;
  signalType: OpportunitySignalType;
  senderName?: string | null;
  senderEmail?: string | null;
  authorName?: string | null;
  title?: string | null;
  subject?: string | null;
  snippet?: string | null;
  bodyText?: string | null;
  url?: string | null;
  rawPayload?: Record<string, unknown>;
  externalId?: string | null;
  threadId?: string | null;
  receivedAt?: Date;
};

export type ClassificationResult = {
  isJobRelated: boolean;
  isRelevantToAhmed: boolean;
  importanceScore: number;
  priority: Priority;
  category: ClassificationCategory;
  companyName: string | null;
  roleTitle: string | null;
  location: string | null;
  requiresAction: boolean;
  deadline: string | null;
  summary: string;
  reason: string;
  matchedSkills: string[];
  missingInfo: string[];
  suggestedAction: string;
  suggestedReplyNeeded: boolean;
  confidence: number;
  shouldNotifyNow: boolean;
  shouldIncludeInDigest: boolean;
};

export type SearchResult = {
  title: string;
  snippet: string;
  url: string;
  displayUrl?: string;
  discoveredAt: Date;
  publishedAt?: Date;
  provider: string;
  authorName?: string;
};

export type ParsedEmail = {
  externalId: string;
  threadId?: string;
  from: string;
  fromName?: string;
  subject: string;
  bodyText: string;
  snippet?: string;
  receivedAt: Date;
  url?: string;
  rawPayload?: Record<string, unknown>;
};
