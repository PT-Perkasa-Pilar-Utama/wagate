import { Elysia } from "elysia";

import { wagatePlugin } from "../../plugins/wagate";
import { messagingModel, sendMediaBody, sendTextBody, successResponse } from "./model";
import { MessagingService } from "./service";

// ─── Messaging Controller ────────────────────────────────────────
// 1 Elysia instance = 1 controller
// Handles: POST /send (text), POST /send/media (file upload)
// ─────────────────────────────────────────────────────────────────

export const messaging = new Elysia({ prefix: "/send" })
  .use(wagatePlugin)
  .use(messagingModel)
  .post(
    "/",
    ({ body, wagate }) => MessagingService.sendText(wagate, body),
    {
      body: sendTextBody,
      response: {
        200: successResponse,
      },
      detail: {
        summary: "Send Text Message",
        description: "Send a text message to a WhatsApp number",
        tags: ["Messaging"],
      },
    },
  )
  .post(
    "/media",
    ({ body, wagate }) => MessagingService.sendMedia(wagate, body),
    {
      body: sendMediaBody,
      response: {
        200: successResponse,
      },
      detail: {
        summary: "Send Media Message",
        description: "Send a media file with optional caption to a WhatsApp number",
        tags: ["Messaging"],
      },
    },
  );
