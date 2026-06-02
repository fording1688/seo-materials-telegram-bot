export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_ALLOWED_CHAT_ID: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_STORAGE_BUCKET: string;
  AI_API_KEY?: string;
  AI_API_BASE_URL?: string;
  AI_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENROUTER_SITE_URL?: string;
  OPENROUTER_APP_NAME?: string;
  GITHUB_TOKEN: string;
  GITHUB_OWNER: string;
  TOOLS_GITHUB_REPO: string;
  ABRASIVE_GITHUB_REPO: string;
  GITHUB_BRANCH?: string;
}

export type TargetSite = "toolsfinderhub" | "abrasive";
export type SourceType = "text" | "link" | "image" | "file" | "video";

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export interface TelegramMessage {
  message_id: number;
  chat: { id: number | string; type?: string };
  text?: string;
  caption?: string;
  photo?: TelegramPhoto[];
  document?: TelegramDocument;
  video?: TelegramDocument;
}

export interface TelegramPhoto {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  width: number;
  height: number;
}

export interface TelegramDocument {
  file_id: string;
  file_unique_id?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface SeoSource {
  id: string;
  telegram_message_id: string;
  telegram_chat_id: string;
  source_type: SourceType;
  target_site: TargetSite;
  original_text: string | null;
  original_url: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  ai_summary: string | null;
  suggested_topics: unknown;
  status: string;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface SeoArticle {
  id: string;
  source_id: string | null;
  target_site: TargetSite;
  title: string;
  slug: string;
  meta_description: string | null;
  keywords: string[] | null;
  outline: unknown;
  markdown_content: string | null;
  status: string;
  github_owner: string | null;
  github_repo: string | null;
  github_path: string | null;
  created_at: string;
  published_at: string | null;
}

export interface ArticleDraft {
  title: string;
  slug: string;
  meta_description: string;
  keywords: string[];
  outline: string[];
  markdown_content: string;
  faq: Array<{ question: string; answer: string }>;
}
