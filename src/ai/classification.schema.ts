import { z } from "zod";
import { CLASSIFICATION_CATEGORIES } from "../domain/types";

export const classificationResultSchema = z.object({
  is_job_related: z.boolean(),
  is_relevant_to_ahmed: z.boolean(),
  category: z.enum(CLASSIFICATION_CATEGORIES),
  importance_score: z.number().int().min(0).max(100),
  priority: z.enum(["high", "medium", "low", "ignore"]),
  company_name: z.string().nullable(),
  role_title: z.string().nullable(),
  location: z.string().nullable(),
  requires_action: z.boolean(),
  deadline: z.string().nullable(),
  should_notify_now: z.boolean(),
  should_include_in_digest: z.boolean(),
  summary: z.string(),
  reason: z.string(),
  matched_skills: z.array(z.string()),
  missing_info: z.array(z.string()),
  suggested_action: z.string(),
  suggested_reply_needed: z.boolean(),
  confidence: z.number().int().min(0).max(100),
  work_eligibility: z.enum(["eligible", "ineligible", "uncertain"]),
  eligibility_reason: z.string(),
  engagement_type: z.string().nullable()
});
