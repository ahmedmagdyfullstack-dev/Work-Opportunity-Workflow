import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  ClassificationResult,
  Decision,
  NormalizedSignalInput
} from "../domain/types";

@Injectable()
export class DecisionEngineService {
  constructor(private readonly config: ConfigService) {}

  decide(
    signal: NormalizedSignalInput,
    classification: ClassificationResult
  ): Decision {
    if (classification.category === "noise") return "ignore";
    const text = `${signal.subject ?? ""} ${signal.bodyText ?? ""}`.toLowerCase();
    if (signal.source === "linkedin_email" && text.includes("job alert")) {
      return "ignore";
    }
    if (
      [
        "linkedin_message",
        "interview_invite",
        "assessment_invite",
        "offer",
        "calendar_update"
      ].includes(classification.category)
    ) {
      return "notify_now";
    }
    if (classification.deadline) {
      const deadline = new Date(classification.deadline).getTime();
      if (deadline - Date.now() <= 72 * 60 * 60 * 1000) return "notify_now";
    }
    if (
      classification.importanceScore >=
      this.config.get<number>("NOTIFICATION_THRESHOLD", 80)
    ) {
      return "notify_now";
    }
    if (
      classification.importanceScore >=
      this.config.get<number>("DIGEST_THRESHOLD", 60)
    ) {
      return "daily_digest";
    }
    return "store_only";
  }
}
