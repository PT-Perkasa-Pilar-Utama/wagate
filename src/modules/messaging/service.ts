import { existsSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import type { WagateClient } from "../../lib/wwebjs";
import type { SendMediaBody, SendTextBody } from "./model";

// ─── Messaging Service ──────────────────────────────────────────
// Business logic decoupled from Elysia controller.
// Returns `status()` for errors instead of throwing.
// ─────────────────────────────────────────────────────────────────

function cleanupTempFile(filePath: string) {
  try {
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch {
    // ignore cleanup errors
  }
}

export abstract class MessagingService {
  static sendText(client: WagateClient, { content, number }: SendTextBody) {
    client.sendMsg(content, number).catch((err) => {
      console.error(`[sendText] Failed to send to ${number}:`, err);
    });

    return {
      status: "success" as const,
      code: 200,
      message: "Message sucessfully sent",
      data: {
        number,
        content,
        type: "text",
      },
    };
  }

  static async sendMedia(
    client: WagateClient,
    { content, number, file }: SendMediaBody,
  ) {
    const tempFilePath = join(tmpdir(), `wagate-${Date.now()}-${file.name}`);
    const buffer = await file.arrayBuffer();
    writeFileSync(tempFilePath, Buffer.from(buffer));

    client
      .sendFile(content || "", number, tempFilePath)
      .then(() => {
        cleanupTempFile(tempFilePath);
      })
      .catch((err) => {
        console.error(`[sendMedia] Failed to send to ${number}:`, err);
        cleanupTempFile(tempFilePath);
      });

    return {
      status: "success" as const,
      code: 200,
      message: "Message sucessfully sent",
      data: {
        number,
        content: content || "",
        type: "media",
      },
    };
  }
}
