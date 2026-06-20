import { Injectable } from "@nestjs/common";

@Injectable()
export class QueryBuilderService {
  build(): string[] {
    const sites = ["site:linkedin.com/posts", "site:linkedin.com/feed/update"];
    const searches = [
      '("hiring" OR "open role" OR "looking for") ("Backend Engineer" OR "Node.js Engineer") ("Node.js" OR "TypeScript" OR "NestJS")',
      '("hiring" OR "job opening" OR "join our team") ("Full Stack Engineer" OR "Full-Stack Engineer") ("React" OR "Node.js" OR "TypeScript")',
      '("hiring" OR "open role" OR "looking for") ("Product Engineer" OR "Senior Software Engineer") ("remote" OR "startup" OR "product")',
      '("hiring" OR "open role" OR "looking for") ("AI Engineer" OR "AI Agents" OR "RAG" OR "LLM") ("Backend" OR "Full Stack" OR "TypeScript")'
    ];
    const queries: string[] = [];
    for (const site of sites) {
      for (const search of searches) {
        queries.push(
          `${site} ${search} -filled -"applications closed" -"no longer accepting"`
        );
      }
    }
    return queries;
  }
}
