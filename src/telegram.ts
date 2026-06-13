import {
  getSourceStats,
  insertSource,
  uploadToStorage
} from "./supabase";
import type { Env, SourceType, TargetSite, TelegramDocument, TelegramMessage, TelegramPhoto, TelegramUpdate } from "./types";

const urlPattern = /https?:\/\/[^\s<>"']+/i;

export async function handleTelegramWebhook(env: Env, update: TelegramUpdate): Promise<void> {
  const message = update.message;
  if (!message) {
    return;
  }

  const chatId = String(message.chat.id);
  if (chatId !== env.TELEGRAM_ALLOWED_CHAT_ID) {
    await sendTelegramMessage(env, chatId, "Unauthorized chat.");
    return;
  }

  const text = message.text ?? message.caption ?? "";
  const command = normalizeCommand(text);

  try {
    if (command === "/start") {
      await sendTelegramMessage(env, chatId, startText());
      return;
    }

    if (command === "/status") {
      await showStatus(env, chatId);
      return;
    }

    if (command === "/tools" || command === "/abrasive") {
      const targetSite = command === "/tools" ? "toolsfinderhub" : "abrasive";
      await saveSource(env, message, targetSite);
      await sendTelegramMessage(env, chatId, `Saved material for ${targetSite}.`);
      return;
    }

    if (!command.startsWith("/")) {
      await saveSource(env, message, "toolsfinderhub");
      await sendTelegramMessage(env, chatId, "Saved as ToolsFinderHub article material.");
      return;
    }

    await sendTelegramMessage(env, chatId, "Unknown command. Send /start for usage.");
  } catch (error) {
    console.error(JSON.stringify({ event: "telegram_error", error: String(error) }));
    await sendTelegramMessage(env, chatId, `Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function saveSource(env: Env, message: TelegramMessage, targetSite: TargetSite): Promise<void> {
  const text = stripCommand(message.text ?? message.caption ?? "");
  const sourceType = detectSourceType(message, text);
  const url = text.match(urlPattern)?.[0] ?? null;
  let storagePath: string | null = null;
  let fileName: string | null = null;
  let mimeType: string | null = null;

  if (message.photo?.length) {
    const photo = largestPhoto(message.photo);
    fileName = `${photo.file_unique_id}.jpg`;
    mimeType = "image/jpeg";
    storagePath = await downloadAndStoreTelegramFile(env, photo.file_id, targetSite, "images", fileName, mimeType);
  } else if (message.document) {
    fileName = sanitizeFileName(message.document.file_name ?? `${message.document.file_id}.bin`);
    mimeType = message.document.mime_type ?? "application/octet-stream";
    storagePath = await downloadAndStoreTelegramFile(env, message.document.file_id, targetSite, "files", fileName, mimeType);
  }

  await insertSource(env, {
    telegram_message_id: String(message.message_id),
    telegram_chat_id: String(message.chat.id),
    source_type: sourceType,
    target_site: targetSite,
    original_text: text || null,
    original_url: url,
    storage_bucket: storagePath ? env.SUPABASE_STORAGE_BUCKET : null,
    storage_path: storagePath,
    file_name: fileName,
    mime_type: mimeType,
    status: "new"
  });
}

async function showStatus(env: Env, chatId: string): Promise<void> {
  const stats = await getSourceStats(env);
  await sendTelegramMessage(env, chatId, [
    "Material bot status",
    `seo_sources: ${formatCounts(stats)}`
  ].join("\n"));
}

function detectSourceType(message: TelegramMessage, text: string): SourceType {
  if (message.photo?.length) return "image";
  if (message.video) return "video";
  if (message.document) return "file";
  if (urlPattern.test(text)) return "link";
  return "text";
}

function largestPhoto(photos: TelegramPhoto[]): TelegramPhoto {
  return photos.reduce((best, photo) => (photo.file_size ?? 0) > (best.file_size ?? 0) ? photo : best, photos[0]);
}

async function downloadAndStoreTelegramFile(
  env: Env,
  fileId: string,
  targetSite: TargetSite,
  directory: "images" | "files",
  fileName: string,
  mimeType: string
): Promise<string> {
  const file = await telegramApi<{ ok: boolean; result: { file_path: string } }>(env, "getFile", { file_id: fileId });
  if (!file.ok) {
    throw new Error("Telegram getFile failed.");
  }

  const download = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.result.file_path}`);
  if (!download.ok) {
    throw new Error(`Telegram file download failed: ${download.status}`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const storagePath = `${targetSite}/${directory}/${today}/${sanitizeFileName(fileName)}`;
  await uploadToStorage(env, storagePath, await download.arrayBuffer(), mimeType);
  return storagePath;
}

async function sendTelegramMessage(env: Env, chatId: string, text: string): Promise<void> {
  await telegramApi(env, "sendMessage", {
    chat_id: chatId,
    text: truncateTelegramText(text),
    disable_web_page_preview: true
  });
}

async function telegramApi<T>(env: Env, method: string, payload: unknown): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram ${method} ${response.status}: ${errorText}`);
  }

  return response.json() as Promise<T>;
}

function stripCommand(text: string): string {
  return text.replace(/^\/(?:tools|abrasive)(?:@\w+)?\s*/i, "").trim();
}

function normalizeCommand(text: string): string {
  const [rawCommand = ""] = text.trim().split(/\s+/, 1);
  return rawCommand.replace(/@\w+$/i, "");
}

function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || `${crypto.randomUUID()}.bin`;
}

function truncateTelegramText(text: string): string {
  return text.length > 3900 ? `${text.slice(0, 3900)}...` : text;
}

function formatCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts);
  return entries.length ? entries.map(([key, value]) => `${key}=${value}`).join(", ") : "none";
}

function startText(): string {
  return [
    "ToolsFinderHub Article Material Bot",
    "",
    "Default use:",
    "Send me any paragraph, article instruction, link, note, or screenshot caption directly.",
    "I will save it as ToolsFinderHub article material.",
    "",
    "Main commands:",
    "/status - show material stats",
    "",
    "Optional:",
    "/abrasive + content - save material for abrasive-wheel-website",
    "/tools + content - explicitly save for ToolsFinderHub"
  ].join("\n");
}
