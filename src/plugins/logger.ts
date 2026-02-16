import { Elysia } from "elysia";
import env from "../../env";
import logger from "../helper/logger";

// ─── Logger Plugin ───────────────────────────────────────────────
// Named plugin that decorates the Winston logger into context
// and adds request logging in development mode.
// ─────────────────────────────────────────────────────────────────

export const loggerPlugin = new Elysia({ name: "logger" })
  .decorate("logger", logger)
  .onBeforeHandle({ as: "global" }, ({ request }) => {
    if (env.NODE_ENV !== "production") {
      const url = new URL(request.url);
      logger.info(`${request.method} ${url.pathname}`);
    }
  });
