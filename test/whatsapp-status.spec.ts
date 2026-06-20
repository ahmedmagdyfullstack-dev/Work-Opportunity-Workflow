import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WhatsAppController } from "../src/notifications/whatsapp.controller";
import { WhatsAppService } from "../src/notifications/whatsapp.service";

describe("WhatsApp delivery tracking", () => {
  afterEach(() => vi.restoreAllMocks());

  it("extracts Meta's accepted message ID", () => {
    const service = new WhatsAppService(new ConfigService());
    expect(
      service.messageId({
        messaging_product: "whatsapp",
        messages: [{ id: "wamid.example" }]
      })
    ).toBe("wamid.example");
  });

  it("sends an approved alert template with one body parameter", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          messaging_product: "whatsapp",
          messages: [{ id: "wamid.example" }]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const service = new WhatsAppService(
      new ConfigService({
        WHATSAPP_PROVIDER: "meta",
        WHATSAPP_PHONE_NUMBER_ID: "phone-id",
        WHATSAPP_ACCESS_TOKEN: "token",
        WHATSAPP_TO_NUMBER: "201555796442",
        WHATSAPP_ALERT_TEMPLATE: "job_search_alert",
        WHATSAPP_TEMPLATE_LANGUAGE: "en_US"
      })
    );

    await service.sendAlert("Role: Senior Backend Engineer");

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      type: "template",
      template: {
        name: "job_search_alert",
        language: { code: "en_US" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "Role: Senior Backend Engineer" }
            ]
          }
        ]
      }
    });
  });

  it("records failed delivery details from the webhook", async () => {
    const notification = {
      status: "accepted",
      deliveryError: undefined as Record<string, unknown> | undefined
    };
    const em = {
      findOne: vi.fn(async () => notification),
      flush: vi.fn(async () => undefined)
    };
    const controller = new WhatsAppController(
      em as never,
      new ConfigService()
    );

    const response = await controller.status({
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  {
                    id: "wamid.example",
                    status: "failed",
                    timestamp: "1781910000",
                    recipient_id: "201555796442",
                    errors: [
                      {
                        code: 131047,
                        title: "Re-engagement message"
                      }
                    ]
                  }
                ]
              }
            }
          ]
        }
      ]
    });

    expect(em.findOne).toHaveBeenCalledWith(expect.anything(), {
      providerMessageId: "wamid.example"
    });
    expect(notification.status).toBe("failed");
    expect(notification.deliveryError).toMatchObject({
      errors: [{ code: 131047 }]
    });
    expect(response).toEqual({ accepted: true, statuses: 1 });
  });
});
