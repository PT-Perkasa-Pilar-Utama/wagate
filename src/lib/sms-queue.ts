import { Database } from "bun:sqlite";

import { type Carrier, parseRupiah } from "../helper/carrier";
import logger from "../helper/logger";

// ─── SMS Queue ───────────────────────────────────────────────────
// Persistent outbound queue backed by bun:sqlite. The phone (a real
// device on a private network) cannot be reached from the data
// center, so the flow is inverted: the API enqueues jobs here and the
// phone pulls them via the poll endpoint, then reports back via ack.
//
// Lifecycle: pending → dispatched → sent | failed
// Stale "dispatched" jobs (phone crashed mid-send) are requeued.
// ─────────────────────────────────────────────────────────────────

export type SmsStatus =
  | "pending"
  | "dispatched"
  | "sent"
  | "failed"
  | "held";

export interface SmsJob {
  id: string;
  number: string;
  content: string;
  status: SmsStatus;
  error: string | null;
  cost: number;
  dest_carrier: string;
  created_at: number;
  updated_at: number;
}

// Jobs left "dispatched" longer than this are assumed lost and requeued.
const STALE_DISPATCH_MS = 60_000;

// Predicted unaffordable sends are held under this reason (vs the phone's
// reported "insufficient_balance"); both pause sending.
export const PREDICTED_INSUFFICIENT = "predicted_insufficient_balance";

// Fallback rate (Rp) when no tariff row matches — deliberately high so an
// unconfigured carrier errs toward caution.
const FALLBACK_RATE = 500;

const db = new Database("logs/sms-queue.sqlite", { create: true });
db.exec("PRAGMA journal_mode = WAL;");
db.exec(`
  CREATE TABLE IF NOT EXISTS sms_jobs (
    id           TEXT PRIMARY KEY,
    number       TEXT NOT NULL,
    content      TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending',
    error        TEXT,
    cost         INTEGER NOT NULL DEFAULT 0,
    dest_carrier TEXT NOT NULL DEFAULT 'unknown',
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
  );
`);
db.exec(
  "CREATE INDEX IF NOT EXISTS idx_sms_jobs_status ON sms_jobs (status, created_at);",
);
db.exec(`
  CREATE TABLE IF NOT EXISTS sms_balance (
    id                INTEGER PRIMARY KEY CHECK (id = 1),
    balance           TEXT,
    balance_value     INTEGER,
    raw               TEXT,
    carrier           TEXT,
    checked_at        INTEGER,
    refresh_requested INTEGER NOT NULL DEFAULT 0,
    requested_at      INTEGER
  );
`);
db.run("INSERT OR IGNORE INTO sms_balance (id) VALUES (1);");
db.exec(`
  CREATE TABLE IF NOT EXISTS sms_state (
    id        INTEGER PRIMARY KEY CHECK (id = 1),
    paused    INTEGER NOT NULL DEFAULT 0,
    reason    TEXT,
    paused_at INTEGER
  );
`);
db.run("INSERT OR IGNORE INTO sms_state (id) VALUES (1);");
db.exec(`
  CREATE TABLE IF NOT EXISTS sms_tariff (
    carrier TEXT PRIMARY KEY,
    rate    INTEGER NOT NULL
  );
`);
// Placeholder rates (Rp) — update to your real per-destination tariffs.
for (const [carrier, rate] of Object.entries({
  telkomsel: 350,
  indosat: 350,
  xl: 350,
  axis: 350,
  tri: 350,
  smartfren: 350,
  unknown: FALLBACK_RATE,
})) {
  db.run("INSERT OR IGNORE INTO sms_tariff (carrier, rate) VALUES (?, ?)", [
    carrier,
    rate,
  ]);
}

// A reported balance older than this is flagged stale to the client.
const BALANCE_STALE_MS = 24 * 60 * 60 * 1000;

export interface BalanceSnapshot {
  balance: string | null;
  raw: string | null;
  carrier: string | null;
  checked_at: number | null;
  stale: boolean;
}

export abstract class SmsQueue {
  static enqueue(
    number: string,
    content: string,
    cost: number,
    destCarrier: Carrier,
  ): SmsJob {
    const now = Date.now();
    const job: SmsJob = {
      id: crypto.randomUUID(),
      number,
      content,
      status: "pending",
      error: null,
      cost,
      dest_carrier: destCarrier,
      created_at: now,
      updated_at: now,
    };

    db.run(
      `INSERT INTO sms_jobs (id, number, content, status, error, cost, dest_carrier, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        job.id,
        job.number,
        job.content,
        job.status,
        job.error,
        job.cost,
        job.dest_carrier,
        job.created_at,
        job.updated_at,
      ],
    );

    return job;
  }

  // Claim pending jobs for the device. The whole read-decide-write runs in
  // one transaction so two concurrent polls can't claim the same job or
  // double-spend the predicted balance (the SELECT-then-UPDATE window is
  // the classic race here). Greedy FIFO: dispatch while the estimated
  // balance affords each job; the first one that doesn't fit is held and
  // sending is paused, with a confirming balance check requested.
  static claimPending(limit = 20): SmsJob[] {
    return db.transaction((): SmsJob[] => {
      const now = Date.now();

      // Requeue jobs the phone claimed but never acked.
      db.run(
        `UPDATE sms_jobs SET status = 'pending', updated_at = ?
         WHERE status = 'dispatched' AND updated_at < ?`,
        [now, now - STALE_DISPATCH_MS],
      );

      const estimate = SmsBalance.estimated();
      let available = estimate.value; // null when balance unknown → no gating

      const pending = db
        .query(
          `SELECT * FROM sms_jobs WHERE status = 'pending'
           ORDER BY created_at ASC LIMIT ?`,
        )
        .all(limit) as SmsJob[];

      const claimed: SmsJob[] = [];
      for (const job of pending) {
        if (available !== null && job.cost > available) {
          // Predicted unaffordable: hold this job, pause, confirm via USSD.
          db.run(
            "UPDATE sms_jobs SET status = 'held', error = ?, updated_at = ? WHERE id = ?",
            [PREDICTED_INSUFFICIENT, now, job.id],
          );
          SmsState.pause(PREDICTED_INSUFFICIENT);
          SmsBalance.requestRefresh();
          logger.warn(
            `[sms-queue] ${job.id} held — predicted insufficient balance ` +
              `(need ${job.cost}, est ${available})`,
          );
          break;
        }

        db.run(
          "UPDATE sms_jobs SET status = 'dispatched', updated_at = ? WHERE id = ?",
          [now, job.id],
        );
        job.status = "dispatched";
        job.updated_at = now;
        claimed.push(job);
        if (available !== null) available -= job.cost;
      }

      return claimed;
    })();
  }

  static ack(id: string, status: "sent" | "failed", error?: string): boolean {
    const result = db
      .query(
        `UPDATE sms_jobs SET status = $status, error = $error, updated_at = $now
         WHERE id = $id AND status IN ('dispatched', 'pending')`,
      )
      .run({
        $id: id,
        $status: status,
        $error: error ?? null,
        $now: Date.now(),
      });

    if (result.changes === 0) {
      logger.warn(`[sms-queue] ack for unknown or settled job: ${id}`);
      return false;
    }

    return true;
  }

  // Park a job (e.g. insufficient balance) without losing it — released
  // back to pending by SmsQueue.releaseHeld() once sending resumes.
  static hold(id: string, reason: string): boolean {
    const result = db
      .query(
        `UPDATE sms_jobs SET status = 'held', error = $reason, updated_at = $now
         WHERE id = $id AND status IN ('dispatched', 'pending')`,
      )
      .run({ $id: id, $reason: reason, $now: Date.now() });
    return result.changes > 0;
  }

  static releaseHeld(): number {
    const result = db
      .query(
        `UPDATE sms_jobs SET status = 'pending', error = NULL, updated_at = $now
         WHERE status = 'held'`,
      )
      .run({ $now: Date.now() });
    return result.changes;
  }

  static get(id: string): SmsJob | null {
    return (
      (db.query("SELECT * FROM sms_jobs WHERE id = $id").get({ $id: id }) as
        | SmsJob
        | undefined) ?? null
    );
  }
}

export interface SmsStateSnapshot {
  paused: boolean;
  reason: string | null;
  paused_at: number | null;
}

export abstract class SmsState {
  static pause(reason: string) {
    db.run(
      "UPDATE sms_state SET paused = 1, reason = ?, paused_at = ? WHERE id = 1",
      [reason, Date.now()],
    );
  }

  static resume() {
    db.run(
      "UPDATE sms_state SET paused = 0, reason = NULL, paused_at = NULL WHERE id = 1",
    );
  }

  static isPaused(): boolean {
    const row = db
      .query("SELECT paused FROM sms_state WHERE id = 1")
      .get() as { paused: number };
    return row.paused === 1;
  }

  static get(): SmsStateSnapshot {
    const row = db.query("SELECT * FROM sms_state WHERE id = 1").get() as {
      paused: number;
      reason: string | null;
      paused_at: number | null;
    };
    return {
      paused: row.paused === 1,
      reason: row.reason,
      paused_at: row.paused_at,
    };
  }
}

interface BalanceRow {
  balance: string | null;
  raw: string | null;
  carrier: string | null;
  checked_at: number | null;
  refresh_requested: number;
  requested_at: number | null;
}

export abstract class SmsBalance {
  // Client asks for a fresh check; the phone picks this up on its next poll.
  static requestRefresh() {
    db.run(
      "UPDATE sms_balance SET refresh_requested = 1, requested_at = ? WHERE id = 1",
      [Date.now()],
    );
  }

  static isRefreshRequested(): boolean {
    const row = db
      .query("SELECT refresh_requested FROM sms_balance WHERE id = 1")
      .get() as { refresh_requested: number };
    return row.refresh_requested === 1;
  }

  // Phone reports the USSD result; clears the pending refresh. The parsed
  // numeric value resets the prediction baseline (committed cost is counted
  // only for sends after this checked_at).
  static report(balance: string | null, raw: string, carrier: string | null) {
    const value = parseRupiah(balance ?? raw);
    db.run(
      `UPDATE sms_balance
       SET balance = ?, balance_value = ?, raw = ?, carrier = ?, checked_at = ?,
           refresh_requested = 0, requested_at = NULL
       WHERE id = 1`,
      [balance, value, raw, carrier, Date.now()],
    );
  }

  // Estimated remaining balance = last reported value − cost of sends since
  // that report (dispatched in-flight jobs count, so it doesn't over-commit).
  // value is null when no balance has been reported yet (prediction off).
  static estimated(): { known: boolean; value: number | null } {
    const row = db
      .query("SELECT balance_value, checked_at FROM sms_balance WHERE id = 1")
      .get() as { balance_value: number | null; checked_at: number | null };

    if (row.balance_value === null) return { known: false, value: null };

    const { committed } = db
      .query(
        `SELECT COALESCE(SUM(cost), 0) AS committed FROM sms_jobs
         WHERE status IN ('dispatched', 'sent') AND updated_at > ?`,
      )
      .get(row.checked_at ?? 0) as { committed: number };

    return { known: true, value: row.balance_value - committed };
  }

  static get(): BalanceSnapshot {
    const row = db
      .query("SELECT * FROM sms_balance WHERE id = 1")
      .get() as BalanceRow;

    return {
      balance: row.balance,
      raw: row.raw,
      carrier: row.carrier,
      checked_at: row.checked_at,
      stale:
        row.checked_at === null ||
        Date.now() - row.checked_at > BALANCE_STALE_MS,
    };
  }
}

export abstract class SmsTariff {
  static rateFor(carrier: string): number {
    const row = db
      .query("SELECT rate FROM sms_tariff WHERE carrier = ?")
      .get(carrier) as { rate: number } | undefined;
    if (row) return row.rate;
    const fallback = db
      .query("SELECT rate FROM sms_tariff WHERE carrier = 'unknown'")
      .get() as { rate: number } | undefined;
    return fallback?.rate ?? FALLBACK_RATE;
  }

  static set(carrier: string, rate: number) {
    db.run(
      `INSERT INTO sms_tariff (carrier, rate) VALUES (?, ?)
       ON CONFLICT(carrier) DO UPDATE SET rate = excluded.rate`,
      [carrier, rate],
    );
  }

  static all(): { carrier: string; rate: number }[] {
    return db
      .query("SELECT carrier, rate FROM sms_tariff ORDER BY carrier")
      .all() as { carrier: string; rate: number }[];
  }
}
