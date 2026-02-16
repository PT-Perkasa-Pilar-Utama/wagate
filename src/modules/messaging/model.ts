import { Elysia, t } from "elysia";

// ─── Request Models ──────────────────────────────────────────────
export const sendTextBody = t.Object({
  number: t.String({
    minLength: 10,
    maxLength: 15,
    pattern: "^[0-9]+$",
    error: "Phone number is not valid! Format: 62...",
  }),
  content: t.String({
    minLength: 1,
    error: "No message content provided!",
  }),
});

export const sendMediaBody = t.Object({
  number: t.String({
    minLength: 10,
    maxLength: 15,
    pattern: "^[0-9]+$",
    error: "Phone number is not valid! Format: 62...",
  }),
  content: t.Optional(t.String({ default: "" })),
  file: t.File({
    error: "No file were provided!",
  }),
});

// ─── Response Models ─────────────────────────────────────────────
export const successResponse = t.Object({
  status: t.Literal("success"),
  code: t.Number(),
  message: t.String(),
  data: t.Object({
    number: t.String(),
    content: t.String(),
    type: t.String(),
  }),
});

export const errorResponse = t.Object({
  status: t.Literal("error"),
  code: t.Number(),
  message: t.String(),
});

// ─── Types ───────────────────────────────────────────────────────
export type SendTextBody = typeof sendTextBody.static;
export type SendMediaBody = typeof sendMediaBody.static;
export type SuccessResponse = typeof successResponse.static;
export type ErrorResponse = typeof errorResponse.static;

// ─── Reference Model Plugin ─────────────────────────────────────
export const messagingModel = new Elysia({ name: "messaging.model" }).model({
  "messaging.sendText": sendTextBody,
  "messaging.sendMedia": sendMediaBody,
  "messaging.success": successResponse,
  "messaging.error": errorResponse,
});
