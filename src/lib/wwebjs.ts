import qrcode from "qrcode-terminal";
import { Client, LocalAuth, MessageMedia } from "whatsapp-web.js";
import { env } from "../../env";
import {
  WHATSAPP_WEB_BUILD_VERSION,
  WHATSAPP_WEB_VERSION,
} from "../helper/constant";
import { Helper } from "../helper/util";

export class WagateClient {
  client: Client;

  constructor(private helper = new Helper()) {
    this.client = new Client({
      authStrategy: new LocalAuth(),
      webVersion: WHATSAPP_WEB_BUILD_VERSION,
      webVersionCache: {
        type: "remote",
        remotePath:
          "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html",
      },
      puppeteer: {
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      },
    });

    this.client.on("qr", this.onQR);
    this.client.on("ready", this.onReady);
  }

  private onQR(qr: string) {
    qrcode.generate(qr, { small: true });
  }

  private async onReady() {
    console.log("[LOG] WHATSAPP BOT IS RUNNING");
    console.log(`[LOG] WWJS VERSION: ${WHATSAPP_WEB_VERSION}`);
    console.log(`[LOG] WEB CACHE VERSION: ${WHATSAPP_WEB_BUILD_VERSION}`);
  }

  async init() {
    await this.client.initialize();
    this.setupProfile();
  }

  setupProfile() {
    if (env.NODE_ENV == "production") {
      const media = MessageMedia.fromFilePath("./logo.jpg");

      this.client.setProfilePicture(media);
      this.client.setDisplayName(process.env.DISPLAY_NAME || "");
    }
  }

  async sendToAdmin(msg: string) {
    this.sendMsg(msg, process.env.ADMIN_NUMBER || "");
  }

  async sendMsg(msg: string, to: string) {
    await this.helper.delay();
    this.client.sendMessage(`${to}@c.us`, msg);
  }

  async sendFile(msg: string = "", to: string, filePath: string) {
    await this.helper.delay();
    const messageMedia = MessageMedia.fromFilePath(filePath);
    this.client.sendMessage(`${to}@c.us`, messageMedia, {
      caption: msg,
    });
  }
}
