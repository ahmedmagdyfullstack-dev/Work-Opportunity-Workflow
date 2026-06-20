import type { SearchResult } from "../domain/types";

export type SearchOptions = {
  limit?: number;
  freshness?: string;
  maxAgeDays?: number;
};

export interface PublicSearchProvider {
  readonly name: string;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}

export const PUBLIC_SEARCH_PROVIDER = Symbol("PUBLIC_SEARCH_PROVIDER");
