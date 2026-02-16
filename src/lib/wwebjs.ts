import qrcode from "qrcode-terminal";
import { Client, LocalAuth, MessageMedia } from "whatsapp-web.js";
import { env } from "../../env";
import {
  WHATSAPP_WEB_BUILD_VERSION,
  WHATSAPP_WEB_VERSION,
} from "../helper/constant";
import logger from "../helper/logger";
import { Helper } from "../helper/util";

export class WagateClient {
  client: Client;

  constructor(
    public readonly clientId: string,
    public readonly partnerNumber: string = "",
    private helper = new Helper(),
  ) {
    this.client = new Client({
      authStrategy: new LocalAuth({ clientId }),
      webVersion: WHATSAPP_WEB_BUILD_VERSION,
      webVersionCache: { type: "none" },
      puppeteer: {
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      },
    });

    this.client.on("qr", (qr) => this.onQR(qr));
    this.client.on("ready", () => this.onReady());
    this.client.on("authenticated", () => {
      logger.info(`[${this.clientId}] ✅ Authenticated successfully`);
    });
    this.client.on("auth_failure", (msg) => {
      logger.error(`[${this.clientId}] ❌ Auth failure: ${msg}`);
    });
    this.client.on("disconnected", (reason) => {
      logger.warn(`[${this.clientId}] ⚠️ Disconnected: ${reason}`);
    });
  }

  private onQR(qr: string) {
    logger.info(`[${this.clientId}] Scan this QR code:`);
    qrcode.generate(qr, { small: true });
  }

  private async onReady() {
    logger.info(`[${this.clientId}] ✅ WHATSAPP BOT IS RUNNING`);
    logger.info(`[${this.clientId}] WWJS: ${WHATSAPP_WEB_VERSION}`);
    logger.info(
      `[${this.clientId}] Web version: ${WHATSAPP_WEB_BUILD_VERSION}`,
    );
  }

  async init() {
    logger.info(`[${this.clientId}] Initializing — waiting for QR scan...`);

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`[${this.clientId}] Initialization timed out (5 min)`));
      }, 5 * 60 * 1000);

      this.client.on("ready", () => {
        clearTimeout(timeout);
        this.setupProfile();
        resolve();
      });

      this.client.on("auth_failure", (msg) => {
        clearTimeout(timeout);
        reject(new Error(`[${this.clientId}] Auth failed: ${msg}`));
      });

      this.client.initialize().catch((err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  setupProfile() {
    if (env.NODE_ENV === "production") {
      const media = MessageMedia.fromFilePath("./logo.jpg");
      this.client.setProfilePicture(media);
      this.client.setDisplayName(
        (this.clientId === "client-1"
          ? env.DISPLAY_NAME_1
          : env.DISPLAY_NAME_2) || "",
      );
    }
  }

  async saveContact(number: string) {
    try {
      const contactId = `${number}@c.us`;
      const contact = await this.client.getContactById(contactId);
      if (contact) {
        logger.info(
          `[${this.clientId}] Partner contact ${number} is reachable`,
        );
      }
    } catch (err) {
      logger.warn(
        `[${this.clientId}] Could not verify partner contact ${number}`,
      );
    }
  }

  /**
   * Simulate typing indicator for 1-3 seconds before sending.
   */
  private async sendTyping(chatId: string) {
    try {
      const chat = await this.client.getChatById(chatId);
      await chat.sendStateTyping();
      const typingDuration = 1000 + Math.random() * 2000; // 1-3s
      await new Promise((r) => setTimeout(r, typingDuration));
      await chat.clearState();
    } catch (err) {
      logger.debug(`[${this.clientId}] Could not send typing state`);
    }
  }

  /**
   * Mark a chat as read (sendSeen) with a 1s delay.
   */
  async markAsRead(number: string) {
    try {
      await new Promise((r) => setTimeout(r, 1000));
      const chatId = `${number}@c.us`;
      const chat = await this.client.getChatById(chatId);
      await chat.sendSeen();
      logger.debug(`[${this.clientId}] 👁️ Marked chat ${number} as read`);
    } catch (err) {
      logger.debug(`[${this.clientId}] Could not mark chat as read`);
    }
  }

  async sendMsg(msg: string, to: string) {
    await this.helper.delay();
    const chatId = `${to}@c.us`;
    await this.sendTyping(chatId);
    logger.info(`[${this.clientId}] 📤 Sending text to ${to}`);
    await this.client.sendMessage(chatId, msg);
  }

  async sendFile(msg: string = "", to: string, filePath: string) {
    await this.helper.delay();
    const chatId = `${to}@c.us`;
    await this.sendTyping(chatId);
    logger.info(`[${this.clientId}] 📤 Sending media to ${to}`);
    const messageMedia = MessageMedia.fromFilePath(filePath);
    await this.client.sendMessage(chatId, messageMedia, {
      caption: msg,
    });
  }
}

