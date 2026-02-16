import { existsSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import logger from "../../helper/logger";
import {
  generateWarmupMessage,
  randomDelay,
  randomInt,
} from "../../helper/organic";
import type { WagateClient } from "../../lib/wwebjs";

// ─── Orchestrator ────────────────────────────────────────────────
// Anti-ban pipeline: warm-up conversation between WA1 ↔ WA2
// before delivering the actual payload from WA1 to the destination.
//
// Phase 1: WA2 → WA1  (1-3 warm-up messages, 1-5s delay each)
// Phase 2: WA1 → WA2  (1-3 reply messages, 1-5s delay each)
// Phase 3: WA1 → Dest (actual payload, 1-10s delay)
//
// Runs fully async — controller returns immediately.
// ─────────────────────────────────────────────────────────────────

interface OrchestratorPayload {
  content: string;
  number: string;
  file?: File;
}

function cleanupTempFile(filePath: string) {
  try {
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch {
    // ignore cleanup errors
  }
}

export abstract class Orchestrator {
  /**
   * Execute the full anti-ban pipeline.
   * This is fire-and-forget from the controller's perspective.
   */
  static async execute(
    wa1: WagateClient,
    wa2: WagateClient,
    payload: OrchestratorPayload,
  ) {
    const traceId = `orch-${Date.now()}-${randomInt(1000, 9999)}`;

    logger.info(
      `[${traceId}] 🚀 Starting orchestration → destination: ${payload.number}`,
    );

    try {
      // ── Phase 1: WA2 → WA1 warm-up ──
      const warmup1Count = randomInt(1, 3);
      logger.info(
        `[${traceId}] Phase 1: WA2 → WA1 (${warmup1Count} warm-up messages)`,
      );

      for (let i = 0; i < warmup1Count; i++) {
        await randomDelay(1000, 5000);
        const msg = generateWarmupMessage(payload.content);
        logger.info(
          `[${traceId}] Phase 1 [${i + 1}/${warmup1Count}]: "${msg}"`,
        );
        await wa2.sendMsg(msg, wa2.partnerNumber);
      }

      // ── Phase 2: WA1 → WA2 reply ──
      const warmup2Count = randomInt(1, 3);
      logger.info(
        `[${traceId}] Phase 2: WA1 → WA2 (${warmup2Count} reply messages)`,
      );

      for (let i = 0; i < warmup2Count; i++) {
        await randomDelay(1000, 5000);
        const msg = generateWarmupMessage(payload.content);
        logger.info(
          `[${traceId}] Phase 2 [${i + 1}/${warmup2Count}]: "${msg}"`,
        );
        await wa1.sendMsg(msg, wa1.partnerNumber);
      }

      // ── Phase 3: WA1 → Destination (actual payload) ──
      await randomDelay(1000, 10000);
      logger.info(
        `[${traceId}] Phase 3: WA1 → ${payload.number} (PAYLOAD DELIVERY)`,
      );

      if (payload.file) {
        const tempFilePath = join(
          tmpdir(),
          `wagate-${Date.now()}-${payload.file.name}`,
        );
        const buffer = await payload.file.arrayBuffer();
        writeFileSync(tempFilePath, Buffer.from(buffer));

        try {
          await wa1.sendFile(
            payload.content,
            payload.number,
            tempFilePath,
          );
        } finally {
          cleanupTempFile(tempFilePath);
        }
      } else {
        await wa1.sendMsg(payload.content, payload.number);
      }

      logger.info(`[${traceId}] ✅ Orchestration complete`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      logger.error(
        `[${traceId}] ❌ Orchestration failed: ${message}`,
        { error: message, stack, destination: payload.number },
      );
    }
  }
}
