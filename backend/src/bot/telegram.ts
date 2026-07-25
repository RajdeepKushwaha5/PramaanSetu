/**
 * Telegram verifier bot (long-polling; no public URL required).
 *
 * Investors forward a suspicious message, image, or PDF to the bot and get the
 * same verdict the web verifier returns. Activates only when TELEGRAM_BOT_TOKEN
 * is set — the API server runs fine without it.
 *
 * Get a token in ~30s from @BotFather on Telegram, then set:
 *   TELEGRAM_BOT_TOKEN=123456:ABC...   in backend/.env
 */

import TelegramBot from "node-telegram-bot-api";
import { verifyAndFormat } from "./verifyReply.js";

const WELCOME =
  "🛡️ *PramaanSetu Verifier*\n\n" +
  "Forward me any suspicious securities-market message, image, or PDF and I will tell you whether it is a genuine, signed official communication — or a fake.\n\n" +
  "• Paste or forward a *message*\n" +
  "• Send a *photo* (e.g. a circular or screenshot)\n" +
  "• Send a *PDF* document\n\n" +
  "I never say something is safe unless it is cryptographically proven.";

async function downloadFile(bot: TelegramBot, fileId: string): Promise<Buffer> {
  const link = await bot.getFileLink(fileId);
  const res = await fetch(link);
  return Buffer.from(await res.arrayBuffer());
}

export function startTelegramBot(): boolean {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return false;

  const bot = new TelegramBot(token, { polling: true });

  bot.onText(/^\/(start|help)/, (msg) => {
    void bot.sendMessage(msg.chat.id, WELCOME, { parse_mode: "Markdown" });
  });

  bot.on("message", async (msg) => {
    // Commands handled above.
    if (msg.text?.startsWith("/")) return;
    const chatId = msg.chat.id;

    try {
      let reply: string | null = null;

      if (msg.photo && msg.photo.length > 0) {
        const largest = msg.photo[msg.photo.length - 1];
        const bytes = await downloadFile(bot, largest.file_id);
        reply = await verifyAndFormat({ bytes, mimeType: "image/jpeg" });
      } else if (msg.document) {
        const mime = msg.document.mime_type ?? "application/octet-stream";
        const bytes = await downloadFile(bot, msg.document.file_id);
        reply = await verifyAndFormat({ bytes, mimeType: mime });
      } else if (msg.caption || msg.text) {
        reply = await verifyAndFormat({ text: msg.caption ?? msg.text });
      }

      if (reply) {
        await bot.sendMessage(chatId, reply, { parse_mode: "Markdown" });
      } else {
        await bot.sendMessage(
          chatId,
          "Send me a message, image, or PDF to verify. Type /help for details.",
        );
      }
    } catch (e) {
      await bot.sendMessage(
        chatId,
        `Could not verify that: ${(e as Error).message}`,
      );
    }
  });

  bot.on("polling_error", (e) => {
    console.error("Telegram polling error:", (e as Error).message);
  });

  console.log("Telegram verifier bot is live (polling).");
  return true;
}
