import { cron } from "@elysiajs/cron";
import { Elysia } from "elysia";

import env from "../env";
import logger from "./helper/logger";
import { messaging } from "./modules/messaging";
import { loggerPlugin } from "./plugins/logger";
import { client1, client2, wagatePlugin } from "./plugins/wagate";

// ─── Main Application ───────────────────────────────────────────
const app = new Elysia()
  .use(loggerPlugin)
  .use(wagatePlugin)
  .use(
    cron({
      name: "monthly-chat-cleanup",
      pattern: "0 0 1 * *", // 1st of every month at midnight
      async run() {
        logger.info("[cleanup] 🧹 Monthly cleanup: clearing WA1↔WA2 chats...");
        await client1.clearChat(env.WA2_NUMBER);
        await client2.clearChat(env.WA1_NUMBER);
        logger.info("[cleanup] ✅ Monthly cleanup complete");
      },
    }),
  )
  .onError({ as: "global" }, ({ code, error, set }) => {
    const statusCode = (error as any).status || 500;
    const message =
      "message" in error ? (error as Error).message : "Internal server error";
    const stack =
      "stack" in error ? (error as Error).stack : undefined;

    logger.error(`[http] ${code} — ${message}`, {
      code,
      statusCode,
      stack,
    });

    set.status = statusCode;
    return {
      status: "error",
      code: statusCode,
      message,
    };
  })
  .onBeforeHandle({ as: "global" }, ({ request, set }) => {
    // Cache-control header (replaces Express CacheMiddleware)
    const period = 60 * 60; // 1 hour
    if (request.method === "GET") {
      set.headers["cache-control"] = `public, max-age=${period}`;
    } else {
      set.headers["cache-control"] = "no-store";
    }
  })
  .group("/api/v1", (app) =>
    app
      .get("/", () => ({ message: "REST API is working" }))
      .use(messaging),
  )
  .listen(env.PORT);

// ─── Startup ─────────────────────────────────────────────────────
logger.info(`🚀 Server running on port ${env.PORT}`);

(async () => {
  try {
    logger.info("═══════════════════════════════════════════════");
    logger.info("[startup] Initializing Client 1 (Main)...");
    logger.info("═══════════════════════════════════════════════");
    await client1.init();
    logger.info("[startup] ✅ Client 1 is ready!");

    logger.info("");
    logger.info("═══════════════════════════════════════════════");
    logger.info("[startup] Initializing Client 2 (Secondary)...");
    logger.info("═══════════════════════════════════════════════");
    await client2.init();
    logger.info("[startup] ✅ Client 2 is ready!");

    logger.info("");
    logger.info("[startup] Verifying partner contacts...");
    await client1.saveContact(env.WA2_NUMBER);
    await client2.saveContact(env.WA1_NUMBER);

    logger.info("═══════════════════════════════════════════════");
    logger.info("[startup] ✅ Both clients ready — WA-GATE is live");
    logger.info("[startup] 📅 Monthly chat cleanup: 1st of every month");
    logger.info("═══════════════════════════════════════════════");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[startup] ❌ Failed to initialize: ${message}`, {
      error: message,
      stack: err instanceof Error ? err.stack : undefined,
    });
  }
})();

// ─── Global Error Handlers ───────────────────────────────────────
process.once("unhandledRejection", async (reason) => {
  logger.error("[process] Unhandled rejection", {
    reason: String(reason),
    stack:
      reason instanceof Error ? reason.stack : undefined,
  });
});

process.once("uncaughtException", async (err) => {
  logger.error("[process] Uncaught exception", {
    error: err.message,
    stack: err.stack,
  });
});

export { app };
