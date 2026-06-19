import { Injectable } from "@nestjs/common";
import type { ClassificationResult, NormalizedSignalInput } from "../domain/types";

@Injectable()
export class ReplySuggestionService {
  generate(
    input: NormalizedSignalInput,
    classification: ClassificationResult
  ): {
    suggestionType: string;
    suggestedReply: string;
    suggestedAction: string;
    keyPointsUsed: string[];
    riskNotes: string[];
  } {
    const name = input.senderName || input.authorName || "[Name]";
    const role = classification.roleTitle || "the opportunity";
    const common =
      "My background is mainly Node.js, TypeScript, NestJS, React, PostgreSQL, Redis, Docker, and cloud-based product engineering for remote teams.";
    let suggestionType = "email_reply";
    let suggestedReply = `Hi ${name}, thanks for reaching out. I’d be happy to learn more about ${role}. ${common} Please send me the role details and next steps.`;

    if (classification.category === "linkedin_job_post") {
      suggestionType = "linkedin_dm";
      suggestedReply = `Hi ${name}, I saw your post about ${role}. ${common} I’d be happy to share my CV and discuss whether my profile fits.`;
    } else if (classification.category === "interview_invite") {
      suggestionType = "interview_confirmation";
      suggestedReply = `Hi ${name}, thank you for the invitation. I’m happy to confirm and look forward to speaking with the team. Please let me know if there is anything specific I should prepare.`;
    } else if (classification.category === "assessment_invite") {
      suggestionType = "assessment";
      suggestedReply = `Hi ${name}, thanks for sending the assessment. I’ve received it and will review the instructions and deadline. I’ll let you know promptly if I have any questions.`;
    } else if (classification.category === "offer") {
      suggestionType = "email_reply";
      suggestedReply = `Hi ${name}, thank you for sharing the offer. I appreciate it and I’m reviewing the role, compensation, engagement model, and terms. I’ll come back to you shortly with my response and any questions.`;
    } else if (classification.category === "rejection") {
      suggestionType = "follow_up";
      suggestedReply = `Hi ${name}, thank you for letting me know. I appreciate the team’s time and would be grateful for any brief feedback you can share. Please keep me in mind for future backend or full-stack opportunities.`;
    }

    return {
      suggestionType,
      suggestedReply,
      suggestedAction: classification.suggestedAction,
      keyPointsUsed: classification.matchedSkills.length
        ? classification.matchedSkills
        : ["Node.js", "TypeScript", "NestJS", "React", "PostgreSQL"],
      riskNotes: classification.missingInfo.map(
        (item) => `Confirm ${item} before committing.`
      )
    };
  }
}
