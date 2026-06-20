import type {
  NormalizedSignalInput,
  WorkEligibility
} from "../domain/types";

export type WorkEligibilityAssessment = {
  status: WorkEligibility;
  reason: string;
  engagementType: string | null;
};

const contractorPatterns = [
  /\bindependent contractor\b/i,
  /\binternational contractor\b/i,
  /\bb2b\b/i,
  /\bcontractor\b/i,
  /\bfreelance\b/i,
  /\bproject[- ]based\b/i,
  /\bproject basis\b/i,
  /\boutstaff(?:ing)?\b/i,
  /\bcontract basis\b/i
];

const egyptPatterns = [
  /\begypt\b/i,
  /\bcairo\b/i,
  /\balexandria\b/i
];

const inclusiveGeographyPatterns = [
  /\bworldwide\b/i,
  /\bglobal remote\b/i,
  /\bglobally remote\b/i,
  /\bwork from anywhere\b/i,
  /\bremote from anywhere\b/i,
  /\banywhere in the world\b/i,
  /\binternational candidates?\b/i,
  /\bopen internationally\b/i,
  /\bopen to (?:candidates? from )?mena\b/i,
  /\bopen to (?:candidates? from )?emea\b/i,
  /\bremote[- ]emea\b/i,
  /\bremote in emea\b/i,
  /\beurope(?:an)? time ?zone\b/i,
  /\bcet\/?cest\b/i,
  /\bmena\b/i,
  /\bemea\b/i
];

const restrictedGeographyPatterns = [
  /\b(?:excluding|except|not available in|not open to|cannot hire in)\s+(?:candidates? (?:in|from) )?(?:egypt|cairo)\b/i,
  /\b(?:remote[ ,—-]*(?:in|within)?\s*)?(?:us|usa|united states)[ -]only\b/i,
  /\b(?:remote[ ,—-]*(?:in|within)?\s*)?canada[ -]only\b/i,
  /\b(?:remote[ ,—-]*(?:in|within)?\s*)?(?:uk|united kingdom)[ -]only\b/i,
  /\b(?:remote[ ,—-]*(?:in|within)?\s*)?(?:eu|europe)[ -]only\b/i,
  /\bremote (?:in|within|from) (?:the )?(?:us|usa|united states|canada|uk|united kingdom|eu|europe|germany|france|spain|italy|netherlands|belgium|poland|ireland|portugal|sweden|norway|denmark|finland|switzerland|austria|australia|new zealand)\b/i,
  /\b(?:applicants?|candidates?|employees?) must (?:be|reside|live|be located|be based) in (?!egypt\b|cairo\b|mena\b|emea\b)[a-z]/i,
  /\bmust (?:be|reside|live|be located|be based) in (?!egypt\b|cairo\b|mena\b|emea\b)[a-z]/i,
  /\b(?:based|located|resident) in (?:the )?(?:us|usa|united states|canada|uk|united kingdom|eu|europe)\b/i,
  /\bmust be legally (?:authorized|eligible) to work in (?!egypt\b)[a-z]/i,
  /\bmust have (?:valid )?(?:us|canadian|uk|eu) work authori[sz]ation\b/i,
  /\b(?:us|canada|uk|eu) work authori[sz]ation required\b/i,
  /\b(?:local|domestic) payroll only\b/i,
  /\bno sponsorship\b/i,
  /\bw-?2 only\b/i,
  /\bno c2c\b/i,
  /\bno corp[- ]to[- ]corp\b/i
];

const hybridOrOnsitePattern = /\b(hybrid|on[- ]?site|in[- ]office)\b/i;

export function assessWorkEligibility(
  input: NormalizedSignalInput
): WorkEligibilityAssessment {
  const text = [
    input.title,
    input.subject,
    input.snippet,
    input.bodyText
  ]
    .filter(Boolean)
    .join(" ");

  const contractor = contractorPatterns.find((pattern) => pattern.test(text));
  const inEgypt = egyptPatterns.some((pattern) => pattern.test(text));
  const inclusiveGeography = inclusiveGeographyPatterns.some((pattern) =>
    pattern.test(text)
  );
  const restricted = restrictedGeographyPatterns.find((pattern) =>
    pattern.test(text)
  );
  const hybridOrOnsite = hybridOrOnsitePattern.test(text);

  if (restricted) {
    return {
      status: "ineligible",
      reason:
        "The post contains a country, residency, work-authorization, payroll, or contracting restriction that excludes an Egypt-based applicant.",
      engagementType: contractor ? contractor.source : null
    };
  }

  if (inEgypt) {
    return {
      status: "eligible",
      reason:
        "The role explicitly accepts Egypt/Cairo, so local employment, hybrid, onsite, or remote work is possible.",
      engagementType: contractor ? contractor.source : "Egypt-based"
    };
  }

  if (hybridOrOnsite) {
    return {
      status: "ineligible",
      reason:
        "Hybrid or onsite work outside Egypt is not eligible for an Egypt-based applicant.",
      engagementType: contractor ? contractor.source : null
    };
  }

  if (contractor && inclusiveGeography) {
    return {
      status: "eligible",
      reason:
        "The post explicitly supports contractor/B2B/freelance engagement and a geography that includes Egypt.",
      engagementType: contractor.source
    };
  }

  if (contractor && !inclusiveGeography) {
    return {
      status: "uncertain",
      reason:
        "Contractor terms are present, but the indexed post does not explicitly confirm that Egypt is an accepted location.",
      engagementType: contractor.source
    };
  }

  if (inclusiveGeography) {
    return {
      status: "uncertain",
      reason:
        "The geography may include Egypt, but the post does not explicitly offer independent contractor, B2B, freelance, or project-based engagement.",
      engagementType: null
    };
  }

  return {
    status: "uncertain",
    reason:
      "The post does not prove both Egypt eligibility and an acceptable engagement model. “Remote” alone is insufficient.",
    engagementType: null
  };
}
