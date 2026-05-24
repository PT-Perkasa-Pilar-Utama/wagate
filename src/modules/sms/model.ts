import { Elysia, t } from "elysia";

// ─── Request Models ──────────────────────────────────────────────
export const sendSmsBody = t.Object({
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

export const ackBody = t.Object({
  id: t.String({ error: "Job id is required" }),
  status: t.Union([t.Literal("sent"), t.Literal("failed")], {
    error: "Status must be 'sent' or 'failed'",
  }),
  error: t.Optional(t.String()),
  // "insufficient_balance" trips the circuit breaker (pauses sending)
  reason: t.Optional(t.String()),
});

export const balanceReportBody = t.Object({
  raw: t.String({ minLength: 1, error: "raw USSD response is required" }),
  balance: t.Optional(t.String()),
  carrier: t.Optional(t.String()),
});

// ─── Response Models ─────────────────────────────────────────────
export const sendSmsResponse = t.Object({
  status: t.Literal("success"),
  code: t.Number(),
  message: t.String(),
  data: t.Object({
    id: t.String(),
    number: t.String(),
    content: t.String(),
    status: t.String(),
  }),
});

export const pollResponse = t.Object({
  status: t.Literal("success"),
  code: t.Number(),
  // true → the phone should run a USSD balance check and report it back
  balanceRequested: t.Boolean(),
  data: t.Array(
    t.Object({
      id: t.String(),
      number: t.String(),
      content: t.String(),
    }),
  ),
});

export const ackResponse = t.Object({
  status: t.Literal("success"),
  code: t.Number(),
  message: t.String(),
});

export const balanceResponse = t.Object({
  status: t.Literal("success"),
  code: t.Number(),
  data: t.Object({
    balance: t.Union([t.String(), t.Null()]),
    raw: t.Union([t.String(), t.Null()]),
    carrier: t.Union([t.String(), t.Null()]),
    checked_at: t.Union([t.Number(), t.Null()]),
    stale: t.Boolean(),
  }),
});

export const resumeResponse = t.Object({
  status: t.Literal("success"),
  code: t.Number(),
  message: t.String(),
  data: t.Object({ released: t.Number() }),
});

export const statusResponse = t.Object({
  status: t.Literal("success"),
  code: t.Number(),
  data: t.Object({
    paused: t.Boolean(),
    reason: t.Union([t.String(), t.Null()]),
    paused_at: t.Union([t.Number(), t.Null()]),
  }),
});

export const forecastQuery = t.Object({
  number: t.Optional(t.String()),
});

const tariffRow = t.Object({ carrier: t.String(), rate: t.Number() });

export const forecastResponse = t.Object({
  status: t.Literal("success"),
  code: t.Number(),
  data: t.Object({
    known: t.Boolean(),
    estimated_balance: t.Union([t.Number(), t.Null()]),
    carriers: t.Array(
      t.Object({
        carrier: t.String(),
        rate: t.Number(),
        capacity: t.Union([t.Number(), t.Null()]),
      }),
    ),
    target: t.Optional(
      t.Object({
        number: t.String(),
        carrier: t.String(),
        rate: t.Number(),
        affordable: t.Union([t.Boolean(), t.Null()]),
      }),
    ),
  }),
});

export const setTariffBody = t.Object({
  carrier: t.String({ minLength: 1, error: "carrier is required" }),
  rate: t.Integer({ minimum: 0, error: "rate must be a non-negative integer" }),
});

export const tariffListResponse = t.Object({
  status: t.Literal("success"),
  code: t.Number(),
  data: t.Array(tariffRow),
});

export const setTariffResponse = t.Object({
  status: t.Literal("success"),
  code: t.Number(),
  message: t.String(),
  data: t.Array(tariffRow),
});

// ─── Types ───────────────────────────────────────────────────────
export type SendSmsBody = typeof sendSmsBody.static;
export type AckBody = typeof ackBody.static;
export type BalanceReportBody = typeof balanceReportBody.static;
export type SetTariffBody = typeof setTariffBody.static;

// ─── Reference Model Plugin ─────────────────────────────────────
export const smsModel = new Elysia({ name: "sms.model" }).model({
  "sms.send": sendSmsBody,
  "sms.ack": ackBody,
  "sms.balanceReport": balanceReportBody,
  "sms.sendResponse": sendSmsResponse,
  "sms.pollResponse": pollResponse,
  "sms.ackResponse": ackResponse,
  "sms.balanceResponse": balanceResponse,
  "sms.resumeResponse": resumeResponse,
  "sms.statusResponse": statusResponse,
  "sms.forecastResponse": forecastResponse,
  "sms.setTariff": setTariffBody,
  "sms.tariffListResponse": tariffListResponse,
  "sms.setTariffResponse": setTariffResponse,
});
