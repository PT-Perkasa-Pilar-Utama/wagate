import { Elysia } from "elysia";
import { WagateClient } from "../lib/wwebjs";

// ─── WagateClient Plugin ─────────────────────────────────────────
// Named plugin for deduplication — only runs once across all instances.
// Decorates context with `wagate` (the WhatsApp client singleton).
// ─────────────────────────────────────────────────────────────────

const client = new WagateClient();

export const wagatePlugin = new Elysia({ name: "wagate" }).decorate(
  "wagate",
  client,
);

export { client };
