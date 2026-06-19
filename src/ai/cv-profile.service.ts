import { Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/core";
import { ProfileFact } from "../database/entities";

export const DEFAULT_PROFILE_FACTS = [
  ["target", "role", "Senior Backend Engineer", 5],
  ["target", "role", "Senior Full-Stack Engineer", 5],
  ["target", "role", "Product Engineer", 4],
  ["skill", "primary", "Node.js", 5],
  ["skill", "primary", "TypeScript", 5],
  ["skill", "primary", "NestJS", 5],
  ["skill", "primary", "React", 4],
  ["skill", "primary", "Next.js", 3],
  ["skill", "data", "PostgreSQL", 5],
  ["skill", "data", "Redis", 4],
  ["skill", "cloud", "GCP", 3],
  ["skill", "cloud", "AWS", 3],
  ["skill", "devops", "Docker", 3],
  ["skill", "ai", "AI Agents", 4],
  ["skill", "ai", "RAG", 4],
  ["preference", "engagement", "Remote", 5],
  ["preference", "engagement", "B2B", 5],
  ["preference", "engagement", "Contractor", 4],
  ["location", "base", "Cairo, Egypt", 1],
  ["preference", "geography", "EMEA", 3],
  ["preference", "geography", "UAE", 2],
  ["preference", "geography", "Saudi", 2],
  ["preference", "geography", "Europe", 2]
] as const;

@Injectable()
export class CvProfileService {
  constructor(private readonly em: EntityManager) {}

  async ensureDefaults(): Promise<void> {
    const count = await this.em.count(ProfileFact, {});
    if (count > 0) return;

    for (const [category, key, value, weight] of DEFAULT_PROFILE_FACTS) {
      this.em.persist(
        this.em.create(ProfileFact, { category, key, value, weight })
      );
    }
    await this.em.flush();
  }

  async getFacts(): Promise<ProfileFact[]> {
    await this.ensureDefaults();
    return this.em.find(ProfileFact, {}, { orderBy: { weight: "DESC" } });
  }

  async promptSummary(): Promise<string> {
    const facts = await this.getFacts();
    return facts
      .map((fact) => `${fact.category}/${fact.key}: ${fact.value}`)
      .join("\n");
  }
}
