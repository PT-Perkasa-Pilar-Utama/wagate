import { Elysia } from "elysia";

import env from "../../env";
import { WagateClient } from "../lib/wwebjs";

// ─── WagateClient Plugin ─────────────────────────────────────────
// Named plugin with two WhatsApp instances (anti-ban strategy).
//
// - wa1 (client-1): Main account — sends payload to destination
// - wa2 (client-2): Secondary — sends warm-up messages to wa1
//
// Each instance uses its own LocalAuth session (session-client-1/2).
// Partner numbers are cross-referenced for warm-up messaging.
// ─────────────────────────────────────────────────────────────────

const client1 = new WagateClient("client-1", env.WA2_NUMBER);
const client2 = new WagateClient("client-2", env.WA1_NUMBER);

export const wagatePlugin = new Elysia({ name: "wagate" })
  .decorate("wa1", client1)
  .decorate("wa2", client2);

export { client1, client2 };
