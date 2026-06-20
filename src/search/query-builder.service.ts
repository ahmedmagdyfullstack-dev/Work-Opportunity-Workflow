import { Injectable } from "@nestjs/common";

@Injectable()
export class QueryBuilderService {
  build(): string[] {
    const sites = ["site:linkedin.com/posts", "site:linkedin.com/feed/update"];
    const roles = [
      '("Backend Engineer" OR "Node.js Engineer")',
      '("Full Stack Engineer" OR "Full-Stack Engineer")',
      '("Product Engineer" OR "Senior Software Engineer")',
      '("AI Engineer" OR "AI Agents" OR "RAG")'
    ];
    const hiring =
      '("we\'re hiring" OR "we are hiring" OR "hiring" OR "open role" OR "looking for" OR "job opening")';
    const stack =
      '("Node.js" OR "NestJS" OR "TypeScript" OR "React" OR "PostgreSQL")';
    const work =
      '("remote" OR "B2B" OR "contract" OR "contractor" OR "EMEA" OR "UAE" OR "Saudi" OR "Europe")';
    const queries: string[] = [];
    for (const site of sites) {
      for (const role of roles) {
        queries.push(
          `${site} ${hiring} ${role} ${stack} ${work} -filled -"applications closed" -"no longer accepting"`
        );
      }
    }
    return queries;
  }
}
