import {
  Controller,
  Get,
  Headers,
  Param,
  Res,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EntityManager } from "@mikro-orm/core";
import type { Response } from "express";
import {
  Notification,
  Opportunity,
  OpportunitySignal,
  ReplySuggestion
} from "../database/entities";

@Controller()
export class DashboardController {
  constructor(
    private readonly em: EntityManager,
    private readonly config: ConfigService
  ) {}

  @Get("health")
  health() {
    return { status: "ok", service: "opportunity-intelligence" };
  }

  @Get("notifications")
  async notifications(@Headers("x-api-key") key?: string) {
    this.authorize(key);
    return this.em.find(Notification, {}, { orderBy: { createdAt: "DESC" } });
  }

  @Get("replies")
  async replies(@Headers("x-api-key") key?: string) {
    this.authorize(key);
    return this.em.find(
      ReplySuggestion,
      {},
      { populate: ["signal", "opportunity"], orderBy: { createdAt: "DESC" } }
    );
  }

  @Get(["dashboard", "dashboard/:page"])
  async dashboard(
    @Param("page") page: string | undefined,
    @Res() response: Response
  ) {
    const [opportunities, signals, replies] = await Promise.all([
      this.em.count(Opportunity, {}),
      this.em.count(OpportunitySignal, {}),
      this.em.count(ReplySuggestion, { status: "draft" })
    ]);
    response.type("html").send(this.html(page ?? "opportunities", {
      opportunities,
      signals,
      replies
    }));
  }

  private html(
    page: string,
    counts: { opportunities: number; signals: number; replies: number }
  ): string {
    const tabs = [
      "opportunities",
      "signals",
      "needs-action",
      "replies",
      "digest",
      "settings"
    ];
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Opportunity Inbox</title>
<style>
:root{color-scheme:dark;--bg:#0b1020;--card:#151d32;--text:#f5f7fb;--muted:#aab4c8;--green:#4ade80;--line:#28334d}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui;background:linear-gradient(145deg,#0b1020,#10182c);color:var(--text)}
main{max-width:1100px;margin:auto;padding:40px 24px}header{display:flex;justify-content:space-between;align-items:end;gap:24px}
h1{font-size:34px;margin:0}p{color:var(--muted)}nav{display:flex;gap:8px;flex-wrap:wrap;margin:28px 0}
a{color:var(--muted);text-decoration:none;padding:9px 13px;border:1px solid var(--line);border-radius:999px}
a.active{color:#08110b;background:var(--green);border-color:var(--green)}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.card{padding:22px;background:rgba(21,29,50,.92);border:1px solid var(--line);border-radius:18px}
.number{font-size:38px;font-weight:750}.hint{padding:22px;margin-top:16px;background:#111a2e;border-left:3px solid var(--green);border-radius:10px}
code{color:#9ee6b2}@media(max-width:700px){.grid{grid-template-columns:1fr}header{align-items:start;flex-direction:column}}
</style></head><body><main>
<header><div><p>READ-ONLY JOB INTELLIGENCE</p><h1>Opportunity Inbox</h1></div><p>WhatsApp-first · CV-scored · no LinkedIn scraping</p></header>
<nav>${tabs.map((tab) => `<a class="${tab === page ? "active" : ""}" href="/dashboard/${tab}">${tab.replace("-", " ")}</a>`).join("")}</nav>
<section class="grid"><div class="card"><p>Opportunities</p><div class="number">${counts.opportunities}</div></div>
<div class="card"><p>Signals</p><div class="number">${counts.signals}</div></div>
<div class="card"><p>Draft replies</p><div class="number">${counts.replies}</div></div></section>
<section class="hint"><strong>${page.replace("-", " ")}</strong><p>The dashboard is intentionally thin in the MVP. Use the authenticated JSON APIs for full records, feedback, status changes, and reply regeneration.</p><code>Header: x-api-key: &lt;ADMIN_API_KEY&gt;</code></section>
</main></body></html>`;
  }

  private authorize(key?: string): void {
    if (key !== this.config.get("ADMIN_API_KEY", "change-me")) {
      throw new UnauthorizedException();
    }
  }
}
