import { articlePrompt, summaryPrompt } from "./prompts";
import { getPublicStorageUrl } from "./supabase";
import type { ArticleDraft, Env, KnowledgeDraft, KnowledgeItemType, SeoSource } from "./types";

interface SummaryResult {
  summary: string;
  suggested_topics: string[];
}

const articleSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "slug", "meta_description", "keywords", "outline", "markdown_content", "faq"],
  properties: {
    title: { type: "string" },
    slug: { type: "string" },
    meta_description: { type: "string" },
    keywords: { type: "array", items: { type: "string" } },
    outline: { type: "array", items: { type: "string" } },
    markdown_content: { type: "string" },
    faq: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "answer"],
        properties: {
          question: { type: "string" },
          answer: { type: "string" }
        }
      }
    }
  }
};

const summarySchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "suggested_topics"],
  properties: {
    summary: { type: "string" },
    suggested_topics: { type: "array", items: { type: "string" } }
  }
};

const knowledgeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "content", "item_type", "category", "tags", "source_url", "ai_summary", "article_idea"],
  properties: {
    title: { type: "string" },
    content: { type: "string" },
    item_type: {
      type: "string",
      enum: ["note", "idea", "experience", "tool", "news", "link", "screenshot", "amazon", "seo", "automation"]
    },
    category: {
      type: "string",
      enum: ["AI Tools", "ToolsFinderHub", "Amazon", "SEO", "Automation", "Facebook", "LinkedIn", "YouTube", "Cloudflare", "Supabase"]
    },
    tags: { type: "array", items: { type: "string" } },
    source_url: { type: "string" },
    ai_summary: { type: "string" },
    article_idea: { type: "string" }
  }
};

export async function summarizeSource(env: Env, source: SeoSource): Promise<SummaryResult> {
  const content = buildSourceContent(env, source);
  const json = await callOpenAIJson<SummaryResult>(env, summaryPrompt(source.target_site), content, summarySchema, "source_summary");
  return json;
}

export async function generateArticleDraft(env: Env, source: SeoSource, summary: SummaryResult): Promise<ArticleDraft> {
  const content = [
    `Target site: ${source.target_site}`,
    `Source type: ${source.source_type}`,
    `Original URL: ${source.original_url ?? "none"}`,
    `AI summary: ${summary.summary}`,
    `Suggested topics: ${summary.suggested_topics.join(", ")}`
  ].join("\n");

  const draft = await callOpenAIJson<ArticleDraft>(
    env,
    articlePrompt(source.target_site),
    content,
    articleSchema,
    "seo_article"
  );

  return {
    ...draft,
    slug: normalizeSlug(draft.slug),
    markdown_content: ensureFaqInMarkdown(draft)
  };
}

export async function organizeKnowledgeItem(
  env: Env,
  rawInput: string,
  forcedType?: KnowledgeItemType
): Promise<KnowledgeDraft> {
  const systemPrompt = [
    "You organize raw materials for ToolsFinderHub, a knowledge base about AI tools, software workflows, SEO, automation, Amazon operations, ecommerce lessons, and creator-platform ideas.",
    "Turn the raw user input into one clean knowledge item.",
    "Write in the same language as the input unless English is clearly better for tool names or article titles.",
    "Do not invent facts. If the input is thin, preserve uncertainty.",
    "Choose exactly one item_type and one category from the allowed enum values.",
    "tags should contain 3-8 short lowercase tags.",
    "source_url should be the detected URL, or an empty string if none exists.",
    "article_idea should be a practical future article angle for ToolsFinderHub."
  ].join("\n");

  const userContent = [
    forcedType ? `Forced item_type: ${forcedType}` : "Forced item_type: none",
    "Raw input:",
    rawInput
  ].join("\n\n");

  const draft = await callOpenAIJson<KnowledgeDraft>(
    env,
    systemPrompt,
    userContent,
    knowledgeSchema,
    "knowledge_item"
  );

  return {
    ...draft,
    item_type: forcedType ?? draft.item_type,
    source_url: draft.source_url || ""
  };
}

function buildSourceContent(env: Env, source: SeoSource): string {
  const parts = [
    `Target site: ${source.target_site}`,
    `Source type: ${source.source_type}`,
    `Text: ${source.original_text ?? "none"}`,
    `URL: ${source.original_url ?? "none"}`
  ];

  if (source.storage_path) {
    parts.push(`Stored file URL: ${getPublicStorageUrl(env, source.storage_path)}`);
    parts.push(`File name: ${source.file_name ?? "unknown"}`);
    parts.push(`MIME type: ${source.mime_type ?? "unknown"}`);
  }

  if (source.source_type === "video") {
    parts.push("Video content is not processed yet. Only use the text/caption/filename metadata.");
  }

  return parts.join("\n");
}

async function callOpenAIJson<T>(
  env: Env,
  systemPrompt: string,
  userContent: string,
  schema: unknown,
  schemaName: string
): Promise<T> {
  const response = await fetch(`${getAiBaseUrl(env)}/chat/completions`, {
    method: "POST",
    headers: aiHeaders(env),
    body: JSON.stringify({
      model: getAiModel(env),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schemaName,
          strict: true,
          schema
        }
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI provider ${response.status}: ${errorText}`);
  }

  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const text = payload.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error("AI provider response did not include JSON text.");
  }

  return JSON.parse(text) as T;
}

function getAiBaseUrl(env: Env): string {
  return (env.AI_API_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/g, "");
}

function getAiModel(env: Env): string {
  return env.AI_MODEL ?? env.OPENAI_MODEL ?? "gpt-4.1-mini";
}

function aiHeaders(env: Env): HeadersInit {
  const apiKey = env.AI_API_KEY ?? env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing AI_API_KEY or OPENAI_API_KEY.");
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };

  if (env.OPENROUTER_SITE_URL) {
    headers["HTTP-Referer"] = env.OPENROUTER_SITE_URL;
  }

  if (env.OPENROUTER_APP_NAME) {
    headers["X-Title"] = env.OPENROUTER_APP_NAME;
  }

  return headers;
}

function normalizeSlug(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function ensureFaqInMarkdown(draft: ArticleDraft): string {
  if (/##\s+FAQ/i.test(draft.markdown_content)) {
    return draft.markdown_content;
  }

  const faqMarkdown = draft.faq
    .map((item) => `### ${item.question}\n\n${item.answer}`)
    .join("\n\n");

  return `${draft.markdown_content.trim()}\n\n## FAQ\n\n${faqMarkdown}\n`;
}
