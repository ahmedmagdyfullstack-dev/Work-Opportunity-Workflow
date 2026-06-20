import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";

const add = vi.fn();
const waitUntilFinished = vi.fn();
const queueClose = vi.fn();
const eventsClose = vi.fn();
const waitUntilReady = vi.fn();

vi.mock("bullmq", () => ({
  Job: class {},
  Worker: class {
    on = vi.fn();
    close = vi.fn();
  },
  Queue: class {
    add = add;
    close = queueClose;
  },
  QueueEvents: class {
    waitUntilReady = waitUntilReady;
    close = eventsClose;
  }
}));

import { QueueService } from "../src/jobs/queue.service";

describe("QueueService", () => {
  afterEach(() => vi.clearAllMocks());

  it("waits for a BullMQ result when requested", async () => {
    add.mockResolvedValue({ id: "job-1", waitUntilFinished });
    waitUntilReady.mockResolvedValue(undefined);
    waitUntilFinished.mockResolvedValue({ found: 10 });
    const service = new QueueService(
      new ConfigService({
        QUEUE_MODE: "bullmq",
        REDIS_URL: "redis://localhost:6379"
      })
    );

    await expect(
      service.enqueueAndWait("search-discovery", { query: "test" }, 5_000)
    ).resolves.toEqual({ found: 10 });
    expect(waitUntilFinished).toHaveBeenCalledWith(expect.anything(), 5_000);

    await service.onModuleDestroy();
    expect(queueClose).toHaveBeenCalledOnce();
    expect(eventsClose).toHaveBeenCalledOnce();
  });

  it("runs inline handlers directly", async () => {
    const service = new QueueService(
      new ConfigService({ QUEUE_MODE: "inline" })
    );
    service.register("search-discovery", async () => ({ found: 4 }));

    await expect(
      service.enqueueAndWait("search-discovery", { query: "test" })
    ).resolves.toEqual({ found: 4 });
  });
});
