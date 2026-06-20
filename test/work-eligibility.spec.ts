import { describe, expect, it } from "vitest";
import { assessWorkEligibility } from "../src/ai/work-eligibility";

const signal = (snippet: string) => ({
  source: "linkedin_public_search",
  signalType: "linkedin_public_job_post" as const,
  title: "Senior Backend Engineer",
  snippet
});

describe("Egypt work eligibility", () => {
  it.each([
    "Remote worldwide — independent contractor",
    "Global remote B2B contract",
    "Remote EMEA freelance project",
    "Europe time zone, international contractor",
    "Hybrid in Cairo, Egypt"
  ])("accepts explicit eligible wording: %s", (text) => {
    expect(assessWorkEligibility(signal(text)).status).toBe("eligible");
  });

  it.each([
    "Remote US only, W2 only",
    "Remote Europe only",
    "Remote within Germany",
    "Must be based in Canada",
    "Hybrid in Berlin, Germany",
    "Must have US work authorization",
    "Worldwide contractor role, excluding candidates from Egypt"
  ])("rejects explicit restrictions: %s", (text) => {
    expect(assessWorkEligibility(signal(text)).status).toBe("ineligible");
  });

  it.each([
    "Remote role",
    "Remote worldwide full-time employee",
    "B2B contractor, location not specified"
  ])("suppresses ambiguous wording: %s", (text) => {
    expect(assessWorkEligibility(signal(text)).status).toBe("uncertain");
  });
});
