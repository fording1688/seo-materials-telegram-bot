import type { Env, SeoArticle, TargetSite } from "./types";

export function repoForSite(env: Env, targetSite: TargetSite): string {
  return targetSite === "toolsfinderhub" ? env.TOOLS_GITHUB_REPO : env.ABRASIVE_GITHUB_REPO;
}

export async function publishArticleToGitHub(env: Env, article: SeoArticle): Promise<{ owner: string; repo: string; path: string }> {
  if (!article.markdown_content) {
    throw new Error("Article has no markdown_content.");
  }

  const owner = env.GITHUB_OWNER;
  const repo = repoForSite(env, article.target_site);
  const path = `content/blog/${article.slug}.md`;
  const branch = env.GITHUB_BRANCH ?? "main";
  const sha = await getExistingFileSha(env, owner, repo, path, branch);
  const content = toBase64(buildMarkdownFile(article));

  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponentPath(path)}`, {
    method: "PUT",
    headers: githubHeaders(env),
    body: JSON.stringify({
      message: `Add SEO article: ${article.title}`,
      content,
      branch,
      ...(sha ? { sha } : {})
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub ${response.status}: ${errorText}`);
  }

  return { owner, repo, path };
}

async function getExistingFileSha(
  env: Env,
  owner: string,
  repo: string,
  path: string,
  branch: string
): Promise<string | null> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponentPath(path)}?ref=${encodeURIComponent(branch)}`,
    { headers: githubHeaders(env) }
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub lookup ${response.status}: ${errorText}`);
  }

  const payload = await response.json() as { sha?: string };
  return payload.sha ?? null;
}

function githubHeaders(env: Env): HeadersInit {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    "Content-Type": "application/json",
    "User-Agent": "seo-materials-telegram-bot",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

function buildMarkdownFile(article: SeoArticle): string {
  const frontmatter = [
    "---",
    `title: ${JSON.stringify(article.title)}`,
    `slug: ${JSON.stringify(article.slug)}`,
    `description: ${JSON.stringify(article.meta_description ?? "")}`,
    `keywords: ${JSON.stringify(article.keywords ?? [])}`,
    `draft: false`,
    "---"
  ].join("\n");

  return `${frontmatter}\n\n${article.markdown_content?.trim()}\n`;
}

function encodeURIComponentPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
