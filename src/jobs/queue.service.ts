import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job, Queue, QueueEvents, Worker } from "bullmq";

export const QUEUE_NAMES = [
  "search-discovery",
  "email-ingestion",
  "normalize-signal",
  "deduplicate-signal",
  "classify-signal",
  "generate-reply",
  "send-notification",
  "daily-digest",
  "maintenance"
] as const;

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly queues = new Map<string, Queue>();
  private readonly queueEvents = new Map<string, QueueEvents>();
  private readonly workers = new Map<string, Worker>();
  private readonly handlers = new Map<string, (data: any) => Promise<unknown>>();

  constructor(private readonly config: ConfigService) {}

  register<T>(
    name: (typeof QUEUE_NAMES)[number],
    handler: (data: T) => Promise<unknown>
  ): void {
    this.handlers.set(name, handler);
    if (this.config.get("QUEUE_MODE", "inline") === "bullmq") {
      const worker = new Worker(
        name,
        async (job: Job) => handler(job.data as T),
        { connection: this.connection() }
      );
      worker.on("failed", (job, error) => {
        this.logger.error(
          `Queue ${name} job ${job?.id ?? "unknown"} failed`,
          error
        );
      });
      this.workers.set(name, worker);
    }
  }

  async enqueue(
    name: (typeof QUEUE_NAMES)[number],
    data: unknown
  ): Promise<unknown> {
    if (this.config.get("QUEUE_MODE", "inline") === "inline") {
      const handler = this.handlers.get(name);
      if (!handler) {
        this.logger.debug(`Inline queue event ${name}: ${JSON.stringify(data)}`);
        return undefined;
      }
      return handler(data);
    }
    let queue = this.queues.get(name);
    if (!queue) {
      queue = this.createQueue(name);
      this.queues.set(name, queue);
    }
    const job = await queue.add(name, data);
    return { queued: true, jobId: job.id };
  }

  async enqueueAndWait(
    name: (typeof QUEUE_NAMES)[number],
    data: unknown,
    timeoutMs = 120_000
  ): Promise<unknown> {
    if (this.config.get("QUEUE_MODE", "inline") === "inline") {
      return this.enqueue(name, data);
    }

    let queue = this.queues.get(name);
    if (!queue) {
      queue = this.createQueue(name);
      this.queues.set(name, queue);
    }
    let events = this.queueEvents.get(name);
    if (!events) {
      events = new QueueEvents(name, { connection: this.connection() });
      await events.waitUntilReady();
      this.queueEvents.set(name, events);
    }
    const job = await queue.add(name, data);
    return job.waitUntilFinished(events, timeoutMs);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([
      ...[...this.queues.values()].map((queue) => queue.close()),
      ...[...this.queueEvents.values()].map((events) => events.close()),
      ...[...this.workers.values()].map((worker) => worker.close())
    ]);
  }

  private createQueue(name: string): Queue {
    return new Queue(name, {
      connection: this.connection(),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 1_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000
      }
    });
  }

  private connection() {
    const redisUrl = new URL(this.config.getOrThrow<string>("REDIS_URL"));
    return {
      host: redisUrl.hostname,
      port: Number(redisUrl.port || 6379),
      username: redisUrl.username || undefined,
      password: redisUrl.password || undefined,
      tls: redisUrl.protocol === "rediss:" ? {} : undefined
    };
  }
}
