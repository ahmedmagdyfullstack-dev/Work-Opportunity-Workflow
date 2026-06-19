import {
  Controller,
  Headers,
  Post,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PublicPostSearchWorker } from "./public-post-search.worker";

@Controller("admin")
export class IngestionController {
  constructor(
    private readonly worker: PublicPostSearchWorker,
    private readonly config: ConfigService
  ) {}

  @Post("search/run")
  async search(@Headers("x-api-key") key?: string) {
    if (key !== this.config.get("ADMIN_API_KEY", "change-me")) {
      throw new UnauthorizedException();
    }
    return this.worker.run();
  }
}
