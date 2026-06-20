import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import { GmailService } from "../src/email/gmail.service";

function entityManager(checkpointValue = "100") {
  const checkpoint = { key: "gmail.historyId", value: checkpointValue };
  return {
    checkpoint,
    em: {
      findOne: vi.fn(async () => checkpoint),
      create: vi.fn((_entity, data) => data),
      persist: vi.fn(),
      flush: vi.fn(async () => undefined)
    }
  };
}

describe("GmailService history processing", () => {
  it("skips a deleted message and advances the checkpoint", async () => {
    const { checkpoint, em } = entityManager();
    const service = new GmailService(new ConfigService(), em as never);
    const gmail = {
      users: {
        history: {
          list: vi.fn(async () => ({
            data: {
              historyId: "105",
              history: [
                {
                  messagesAdded: [
                    { message: { id: "deleted-message" } },
                    { message: { id: "available-message" } }
                  ]
                }
              ]
            }
          }))
        },
        messages: {
          get: vi.fn(async ({ id }: { id: string }) => {
            if (id === "deleted-message") {
              throw Object.assign(new Error("not found"), { code: 404 });
            }
            return {
              data: {
                id,
                threadId: "thread-1",
                internalDate: "1781990000000",
                snippet: "Interview invitation",
                payload: {
                  headers: [
                    { name: "From", value: "Recruiter <recruiter@example.com>" },
                    { name: "Subject", value: "Interview" }
                  ]
                }
              }
            };
          })
        }
      }
    };
    vi.spyOn(service as never, "client").mockReturnValue(gmail);

    const emails = await service.fetchChangedMessages("105");

    expect(emails).toHaveLength(1);
    expect(emails[0].externalId).toBe("available-message");
    expect(checkpoint.value).toBe("105");
    expect(em.flush).toHaveBeenCalled();
  });

  it("resynchronizes when the Gmail history checkpoint has expired", async () => {
    const { checkpoint, em } = entityManager("50");
    const service = new GmailService(new ConfigService(), em as never);
    const gmail = {
      users: {
        history: {
          list: vi.fn(async () => {
            throw Object.assign(new Error("history not found"), {
              response: { status: 404 }
            });
          })
        },
        messages: { get: vi.fn() }
      }
    };
    vi.spyOn(service as never, "client").mockReturnValue(gmail);

    await expect(service.fetchChangedMessages("200")).resolves.toEqual([]);
    expect(checkpoint.value).toBe("200");
    expect(gmail.users.messages.get).not.toHaveBeenCalled();
  });

  it("still throws non-404 Gmail failures for Pub/Sub retry", async () => {
    const { em } = entityManager();
    const service = new GmailService(new ConfigService(), em as never);
    vi.spyOn(service as never, "client").mockReturnValue({
      users: {
        history: {
          list: vi.fn(async () => {
            throw Object.assign(new Error("rate limited"), { code: 429 });
          })
        }
      }
    });

    await expect(service.fetchChangedMessages("105")).rejects.toThrow(
      "rate limited"
    );
  });
});
