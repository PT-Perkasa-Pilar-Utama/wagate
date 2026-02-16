import * as winston from "winston";
import env from "../../env";

// ─── Logger Configuration ────────────────────────────────────────
// Structured JSON logging for pm2 compatibility.
// pm2 captures stdout — we log JSON in production for
// easy parsing with `pm2 logs --json` or log aggregators.
// ─────────────────────────────────────────────────────────────────

const logger = winston.createLogger({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    env.NODE_ENV === "production"
      ? winston.format.json()
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(
            ({ timestamp, level, message, ...meta }) =>
              `${timestamp} ${level}: ${message}${
                Object.keys(meta).length ? " " + JSON.stringify(meta) : ""
              }`,
          ),
        ),
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
    }),
    new winston.transports.File({
      filename: "logs/combined.log",
    }),
  ],
});

export default logger;
