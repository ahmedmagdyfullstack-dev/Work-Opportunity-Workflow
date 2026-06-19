import { describe, expect, it } from "vitest";
import { EmailParserService } from "../src/email/email-parser.service";

const base = {
  externalId: "message-1",
  from: "recruiter@example.com",
  subject: "",
  bodyText: "",
  receivedAt: new Date("2026-06-20T10:00:00Z")
};

describe("EmailParserService", () => {
  const parser = new EmailParserService();

  it("always excludes LinkedIn job alerts", () => {
    const result = parser.parse({
      ...base,
      from: "jobs-noreply@linkedin.com",
      subject: "Your LinkedIn Job Alert",
      bodyText: "Senior Node.js jobs"
    });
    expect(result.ignore).toBe(true);
  });

  it("detects LinkedIn message notifications", () => {
    const result = parser.parse({
      ...base,
      from: "messages-noreply@linkedin.com",
      subject: "Ahmed, you have a new message",
      bodyText: "A recruiter sent you a message"
    });
    expect(result.ignore).toBe(false);
    if (!result.ignore) {
      expect(result.signal.signalType).toBe("linkedin_message_notification");
      expect(result.signal.source).toBe("linkedin_email");
    }
  });

  it("detects assessment invites", () => {
    const result = parser.parse({
      ...base,
      subject: "Technical assessment",
      bodyText: "Please complete the coding challenge within 72 hours."
    });
    expect(result.ignore).toBe(false);
    if (!result.ignore) expect(result.signal.signalType).toBe("assessment_invite");
  });

  it("filters newsletters", () => {
    expect(
      parser.parse({
        ...base,
        subject: "Weekly newsletter",
        bodyText: "Unsubscribe here"
      }).ignore
    ).toBe(true);
  });
});
