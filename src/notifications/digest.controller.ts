import {
  Controller,
  Get,
  Headers,
  Post,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DigestService } from "./digest.service";

@Controller("digest")
export class DigestController {
  constructor(
    private readonly digest: DigestService,
    private readonly config: ConfigService
  ) {}

  @Get("today")
  async today(@Headers("x-api-key") key?: string) {
    this.authorize(key);
    return this.digest.today();
  }

  @Post("send")
  async send(@Headers("x-api-key") key?: string) {
    this.authorize(key);
    return this.digest.sendToday();
  }

  private authorize(key?: string): void {
    if (key !== this.config.get("ADMIN_API_KEY", "change-me")) {
      throw new UnauthorizedException();
    }
  }
}
