import { Elysia } from "elysia";

import env from "../../../env";
import {
  ackBody,
  ackResponse,
  balanceReportBody,
  balanceResponse,
  forecastQuery,
  forecastResponse,
  pollResponse,
  resumeResponse,
  sendSmsBody,
  sendSmsResponse,
  setTariffBody,
  setTariffResponse,
  smsModel,
  statusResponse,
  tariffListResponse,
} from "./model";
import { SmsService } from "./service";

// ─── SMS Controllers ─────────────────────────────────────────────
// Two controllers with different auth boundaries:
//
//   sms       → POST /api/v1/sms/send   (client, SECRET_KEY via group)
//   smsDevice → GET  /api/v1/sms/device/poll
//               POST /api/v1/sms/device/ack
//                                        (phone, SMS_DEVICE_KEY)
//
// The phone holds only the device key, never the master secret.
// ─────────────────────────────────────────────────────────────────

export const sms = new Elysia({ prefix: "/sms" })
  .use(smsModel)
  .post("/send", ({ body }) => SmsService.enqueue(body), {
    body: sendSmsBody,
    response: { 200: sendSmsResponse },
    detail: {
      summary: "Send SMS",
      description: "Queue an SMS for delivery via the paired device",
      tags: ["SMS"],
    },
  })
  .get("/balance", () => SmsService.getBalance(), {
    response: { 200: balanceResponse },
    detail: {
      summary: "Get SIM balance",
      description: "Last balance reported by the paired device",
      tags: ["SMS"],
    },
  })
  .post("/balance/refresh", () => SmsService.requestBalance(), {
    response: { 200: ackResponse },
    detail: {
      summary: "Request balance refresh",
      description: "Flag a USSD balance check for the device's next poll",
      tags: ["SMS"],
    },
  })
  .get("/status", () => SmsService.status(), {
    response: { 200: statusResponse },
    detail: {
      summary: "Get sending status",
      description: "Whether sending is paused by the circuit breaker",
      tags: ["SMS"],
    },
  })
  .post("/resume", () => SmsService.resume(), {
    response: { 200: resumeResponse },
    detail: {
      summary: "Resume sending",
      description: "Clear the breaker and release held jobs after a top-up",
      tags: ["SMS"],
    },
  })
  .get("/forecast", ({ query }) => SmsService.forecast(query.number), {
    query: forecastQuery,
    response: { 200: forecastResponse },
    detail: {
      summary: "Forecast send capacity",
      description:
        "Predict remaining SMS capacity per carrier from estimated balance; pass ?number= to check one destination",
      tags: ["SMS"],
    },
  })
  .get("/tariff", () => SmsService.listTariffs(), {
    response: { 200: tariffListResponse },
    detail: {
      summary: "List tariffs",
      description: "Per-destination-carrier SMS rates (Rp)",
      tags: ["SMS"],
    },
  })
  .post("/tariff", ({ body }) => SmsService.setTariff(body.carrier, body.rate), {
    body: setTariffBody,
    response: { 200: setTariffResponse },
    detail: {
      summary: "Set tariff",
      description: "Upsert the rate (Rp) for a destination carrier",
      tags: ["SMS"],
    },
  });

export const smsDevice = new Elysia({ prefix: "/api/v1/sms/device" })
  .use(smsModel)
  .onBeforeHandle(({ request, set }) => {
    const deviceKey =
      request.headers.get("x-device-key") ??
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

    if (deviceKey !== env.SMS_DEVICE_KEY) {
      set.status = 401;
      return { status: "error", code: 401, message: "Unauthorized" };
    }
  })
  .get("/poll", () => SmsService.poll(), {
    response: { 200: pollResponse },
    detail: {
      summary: "Poll pending SMS",
      description: "Device pulls and claims pending jobs",
      tags: ["SMS"],
    },
  })
  .post(
    "/ack",
    ({ body }) =>
      SmsService.ack(body.id, body.status, body.error, body.reason),
    {
      body: ackBody,
      response: { 200: ackResponse },
      detail: {
        summary: "Acknowledge SMS delivery",
        description:
          "Device reports a job as sent or failed; reason 'insufficient_balance' pauses sending",
        tags: ["SMS"],
      },
    },
  )
  .post(
    "/balance",
    ({ body }) =>
      SmsService.reportBalance(body.raw, body.balance, body.carrier),
    {
      body: balanceReportBody,
      response: { 200: ackResponse },
      detail: {
        summary: "Report SIM balance",
        description: "Device reports the parsed USSD balance result",
        tags: ["SMS"],
      },
    },
  );
