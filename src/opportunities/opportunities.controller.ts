import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  NormalizedSignalInput,
  OpportunityStatus
} from "../domain/types";
import { OpportunityService } from "./opportunity.service";

@Controller()
export class OpportunitiesController {
  constructor(
    private readonly service: OpportunityService,
    private readonly config: ConfigService
  ) {}

  @Get("opportunities")
  async opportunities(@Headers("x-api-key") key?: string) {
    this.authorize(key);
    return this.service.listOpportunities();
  }

  @Get("opportunities/:id")
  async opportunity(@Param("id") id: string, @Headers("x-api-key") key?: string) {
    this.authorize(key);
    return this.service.getOpportunity(id);
  }

  @Get("signals")
  async signals(
    @Query("needsAction") needsAction?: string,
    @Headers("x-api-key") key?: string
  ) {
    this.authorize(key);
    return this.service.listSignals(needsAction === "true");
  }

  @Get("signals/:id")
  async signal(@Param("id") id: string, @Headers("x-api-key") key?: string) {
    this.authorize(key);
    return this.service.getSignal(id);
  }

  @Post("signals/manual-import")
  async import(
    @Body() body: NormalizedSignalInput,
    @Headers("x-api-key") key?: string
  ) {
    this.authorize(key);
    return this.service.ingest({
      ...body,
      source: body.source || "manual_import",
      receivedAt: body.receivedAt ? new Date(body.receivedAt) : new Date()
    });
  }

  @Post("signals/:id/feedback")
  async feedback(
    @Param("id") id: string,
    @Body() body: { feedback: string; notes?: string },
    @Headers("x-api-key") key?: string
  ) {
    this.authorize(key);
    return this.service.addFeedback(id, body.feedback, body.notes);
  }

  @Post("signals/:id/regenerate-reply")
  async regenerate(
    @Param("id") id: string,
    @Headers("x-api-key") key?: string
  ) {
    this.authorize(key);
    return this.service.regenerateReply(id);
  }

  @Post("signals/:id/mark-done")
  async done(
    @Param("id") id: string,
    @Body() body: { status?: OpportunityStatus },
    @Headers("x-api-key") key?: string
  ) {
    this.authorize(key);
    return this.service.markDone(id, body.status);
  }

  private authorize(key?: string): void {
    const expected = this.config.get("ADMIN_API_KEY", "change-me");
    if (expected && key !== expected) throw new UnauthorizedException();
  }
}
