import {
  BadRequestException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { EntityManager } from "@mikro-orm/core";
import {
  AuditLog,
  Classification,
  Notification,
  Opportunity,
  OpportunitySignal,
  ReplySuggestion,
  SignalFeedback,
  ProfileFact
} from "../database/entities";
import type {
  ClassificationResult,
  Decision,
  NormalizedSignalInput,
  OpportunityStatus
} from "../domain/types";
import { ClassificationService } from "../ai/classification.service";
import { ReplySuggestionService } from "../ai/reply-suggestion.service";
import { DecisionEngineService } from "../notifications/decision-engine.service";
import { NotificationFormatterService } from "../notifications/notification-formatter.service";
import { WhatsAppService } from "../notifications/whatsapp.service";
import { DeduplicationService } from "./deduplication.service";

@Injectable()
export class OpportunityService {
  constructor(
    private readonly em: EntityManager,
    private readonly dedup: DeduplicationService,
    private readonly classifier: ClassificationService,
    private readonly replies: ReplySuggestionService,
    private readonly decisionEngine: DecisionEngineService,
    private readonly formatter: NotificationFormatterService,
    private readonly whatsapp: WhatsAppService
  ) {}

  async ingest(input: NormalizedSignalInput): Promise<{
    duplicate: boolean;
    signal: OpportunitySignal;
    classification?: Classification;
    reply?: ReplySuggestion;
    decision?: Decision;
    notification?: Notification;
  }> {
    this.validate(input);
    input.receivedAt ??= new Date();
    const contentHash = this.dedup.contentHash(input);
    const duplicate = await this.findDuplicate(input, contentHash);
    if (duplicate) return { duplicate: true, signal: duplicate };

    const result = await this.classifier.classify(input);
    const signal = this.em.create(OpportunitySignal, {
      ...input,
      rawPayload: input.rawPayload ?? {},
      contentHash,
      receivedAt: input.receivedAt
    });
    const opportunity = await this.findOrCreateOpportunity(input, result);
    signal.opportunity = opportunity;
    const classification = this.toEntity(signal, result);
    const reply = result.suggestedReplyNeeded
      ? this.createReply(signal, opportunity, input, result)
      : undefined;
    const decision = this.decisionEngine.decide(input, result);

    this.em.persist([signal, classification]);
    if (reply) this.em.persist(reply);
    this.em.persist(
      this.em.create(AuditLog, {
        action: "signal.ingested",
        entityType: "OpportunitySignal",
        entityId: signal.id,
        metadata: { source: input.source, decision }
      })
    );
    await this.em.flush();

    let notification: Notification | undefined;
    if (decision === "notify_now") {
      notification = await this.deliver(signal, classification, reply);
    }

    return {
      duplicate: false,
      signal,
      classification,
      reply,
      decision,
      notification
    };
  }

  async listOpportunities(): Promise<Opportunity[]> {
    return this.em.find(
      Opportunity,
      {},
      { orderBy: { lastSeenAt: "DESC" }, populate: ["signals"] }
    );
  }

  async getOpportunity(id: string): Promise<Opportunity> {
    const item = await this.em.findOne(
      Opportunity,
      { id },
      { populate: ["signals.classifications", "signals.replySuggestions"] }
    );
    if (!item) throw new NotFoundException("Opportunity not found");
    return item;
  }

  async listSignals(onlyNeedsAction = false): Promise<OpportunitySignal[]> {
    const signals = await this.em.find(
      OpportunitySignal,
      {},
      {
        populate: ["opportunity", "classifications", "replySuggestions"],
        orderBy: { receivedAt: "DESC" }
      }
    );
    if (!onlyNeedsAction) return signals;
    return signals.filter((signal) =>
      signal.classifications.getItems().some((item) => item.requiresAction)
    );
  }

  async getSignal(id: string): Promise<OpportunitySignal> {
    const signal = await this.em.findOne(
      OpportunitySignal,
      { id },
      {
        populate: [
          "opportunity",
          "classifications",
          "replySuggestions"
        ]
      }
    );
    if (!signal) throw new NotFoundException("Signal not found");
    return signal;
  }

  async addFeedback(
    id: string,
    feedback: string,
    notes?: string
  ): Promise<SignalFeedback> {
    const allowed = [
      "important",
      "not_important",
      "bad_reply",
      "good_reply",
      "ignore_sender",
      "always_notify_sender"
    ];
    if (!allowed.includes(feedback)) {
      throw new BadRequestException(`feedback must be one of: ${allowed.join(", ")}`);
    }
    const signal = await this.getSignal(id);
    const item = this.em.create(SignalFeedback, { signal, feedback, notes });
    if (signal.opportunity) {
      if (feedback === "important") signal.opportunity.priority = "high";
      if (feedback === "not_important") signal.opportunity.priority = "low";
      if (feedback === "ignore_sender") signal.opportunity.status = "ignored";
    }
    if (
      signal.senderEmail &&
      (feedback === "ignore_sender" || feedback === "always_notify_sender")
    ) {
      const key = feedback === "ignore_sender" ? "ignore" : "always_notify";
      const existing = await this.em.findOne(ProfileFact, {
        category: "sender_rule",
        key,
        value: signal.senderEmail
      });
      if (!existing) {
        this.em.persist(
          this.em.create(ProfileFact, {
            category: "sender_rule",
            key,
            value: signal.senderEmail,
            weight: 10
          })
        );
      }
    }
    this.em.persist(item);
    await this.em.flush();
    return item;
  }

  async regenerateReply(id: string): Promise<ReplySuggestion> {
    const signal = await this.getSignal(id);
    const classification = signal.classifications.getItems().at(-1);
    if (!classification) throw new BadRequestException("Signal is not classified");
    const input = this.fromEntity(signal);
    const result = this.fromClassification(classification);
    const reply = this.createReply(signal, signal.opportunity, input, result);
    this.em.persist(reply);
    await this.em.flush();
    return reply;
  }

  async markDone(
    id: string,
    status: OpportunityStatus = "closed"
  ): Promise<OpportunitySignal> {
    const signal = await this.getSignal(id);
    if (signal.opportunity) signal.opportunity.status = status;
    for (const reply of signal.replySuggestions) reply.status = "used";
    await this.em.flush();
    return signal;
  }

  private async findDuplicate(
    input: NormalizedSignalInput,
    contentHash: string
  ): Promise<OpportunitySignal | null> {
    const or: Record<string, unknown>[] = [{ contentHash }];
    if (input.externalId) or.push({ externalId: input.externalId });
    if (input.url) or.push({ url: input.url });
    if (input.threadId && input.subject) {
      or.push({ threadId: input.threadId, subject: input.subject });
    }
    return this.em.findOne(OpportunitySignal, { $or: or });
  }

  private async findOrCreateOpportunity(
    input: NormalizedSignalInput,
    result: ClassificationResult
  ): Promise<Opportunity> {
    const company =
      result.companyName ||
      input.senderName ||
      this.companyFromEmail(input.senderEmail) ||
      "Unknown";
    const role = result.roleTitle || input.title || "Unspecified opportunity";
    const normalizedRole = this.dedup.normalizeRole(role);
    let opportunity = await this.em.findOne(Opportunity, {
      companyName: company,
      normalizedRole
    });
    if (!opportunity) {
      opportunity = this.em.create(Opportunity, {
        companyName: company,
        roleTitle: role,
        normalizedRole,
        location: result.location ?? undefined,
        sourceFirstSeen: input.source,
        priority: result.priority,
        matchScore: result.importanceScore,
        linkedinUrl: input.url?.includes("linkedin.com") ? input.url : undefined,
        status: result.requiresAction ? "needs_reply" : "new"
      });
      this.em.persist(opportunity);
    } else {
      opportunity.lastSeenAt = new Date();
      opportunity.matchScore = Math.max(
        opportunity.matchScore ?? 0,
        result.importanceScore
      );
      opportunity.priority = result.priority;
      if (result.requiresAction) opportunity.status = "needs_reply";
    }
    return opportunity;
  }

  private toEntity(
    signal: OpportunitySignal,
    result: ClassificationResult
  ): Classification {
    return this.em.create(Classification, {
      signal,
      isJobRelated: result.isJobRelated,
      isRelevantToAhmed: result.isRelevantToAhmed,
      importanceScore: result.importanceScore,
      priority: result.priority,
      category: result.category,
      companyName: result.companyName ?? undefined,
      roleTitle: result.roleTitle ?? undefined,
      location: result.location ?? undefined,
      requiresAction: result.requiresAction,
      deadline: result.deadline ? new Date(result.deadline) : undefined,
      summary: result.summary,
      reason: result.reason,
      matchedSkills: result.matchedSkills,
      missingInfo: result.missingInfo,
      suggestedAction: result.suggestedAction,
      suggestedReplyNeeded: result.suggestedReplyNeeded,
      confidence: result.confidence,
      shouldNotifyNow: result.shouldNotifyNow,
      shouldIncludeInDigest: result.shouldIncludeInDigest
    });
  }

  private createReply(
    signal: OpportunitySignal,
    opportunity: Opportunity | undefined,
    input: NormalizedSignalInput,
    result: ClassificationResult
  ): ReplySuggestion {
    const suggestion = this.replies.generate(input, result);
    return this.em.create(ReplySuggestion, {
      signal,
      opportunity,
      suggestionType: suggestion.suggestionType,
      suggestedReply: suggestion.suggestedReply,
      suggestedAction: suggestion.suggestedAction,
      cvPointsUsed: suggestion.keyPointsUsed,
      riskNotes: suggestion.riskNotes
    });
  }

  private async deliver(
    signal: OpportunitySignal,
    classification: Classification,
    reply?: ReplySuggestion
  ): Promise<Notification> {
    const message = this.formatter.format(signal, classification, reply);
    const notification = this.em.create(Notification, {
      signal,
      channel: "whatsapp",
      recipient: process.env.WHATSAPP_TO_NUMBER || "configured-recipient",
      messageText: message,
      status: "pending"
    });
    this.em.persist(notification);
    try {
      notification.providerResponse = await this.whatsapp.sendAlert(message);
      notification.providerMessageId = this.whatsapp.messageId(
        notification.providerResponse
      );
      notification.status = notification.providerMessageId
        ? "accepted"
        : "sent";
      notification.sentAt = new Date();
    } catch (error) {
      notification.status = "failed";
      notification.providerResponse = { error: (error as Error).message };
    }
    await this.em.flush();
    return notification;
  }

  private validate(input: NormalizedSignalInput): void {
    if (!input.source) throw new BadRequestException("source is required");
    if (!input.signalType) throw new BadRequestException("signalType is required");
    if (!input.title && !input.subject && !input.snippet && !input.bodyText) {
      throw new BadRequestException("signal content is required");
    }
  }

  private companyFromEmail(email?: string | null): string | null {
    const domain = email?.split("@")[1];
    if (!domain || /gmail|outlook|hotmail|yahoo|linkedin/.test(domain)) return null;
    return domain.split(".")[0].replace(/(^\w|-\w)/g, (value) =>
      value.replace("-", " ").toUpperCase()
    );
  }

  private fromEntity(signal: OpportunitySignal): NormalizedSignalInput {
    return {
      source: signal.source,
      signalType: signal.signalType,
      senderName: signal.senderName,
      senderEmail: signal.senderEmail,
      authorName: signal.authorName,
      title: signal.title,
      subject: signal.subject,
      snippet: signal.snippet,
      bodyText: signal.bodyText,
      url: signal.url,
      rawPayload: signal.rawPayload,
      externalId: signal.externalId,
      threadId: signal.threadId,
      receivedAt: signal.receivedAt
    };
  }

  private fromClassification(item: Classification): ClassificationResult {
    return {
      isJobRelated: item.isJobRelated,
      isRelevantToAhmed: item.isRelevantToAhmed,
      importanceScore: item.importanceScore,
      priority: item.priority,
      category: item.category,
      companyName: item.companyName ?? null,
      roleTitle: item.roleTitle ?? null,
      location: item.location ?? null,
      requiresAction: item.requiresAction,
      deadline: item.deadline?.toISOString() ?? null,
      summary: item.summary,
      reason: item.reason,
      matchedSkills: item.matchedSkills,
      missingInfo: item.missingInfo,
      suggestedAction: item.suggestedAction,
      suggestedReplyNeeded: item.suggestedReplyNeeded,
      confidence: item.confidence,
      shouldNotifyNow: item.shouldNotifyNow,
      shouldIncludeInDigest: item.shouldIncludeInDigest
    };
  }
}
