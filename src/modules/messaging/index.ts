import { Elysia } from "elysia";

import logger from "../../helper/logger";
import { wagatePlugin } from "../../plugins/wagate";
import { messagingModel, sendMediaBody, sendTextBody, successResponse } from "./model";
import { Orchestrator } from "./orchestrator";

// ─── Messaging Controller ────────────────────────────────────────
// 1 Elysia instance = 1 controller
// Handles: POST /send (text), POST /send/media (file upload)
//
// Both endpoints delegate to the Orchestrator which runs the
// full anti-ban pipeline (warm-up → deliver) asynchronously.
// ─────────────────────────────────────────────────────────────────

export const messaging = new Elysia({ prefix: "/send" })
  .use(wagatePlugin)
  .use(messagingModel)
  .post(
    "/",
    ({ body, wa1, wa2 }) => {
      Orchestrator.execute(wa1, wa2, {
        content: body.content,
        number: body.number,
      }).catch((err) => {
        logger.error("[controller] Orchestrator error:", err);
      });

      return {
        status: "success" as const,
        code: 200,
        message: "Message queued for delivery",
        data: {
          number: body.number,
          content: body.content,
          type: "text",
        },
      };
    },
    {
      body: sendTextBody,
      response: {
        200: successResponse,
      },
      detail: {
        summary: "Send Text Message",
        description:
          "Queue a text message for delivery via anti-ban orchestration",
        tags: ["Messaging"],
      },
    },
  )
  .post(
    "/media",
    ({ body, wa1, wa2 }) => {
      Orchestrator.execute(wa1, wa2, {
        content: body.content || "",
        number: body.number,
        file: body.file,
      }).catch((err) => {
        logger.error("[controller] Orchestrator error:", err);
      });

      return {
        status: "success" as const,
        code: 200,
        message: "Message queued for delivery",
        data: {
          number: body.number,
          content: body.content || "",
          type: "media",
        },
      };
    },
    {
      body: sendMediaBody,
      response: {
        200: successResponse,
      },
      detail: {
        summary: "Send Media Message",
        description:
          "Queue a media file with optional caption for delivery via anti-ban orchestration",
        tags: ["Messaging"],
      },
    },
  );
