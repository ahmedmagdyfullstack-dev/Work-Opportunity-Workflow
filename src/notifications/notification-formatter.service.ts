import { Injectable } from "@nestjs/common";
import type { Classification } from "../database/entities";
import type { ReplySuggestion } from "../database/entities";
import type { OpportunitySignal } from "../database/entities";

@Injectable()
export class NotificationFormatterService {
  format(
    signal: OpportunitySignal,
    classification: Classification,
    reply?: ReplySuggestion
  ): string {
    return [
      "🚨 Job Search Update",
      "",
      `Type: ${classification.category}`,
      `Company: ${classification.companyName ?? "Unknown"}`,
      `Role: ${classification.roleTitle ?? "Not extracted"}`,
      `Score: ${classification.importanceScore}/100`,
      `Action: ${classification.suggestedAction}`,
      "",
      `Summary:\n${classification.summary}`,
      "",
      `Why it matters:\n${classification.reason}`,
      ...(reply ? ["", `Suggested reply:\n${reply.suggestedReply}`] : []),
      ...(signal.url ? ["", `Open:\n${signal.url}`] : [])
    ].join("\n");
  }
}
