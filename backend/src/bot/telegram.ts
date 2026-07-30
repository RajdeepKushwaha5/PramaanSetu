/**
 * Telegram verifier bot over the Bot API directly (fetch + long polling).
 *
 * Deliberately dependency-free: talking to api.telegram.org with the built-in
 * fetch avoids the `node-telegram-bot-api` -> `request` chain and its known
 * vulnerabilities, so the backend dependency audit stays clean.
 *
 * Activates only when TELEGRAM_BOT_TOKEN is set. Get a token from @BotFather.
 */

import { verifyAndFormat } from "./verifyReply.js";

const WELCOME =
  "🛡️ <b>PramaanSetu Verifier</b>\n\n" +
  "Forward me any suspicious securities-market message, image, PDF, or video and I will tell you whether it is a genuine, signed official communication — or a fake.\n\n" +
  "• Paste or forward a <b>message</b>\n" +
  "• Send a <b>photo</b> (e.g. a circular or screenshot)\n" +
  "• Send a <b>PDF</b> or <b>video</b>\n\n" +
  "I never say something is safe unless it is cryptographically proven.";

interface TgFile {
  file_id: string;
  mime_type?: string;
}
interface TgMessage {
  chat: { id: number };
  text?: string;
  caption?: string;
  photo?: TgFile[];
  video?: TgFile;
  voice?: TgFile;
  audio?: TgFile;
  document?: TgFile;
}
interface TgUpdate {
  update_id: number;
  message?: TgMessage;
}

const api = (token: string, method: string) => `https://api.telegram.org/bot${token}/${method}`;

async function callApi<T>(token: string, method: string, body: unknown): Promise<T> {
  const res = await fetch(api(token, method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

async function downloadFile(token: string, fileId: string): Promise<Buffer> {
  const info = await callApi<{ ok: boolean; result?: { file_path?: string } }>(
    token,
    "getFile",
    { file_id: fileId },
  );
  const path = info.result?.file_path;
  if (!path) throw new Error("could not resolve file path");
  const res = await fetch(`https://api.telegram.org/file/bot${token}/${path}`);
  return Buffer.from(await res.arrayBuffer());
}

async function sendMessage(token: string, chatId: number, text: string): Promise<void> {
  await callApi(token, "sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
}

async function handleMessage(token: string, msg: TgMessage): Promise<void> {
  const chatId = msg.chat.id;
  if (msg.text?.startsWith("/")) {
    await sendMessage(token, chatId, WELCOME);
    return;
  }

  let reply: string | null = null;
  if (msg.photo && msg.photo.length > 0) {
    const largest = msg.photo[msg.photo.length - 1];
    reply = await verifyAndFormat({ bytes: await downloadFile(token, largest.file_id), mimeType: "image/jpeg" });
  } else if (msg.video) {
    reply = await verifyAndFormat({ bytes: await downloadFile(token, msg.video.file_id), mimeType: msg.video.mime_type ?? "video/mp4" });
  } else if (msg.voice || msg.audio) {
    const a = msg.voice ?? msg.audio!;
    reply = await verifyAndFormat({ bytes: await downloadFile(token, a.file_id), mimeType: a.mime_type ?? "audio/ogg" });
  } else if (msg.document) {
    reply = await verifyAndFormat({ bytes: await downloadFile(token, msg.document.file_id), mimeType: msg.document.mime_type ?? "application/octet-stream" });
  } else if (msg.caption || msg.text) {
    reply = await verifyAndFormat({ text: msg.caption ?? msg.text });
  }

  await sendMessage(
    token,
    chatId,
    reply ?? "Send me a message, image, PDF, or video to verify. Type /help for details.",
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let running = false;

async function pollLoop(token: string): Promise<void> {
  // Skip messages queued before startup.
  let offset = 0;
  try {
    const init = await callApi<{ ok: boolean; result?: TgUpdate[] }>(token, "getUpdates", { offset: -1 });
    const last = init.result?.[init.result.length - 1];
    if (last) offset = last.update_id + 1;
  } catch {
    /* start from 0 */
  }

  while (running) {
    try {
      const res = await fetch(`${api(token, "getUpdates")}?timeout=30&offset=${offset}`);
      const data = (await res.json()) as { ok: boolean; result?: TgUpdate[] };
      if (!data.ok || !data.result) {
        await sleep(2000);
        continue;
      }
      for (const update of data.result) {
        offset = update.update_id + 1;
        if (update.message) {
          await handleMessage(token, update.message).catch((e) =>
            console.error("Telegram handle error:", (e as Error).message),
          );
        }
      }
    } catch (e) {
      console.error("Telegram polling error:", (e as Error).message);
      await sleep(3000);
    }
  }
}

export function startTelegramBot(): boolean {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return false;
  running = true;
  void pollLoop(token);
  console.log("Telegram verifier bot is live (polling).");
  return true;
}
