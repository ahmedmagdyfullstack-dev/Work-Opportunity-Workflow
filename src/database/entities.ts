import {
  Cascade,
  Collection,
  Entity,
  Enum,
  Index,
  JsonType,
  ManyToOne,
  OneToMany,
  OptionalProps,
  PrimaryKey,
  Property,
  Unique
} from "@mikro-orm/core";
import { randomUUID } from "node:crypto";
import type {
  ClassificationCategory,
  OpportunitySignalType,
  OpportunityStatus,
  Priority
} from "../domain/types";

@Entity({ tableName: "opportunities" })
@Unique({ properties: ["companyName", "normalizedRole"] })
export class Opportunity {
  [OptionalProps]?:
    | "id"
    | "status"
    | "firstSeenAt"
    | "lastSeenAt"
    | "createdAt"
    | "updatedAt";

  @PrimaryKey({ type: "uuid" })
  id: string = randomUUID();

  @Property({ type: "string", nullable: true })
  companyName?: string;

  @Property({ type: "string", nullable: true })
  roleTitle?: string;

  @Property({ type: "string", nullable: true })
  normalizedRole?: string;

  @Property({ type: "string", nullable: true })
  location?: string;

  @Property({ type: "string", nullable: true })
  sourceFirstSeen?: string;

  @Property({ type: "string", default: "new" })
  status: OpportunityStatus = "new";

  @Property({ type: "string", nullable: true })
  priority?: Priority;

  @Property({ type: "integer", nullable: true })
  matchScore?: number;

  @Property({ type: "string", nullable: true })
  linkedinUrl?: string;

  @Property({ type: "timestamptz" })
  firstSeenAt = new Date();

  @Property({ type: "timestamptz" })
  lastSeenAt = new Date();

  @Property({ nullable: true, type: "text" })
  notes?: string;

  @Property({ type: "timestamptz" })
  createdAt = new Date();

  @Property({ type: "timestamptz", onUpdate: () => new Date() })
  updatedAt = new Date();

  @OneToMany(() => OpportunitySignal, (signal) => signal.opportunity, {
    cascade: [Cascade.PERSIST]
  })
  signals = new Collection<OpportunitySignal>(this);
}

@Entity({ tableName: "opportunity_signals" })
export class OpportunitySignal {
  [OptionalProps]?: "id" | "receivedAt" | "createdAt";

  @PrimaryKey({ type: "uuid" })
  id: string = randomUUID();

  @ManyToOne(() => Opportunity, { nullable: true })
  opportunity?: Opportunity;

  @Property({ type: "string" })
  source!: string;

  @Property({ type: "string" })
  signalType!: OpportunitySignalType;

  @Property({ type: "string", nullable: true })
  senderName?: string;

  @Property({ type: "string", nullable: true })
  senderEmail?: string;

  @Property({ type: "string", nullable: true })
  authorName?: string;

  @Property({ type: "string", nullable: true })
  title?: string;

  @Property({ type: "string", nullable: true })
  subject?: string;

  @Property({ nullable: true, type: "text" })
  snippet?: string;

  @Property({ nullable: true, type: "text" })
  bodyText?: string;

  @Property({ nullable: true, type: "text" })
  url?: string;

  @Property({ type: JsonType, nullable: true })
  rawPayload?: Record<string, unknown>;

  @Index()
  @Property({ type: "string", nullable: true })
  externalId?: string;

  @Index()
  @Property({ type: "string", nullable: true })
  threadId?: string;

  @Index()
  @Property({ type: "string" })
  contentHash!: string;

  @Property({ type: "timestamptz" })
  receivedAt = new Date();

  @Property({ type: "timestamptz" })
  createdAt = new Date();

  @OneToMany(() => Classification, (item) => item.signal, {
    cascade: [Cascade.ALL]
  })
  classifications = new Collection<Classification>(this);

  @OneToMany(() => ReplySuggestion, (item) => item.signal, {
    cascade: [Cascade.ALL]
  })
  replySuggestions = new Collection<ReplySuggestion>(this);
}

@Entity({ tableName: "classifications" })
export class Classification {
  [OptionalProps]?: "id" | "createdAt";

  @PrimaryKey({ type: "uuid" })
  id: string = randomUUID();

  @ManyToOne(() => OpportunitySignal)
  signal!: OpportunitySignal;

  @Property({ type: "boolean" })
  isJobRelated!: boolean;

  @Property({ type: "boolean" })
  isRelevantToAhmed!: boolean;

  @Property({ type: "integer" })
  importanceScore!: number;

  @Enum({ items: () => ["high", "medium", "low", "ignore"] })
  priority!: Priority;

  @Property({ type: "string" })
  category!: ClassificationCategory;

  @Property({ type: "string", nullable: true })
  companyName?: string;

  @Property({ type: "string", nullable: true })
  roleTitle?: string;

  @Property({ type: "string", nullable: true })
  location?: string;

  @Property({ type: "boolean" })
  requiresAction!: boolean;

  @Property({ nullable: true, type: "timestamptz" })
  deadline?: Date;

  @Property({ type: "text" })
  summary!: string;

  @Property({ type: "text" })
  reason!: string;

  @Property({ type: JsonType })
  matchedSkills: string[] = [];

  @Property({ type: JsonType })
  missingInfo: string[] = [];

  @Property({ type: "text" })
  suggestedAction!: string;

  @Property({ type: "boolean" })
  suggestedReplyNeeded!: boolean;

  @Property({ type: "integer" })
  confidence!: number;

  @Property({ type: "boolean" })
  shouldNotifyNow!: boolean;

  @Property({ type: "boolean" })
  shouldIncludeInDigest!: boolean;

  @Property({ type: "timestamptz" })
  createdAt = new Date();
}

@Entity({ tableName: "reply_suggestions" })
export class ReplySuggestion {
  [OptionalProps]?: "id" | "tone" | "status" | "createdAt";

  @PrimaryKey({ type: "uuid" })
  id: string = randomUUID();

  @ManyToOne(() => OpportunitySignal)
  signal!: OpportunitySignal;

  @ManyToOne(() => Opportunity, { nullable: true })
  opportunity?: Opportunity;

  @Property({ type: "string" })
  suggestionType!: string;

  @Property({ type: "text" })
  suggestedReply!: string;

  @Property({ type: "text" })
  suggestedAction!: string;

  @Property({ type: "string", default: "professional_short_confident" })
  tone = "professional_short_confident";

  @Property({ type: JsonType })
  cvPointsUsed: string[] = [];

  @Property({ type: JsonType })
  riskNotes: string[] = [];

  @Property({ type: "string", default: "draft" })
  status = "draft";

  @Property({ type: "timestamptz" })
  createdAt = new Date();
}

@Entity({ tableName: "notifications" })
export class Notification {
  [OptionalProps]?: "id" | "createdAt";

  @PrimaryKey({ type: "uuid" })
  id: string = randomUUID();

  @ManyToOne(() => OpportunitySignal, { nullable: true })
  signal?: OpportunitySignal;

  @Property({ type: "string" })
  channel!: string;

  @Property({ type: "string" })
  recipient!: string;

  @Property({ type: "text" })
  messageText!: string;

  @Property({ type: "string" })
  status!: string;

  @Property({ type: JsonType, nullable: true })
  providerResponse?: Record<string, unknown>;

  @Property({ nullable: true, type: "timestamptz" })
  sentAt?: Date;

  @Property({ type: "timestamptz" })
  createdAt = new Date();
}

@Entity({ tableName: "profile_facts" })
@Unique({ properties: ["category", "key", "value"] })
export class ProfileFact {
  [OptionalProps]?: "id" | "weight" | "createdAt";

  @PrimaryKey({ type: "uuid" })
  id: string = randomUUID();

  @Property({ type: "string" })
  category!: string;

  @Property({ type: "string" })
  key!: string;

  @Property({ type: "string" })
  value!: string;

  @Property({ type: "integer", default: 1 })
  weight = 1;

  @Property({ type: "timestamptz" })
  createdAt = new Date();
}

@Entity({ tableName: "feedback" })
export class SignalFeedback {
  [OptionalProps]?: "id" | "createdAt";

  @PrimaryKey({ type: "uuid" })
  id: string = randomUUID();

  @ManyToOne(() => OpportunitySignal)
  signal!: OpportunitySignal;

  @Property({ type: "string" })
  feedback!: string;

  @Property({ nullable: true, type: "text" })
  notes?: string;

  @Property({ type: "timestamptz" })
  createdAt = new Date();
}

@Entity({ tableName: "checkpoints" })
export class Checkpoint {
  [OptionalProps]?: "updatedAt";

  @PrimaryKey({ type: "string" })
  key!: string;

  @Property({ type: "text" })
  value!: string;

  @Property({ type: "timestamptz", onUpdate: () => new Date() })
  updatedAt = new Date();
}

@Entity({ tableName: "audit_logs" })
export class AuditLog {
  [OptionalProps]?: "id" | "createdAt";

  @PrimaryKey({ type: "uuid" })
  id: string = randomUUID();

  @Property({ type: "string" })
  action!: string;

  @Property({ type: "string", nullable: true })
  entityType?: string;

  @Property({ type: "string", nullable: true })
  entityId?: string;

  @Property({ type: JsonType, nullable: true })
  metadata?: Record<string, unknown>;

  @Property({ type: "timestamptz" })
  createdAt = new Date();
}

export const ENTITIES = [
  Opportunity,
  OpportunitySignal,
  Classification,
  ReplySuggestion,
  Notification,
  ProfileFact,
  SignalFeedback,
  Checkpoint,
  AuditLog
];
