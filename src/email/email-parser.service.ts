import { Injectable } from "@nestjs/common";
import type {
  NormalizedSignalInput,
  OpportunitySignalType,
  ParsedEmail
} from "../domain/types";

const LINKEDIN_MESSAGE_TERMS = [
  "sent you a message",
  "new message",
  "inmail",
  "replied",
  "message from"
];
const IMPORTANT_TERMS = [
  "interview",
  "technical interview",
  "assessment",
  "coding challenge",
  "offer",
  "contract",
  "salary",
  "availability",
  "next step",
  "shortlisted",
  "moved forward",
  "schedule",
  "calendar",
  "meeting",
  "recruiter",
  "hiring manager",
  "application update",
  "unfortunately"
];
const NOISE_TERMS = [
  "newsletter",
  "unsubscribe",
  "job alert",
  "jobs you may be interested in",
  "profile views",
  "connection suggestions",
  "promotion",
  "webinar",
  "course",
  "application received"
];

@Injectable()
export class EmailParserService {
  parse(email: ParsedEmail):
    | { ignore: true; reason: string }
    | { ignore: false; signal: NormalizedSignalInput } {
    const from = email.from.toLowerCase();
    const subject = email.subject.toLowerCase();
    const body = email.bodyText.toLowerCase();
    const text = `${subject} ${body}`;
    const isLinkedIn = from.includes("linkedin");

    if (
      isLinkedIn &&
      (subject.includes("job alert") ||
        subject.includes("jobs you may be interested in"))
    ) {
      return {
        ignore: true,
        reason: "LinkedIn job alert emails are explicitly excluded."
      };
    }

    const isLinkedInMessage =
      isLinkedIn &&
      LINKEDIN_MESSAGE_TERMS.some((term) => text.includes(term));
    const isNoise = NOISE_TERMS.some((term) => text.includes(term));

    if (isNoise && !isLinkedInMessage) {
      return { ignore: true, reason: "Matched an email noise rule." };
    }

    const important = IMPORTANT_TERMS.some((term) => text.includes(term));
    if (!isLinkedInMessage && !important) {
      return { ignore: true, reason: "Not a useful job-search email." };
    }

    return {
      ignore: false,
      signal: {
        source: isLinkedInMessage ? "linkedin_email" : "email",
        signalType: isLinkedInMessage
          ? "linkedin_message_notification"
          : this.signalType(text),
        senderName: email.fromName,
        senderEmail: email.from,
        subject: email.subject,
        snippet: email.snippet,
        bodyText: email.bodyText,
        url: email.url,
        rawPayload: email.rawPayload,
        externalId: email.externalId,
        threadId: email.threadId,
        receivedAt: email.receivedAt
      }
    };
  }

  private signalType(text: string): OpportunitySignalType {
    if (/\boffer\b|\bsalary\b|\bcontract offer\b/.test(text)) return "offer";
    if (/\bassessment\b|\bcoding challenge\b|\btechnical task\b/.test(text))
      return "assessment_invite";
    if (/\binterview\b|\bschedule a call\b/.test(text)) return "interview_invite";
    if (/\brescheduled\b|\bcancelled\b|\bcanceled\b|\bmeeting changed\b/.test(text))
      return "calendar_update";
    if (/\brejected\b|\bunfortunately\b|\bnot moving forward\b/.test(text))
      return "rejection";
    return "important_email";
  }
}
