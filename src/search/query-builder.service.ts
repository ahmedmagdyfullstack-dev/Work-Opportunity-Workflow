import { Injectable } from "@nestjs/common";

@Injectable()
export class QueryBuilderService {
  build(): string[] {
    const sites = ["site:linkedin.com/posts", "site:linkedin.com/feed/update"];
    const hiring = [
      '("we\'re hiring" OR "we are hiring" OR "hiring" OR "open role")',
      '("looking for" OR "job opening" OR "join our team")'
    ];
    const roles = [
      '("Backend Engineer" OR "Node.js Engineer")',
      '("Full Stack Engineer" OR "Full-Stack Engineer")',
      '("Product Engineer" OR "Senior Software Engineer")',
      '("AI Engineer" OR "AI Agents" OR "RAG")'
    ];
    const stack = [
      '("Node.js" OR "NestJS" OR "TypeScript")',
      '("React" OR "Next.js" OR "PostgreSQL")'
    ];
    const work = [
      '("remote" OR "B2B" OR "contract" OR "contractor")',
      '("EMEA" OR "UAE" OR "Saudi" OR "Europe")'
    ];
    const queries: string[] = [];
    for (const site of sites) {
      for (const role of roles) {
        for (let i = 0; i < 2; i += 1) {
          queries.push(`${site} ${hiring[i]} ${role} ${stack[i]} ${work[i]}`);
        }
      }
    }
    return queries;
  }
}
