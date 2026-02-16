import { Elysia } from "elysia";

import env from "../env";
import logger from "./helper/logger";
import { messaging } from "./modules/messaging";
import { loggerPlugin } from "./plugins/logger";
import { client, wagatePlugin } from "./plugins/wagate";

// ─── Main Application ───────────────────────────────────────────
const app = new Elysia()
  .use(loggerPlugin)
  .use(wagatePlugin)
  .onError({ as: "global" }, ({ code, error, set }) => {
    const statusCode = (error as any).status || 500;
    const message =
      "message" in error ? (error as Error).message : "Internal server error";
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
logger.info("Starting the bot...");

client.init().catch((err) => {
  logger.error("Failed to initialize WhatsApp client: " + err.message);
});

// ─── Global Error Handlers ───────────────────────────────────────
process.once("unhandledRejection", async (reason) => {
  logger.error("Unhandled rejection: " + reason);
});

process.once("uncaughtException", async (err) => {
  logger.error("Uncaught exception: " + err.message);
});

export { app };
