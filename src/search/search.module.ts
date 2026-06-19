import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { QueryBuilderService } from "./query-builder.service";
import { PUBLIC_SEARCH_PROVIDER } from "./public-search-provider.interface";
import {
  BraveSearchProvider,
  GoogleCustomSearchProvider,
  ManualSearchProvider,
  SerpApiProvider
} from "./providers";
import { SearchCacheService } from "./search-cache.service";

@Module({
  providers: [
    QueryBuilderService,
    SearchCacheService,
    ManualSearchProvider,
    BraveSearchProvider,
    SerpApiProvider,
    GoogleCustomSearchProvider,
    {
      provide: PUBLIC_SEARCH_PROVIDER,
      inject: [
        ConfigService,
        ManualSearchProvider,
        BraveSearchProvider,
        SerpApiProvider,
        GoogleCustomSearchProvider
      ],
      useFactory: (
        config: ConfigService,
        manual: ManualSearchProvider,
        brave: BraveSearchProvider,
        serp: SerpApiProvider,
        google: GoogleCustomSearchProvider
      ) => {
        const providers = { manual, brave, serpapi: serp, google_custom_search: google };
        return providers[
          config.get<keyof typeof providers>("SEARCH_PROVIDER", "manual")
        ];
      }
    }
  ],
  exports: [QueryBuilderService, SearchCacheService, PUBLIC_SEARCH_PROVIDER]
})
export class SearchModule {}
