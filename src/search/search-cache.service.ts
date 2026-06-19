import { Injectable } from "@nestjs/common";
import type { SearchResult } from "../domain/types";

@Injectable()
export class SearchCacheService {
  private readonly cache = new Map<
    string,
    { expiresAt: number; results: SearchResult[] }
  >();

  get(query: string): SearchResult[] | null {
    const item = this.cache.get(query);
    if (!item || item.expiresAt < Date.now()) {
      this.cache.delete(query);
      return null;
    }
    return item.results;
  }

  set(query: string, results: SearchResult[], ttlMs = 10 * 60 * 1000): void {
    this.cache.set(query, { expiresAt: Date.now() + ttlMs, results });
  }
}
