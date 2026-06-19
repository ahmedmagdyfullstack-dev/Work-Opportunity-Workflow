import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { NormalizedSignalInput } from "../domain/types";

@Injectable()
export class DeduplicationService {
  normalize(value?: string | null): string {
    return (value ?? "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\/(www\.)?/, "")
      .replace(/[?#].*$/, "")
      .replace(/\/+$/, "")
      .replace(/\s+/g, " ");
  }

  contentHash(input: NormalizedSignalInput): string {
    const identity =
      input.signalType === "linkedin_public_job_post"
        ? [input.url, input.title, input.snippet]
        : [
            input.externalId || input.threadId,
            input.subject,
            input.senderEmail,
            input.receivedAt?.toISOString()
          ];

    return createHash("sha256")
      .update(identity.map((value) => this.normalize(value)).join("|"))
      .digest("hex");
  }

  normalizeRole(role?: string | null): string {
    return this.normalize(role)
      .replace(/\b(senior|sr\.?|lead|principal|mid-level|mid)\b/g, "")
      .replace(/\b(remote|contractor|contract|b2b)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
}
