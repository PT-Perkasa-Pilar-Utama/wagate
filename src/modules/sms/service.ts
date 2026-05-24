import { detectCarrier } from "../../helper/carrier";
import logger from "../../helper/logger";
import {
  SmsBalance,
  SmsQueue,
  SmsState,
  SmsTariff,
} from "../../lib/sms-queue";
import type { SendSmsBody } from "./model";

// Failure reason that trips the circuit breaker: stop dispatching into a
// SIM that can't pay, hold the job, and re-check balance.
const INSUFFICIENT_BALANCE = "insufficient_balance";

// ─── SMS Service ────────────────────────────────────────────────
// Business logic decoupled from the Elysia controller. The data
// center never talks to the phone directly — it only enqueues work
// and settles jobs the phone reports back.
// ─────────────────────────────────────────────────────────────────

export abstract class SmsService {
  static enqueue({ number, content }: SendSmsBody) {
    const carrier = detectCarrier(number);
    const cost = SmsTariff.rateFor(carrier);
    const job = SmsQueue.enqueue(number, content, cost, carrier);
    logger.info(`[sms] queued ${job.id} → ${number} (${carrier}, Rp${cost})`);

    return {
      status: "success" as const,
      code: 200,
      message: "SMS queued for delivery",
      data: {
        id: job.id,
        number: job.number,
        content: job.content,
        status: job.status,
      },
    };
  }

  static poll() {
    // While paused, withhold jobs so nothing dispatches into a dead SIM —
    // but still let a balance re-check through.
    const paused = SmsState.isPaused();
    const jobs = paused ? [] : SmsQueue.claimPending();
    const balanceRequested = SmsBalance.isRefreshRequested();
    if (jobs.length > 0) {
      logger.info(`[sms] dispatched ${jobs.length} job(s) to device`);
    }

    return {
      status: "success" as const,
      code: 200,
      balanceRequested,
      data: jobs.map((j) => ({
        id: j.id,
        number: j.number,
        content: j.content,
      })),
    };
  }

  static ack(
    id: string,
    status: "sent" | "failed",
    error?: string,
    reason?: string,
  ) {
    // Insufficient balance: hold the job, trip the breaker, re-check balance.
    if (status === "failed" && reason === INSUFFICIENT_BALANCE) {
      SmsQueue.hold(id, reason);
      SmsState.pause(reason);
      SmsBalance.requestRefresh();
      logger.warn(`[sms] ${id} held — sending paused (insufficient balance)`);
      return {
        status: "success" as const,
        code: 200,
        message: "Held — sending paused (insufficient balance)",
      };
    }

    SmsQueue.ack(id, status, error);
    logger.info(`[sms] ack ${id} → ${status}${error ? `: ${error}` : ""}`);

    return {
      status: "success" as const,
      code: 200,
      message: "Acknowledged",
    };
  }

  static resume() {
    SmsState.resume();
    const released = SmsQueue.releaseHeld();
    logger.info(`[sms] sending resumed — released ${released} held job(s)`);

    return {
      status: "success" as const,
      code: 200,
      message: "Sending resumed",
      data: { released },
    };
  }

  static status() {
    return {
      status: "success" as const,
      code: 200,
      data: SmsState.get(),
    };
  }

  static requestBalance() {
    SmsBalance.requestRefresh();
    logger.info("[sms] balance refresh requested");

    return {
      status: "success" as const,
      code: 200,
      message: "Balance check requested",
    };
  }

  static getBalance() {
    return {
      status: "success" as const,
      code: 200,
      data: SmsBalance.get(),
    };
  }

  static reportBalance(raw: string, balance?: string, carrier?: string) {
    SmsBalance.report(balance ?? null, raw, carrier ?? null);
    logger.info(`[sms] balance reported: ${balance ?? "(unparsed)"} ${carrier ?? ""}`);

    return {
      status: "success" as const,
      code: 200,
      message: "Balance recorded",
    };
  }

  // Predict remaining send capacity from the estimated balance and tariffs.
  // Capacity is null when no balance has been reported yet.
  static forecast(number?: string) {
    const { known, value } = SmsBalance.estimated();
    const cap = (rate: number) =>
      known && value !== null ? Math.max(0, Math.floor(value / rate)) : null;

    const carriers = SmsTariff.all().map(({ carrier, rate }) => ({
      carrier,
      rate,
      capacity: cap(rate),
    }));

    const target = number
      ? (() => {
          const carrier = detectCarrier(number);
          const rate = SmsTariff.rateFor(carrier);
          return {
            number,
            carrier,
            rate,
            affordable: known && value !== null ? value >= rate : null,
          };
        })()
      : undefined;

    return {
      status: "success" as const,
      code: 200,
      data: {
        known,
        estimated_balance: value,
        carriers,
        ...(target ? { target } : {}),
      },
    };
  }

  static listTariffs() {
    return {
      status: "success" as const,
      code: 200,
      data: SmsTariff.all(),
    };
  }

  static setTariff(carrier: string, rate: number) {
    SmsTariff.set(carrier, rate);
    logger.info(`[sms] tariff set: ${carrier} = Rp${rate}`);

    return {
      status: "success" as const,
      code: 200,
      message: "Tariff updated",
      data: SmsTariff.all(),
    };
  }
}
