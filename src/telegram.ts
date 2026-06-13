import { generateArticleDraft, organizeKnowledgeItem, summarizeSource } from "./ai";
import { publishArticleToGitHub, repoForSite } from "./github";
import {
  getArticle,
  getStats,
  insertArticle,
  insertKnowledgeItem,
  insertSource,
  listNewSources,
  listRecentDrafts,
  updateArticle,
  updateSource,
  uploadToStorage
} from "./supabase";
import type { Env, KnowledgeItemType, SourceType, TargetSite, TelegramDocument, TelegramMessage, TelegramPhoto, TelegramUpdate } from "./types";

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

    if (command === "/generate") {
      await generateDrafts(env, chatId);
      return;
    }

    if (command === "/list") {
      await listDrafts(env, chatId);
      return;
    }

    if (command === "/status") {
      await showStatus(env, chatId);
      return;
    }

    if (command === "/publish") {
      await publishDraft(env, chatId, text);
      return;
    }

    if (command === "/tools" || command === "/abrasive") {
      const targetSite = command === "/tools" ? "toolsfinderhub" : "abrasive";
      await saveSource(env, message, targetSite);
      await sendTelegramMessage(env, chatId, `Saved material for ${targetSite}.`);
      return;
    }

    const knowledgeType = commandToKnowledgeType(command);
    await saveKnowledge(env, message, knowledgeType);
  } catch (error) {
    console.error(JSON.stringify({ event: "telegram_error", error: String(error) }));
    await sendTelegramMessage(env, chatId, `Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function saveKnowledge(env: Env, message: TelegramMessage, forcedType?: KnowledgeItemType): Promise<void> {
  const rawInput = stripKnowledgeCommand(message.text ?? message.caption ?? "");
  if (!rawInput) {
    await sendTelegramMessage(env, String(message.chat.id), "Send me text, a link, or a screenshot note to save.");
    return;
  }

  const draft = await organizeKnowledgeItem(env, rawInput, forcedType);
  const item = await insertKnowledgeItem(env, {
    title: draft.title,
    content: draft.content,
    raw_input: rawInput,
    item_type: draft.item_type,
    category: draft.category,
    tags: draft.tags,
    source_url: draft.source_url || null,
    ai_summary: draft.ai_summary,
    article_idea: draft.article_idea,
    status: "new"
  });

  await sendTelegramMessage(env, String(message.chat.id), [
    "Saved to Knowledge Base",
    "",
    `Title: ${item.title}`,
    `Category: ${item.category}`,
    `Type: ${item.item_type}`,
    `Tags: ${item.tags.join(", ")}`,
    `Possible Article: ${item.article_idea}`,
    `Status: ${item.status}`
  ].join("\n"));
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

async function generateDrafts(env: Env, chatId: string): Promise<void> {
  const sources = await listNewSources(env, 5);
  if (sources.length === 0) {
    await sendTelegramMessage(env, chatId, "No new materials found.");
    return;
  }

  await sendTelegramMessage(env, chatId, `Generating drafts from ${sources.length} new material(s)...`);

  let generated = 0;
  for (const source of sources) {
    try {
      const summary = await summarizeSource(env, source);
      const enrichedSource = await updateSource(env, source.id, {
        ai_summary: summary.summary,
        suggested_topics: summary.suggested_topics,
        status: "processing"
      });
      const draft = await generateArticleDraft(env, enrichedSource, summary);
      const article = await insertArticle(env, {
        source_id: source.id,
        target_site: source.target_site,
        title: draft.title,
        slug: draft.slug,
        meta_description: draft.meta_description,
        keywords: draft.keywords,
        outline: draft.outline,
        markdown_content: draft.markdown_content,
        status: "draft"
      });

      await updateSource(env, source.id, {
        status: "processed",
        processed_at: new Date().toISOString(),
        error_message: null
      });

      generated += 1;
      await sendTelegramMessage(env, chatId, `Draft ready:\n${article.title}\nID: ${article.id}`);
    } catch (error) {
      await updateSource(env, source.id, {
        status: "error",
        error_message: error instanceof Error ? error.message : String(error),
        processed_at: new Date().toISOString()
      });
    }
  }

  await sendTelegramMessage(env, chatId, `Done. Generated ${generated} draft(s).`);
}

async function listDrafts(env: Env, chatId: string): Promise<void> {
  const drafts = await listRecentDrafts(env, 5);
  if (drafts.length === 0) {
    await sendTelegramMessage(env, chatId, "No drafts yet.");
    return;
  }

  const lines = drafts.map((draft) => [
    draft.title,
    `ID: ${draft.id}`,
    `Site: ${draft.target_site}`,
    `Slug: ${draft.slug}`
  ].join("\n"));

  await sendTelegramMessage(env, chatId, lines.join("\n\n"));
}

async function publishDraft(env: Env, chatId: string, text: string): Promise<void> {
  const articleId = text.trim().split(/\s+/)[1];
  if (!articleId) {
    await sendTelegramMessage(env, chatId, "Usage: /publish article_id");
    return;
  }

  const article = await getArticle(env, articleId);
  if (!article) {
    await sendTelegramMessage(env, chatId, "Article not found.");
    return;
  }

  if (article.status === "published") {
    await sendTelegramMessage(env, chatId, "Article is already published.");
    return;
  }

  const result = await publishArticleToGitHub(env, article);
  await updateArticle(env, article.id, {
    status: "published",
    github_owner: result.owner,
    github_repo: result.repo,
    github_path: result.path,
    published_at: new Date().toISOString()
  });

  await sendTelegramMessage(env, chatId, `Published to ${result.owner}/${result.repo}:${result.path}`);
}

async function showStatus(env: Env, chatId: string): Promise<void> {
  const stats = await getStats(env);
  await sendTelegramMessage(env, chatId, [
    "SEO automation status",
    `Sources: ${formatCounts(stats.sources)}`,
    `Articles: ${formatCounts(stats.articles)}`
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

function stripKnowledgeCommand(text: string): string {
  return text.replace(/^\/(?:idea|tool|amazon|seo|automation)(?:@\w+)?\s*/i, "").trim();
}

function normalizeCommand(text: string): string {
  const [rawCommand = ""] = text.trim().split(/\s+/, 1);
  return rawCommand.replace(/@\w+$/i, "");
}

function commandToKnowledgeType(command: string): KnowledgeItemType | undefined {
  switch (command) {
    case "/idea":
      return "idea";
    case "/tool":
      return "tool";
    case "/amazon":
      return "amazon";
    case "/seo":
      return "seo";
    case "/automation":
      return "automation";
    default:
      return undefined;
  }
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
    "Send me any idea, link, screenshot note, tool update, or ecommerce experience. I will organize it into your ToolsFinderHub knowledge base.",
    "",
    "Knowledge commands:",
    "/idea + content - save as idea",
    "/tool + content - save as tool",
    "/amazon + content - save as amazon",
    "/seo + content - save as seo",
    "/automation + content - save as automation",
    "",
    "SEO article commands:",
    "/tools + text/link/photo/file - save article material for ToolsFinderHub",
    "/abrasive + text/link/photo/file - save article material for abrasive-wheel-website",
    "/generate - turn new materials into article drafts",
    "/list - show latest 5 drafts",
    "/publish article_id - publish a draft to GitHub",
    "/status - show source/article stats"
  ].join("\n");
}
