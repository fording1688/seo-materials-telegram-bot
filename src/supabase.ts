import type { Env, SeoArticle, SeoSource } from "./types";

function baseHeaders(env: Env): HeadersInit {
  return {
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    apikey: env.SUPABASE_SERVICE_ROLE_KEY
  };
}

async function supabaseFetch<T>(env: Env, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${env.SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      ...baseHeaders(env),
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase ${response.status}: ${errorText}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function insertSource(env: Env, source: Partial<SeoSource>): Promise<SeoSource> {
  const rows = await supabaseFetch<SeoSource[]>(env, "/rest/v1/seo_sources", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(source)
  });

  return rows[0];
}

export async function listNewSources(env: Env, limit = 5): Promise<SeoSource[]> {
  return supabaseFetch<SeoSource[]>(
    env,
    `/rest/v1/seo_sources?status=eq.new&order=created_at.asc&limit=${limit}`
  );
}

export async function updateSource(env: Env, id: string, patch: Partial<SeoSource>): Promise<SeoSource> {
  const rows = await supabaseFetch<SeoSource[]>(env, `/rest/v1/seo_sources?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(patch)
  });

  return rows[0];
}

export async function insertArticle(env: Env, article: Partial<SeoArticle>): Promise<SeoArticle> {
  const rows = await supabaseFetch<SeoArticle[]>(env, "/rest/v1/seo_articles", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(article)
  });

  return rows[0];
}

export async function listRecentDrafts(env: Env, limit = 5): Promise<SeoArticle[]> {
  return supabaseFetch<SeoArticle[]>(
    env,
    `/rest/v1/seo_articles?status=eq.draft&order=created_at.desc&limit=${limit}`
  );
}

export async function getArticle(env: Env, id: string): Promise<SeoArticle | null> {
  const rows = await supabaseFetch<SeoArticle[]>(
    env,
    `/rest/v1/seo_articles?id=eq.${encodeURIComponent(id)}&limit=1`
  );
  return rows[0] ?? null;
}

export async function updateArticle(env: Env, id: string, patch: Partial<SeoArticle>): Promise<SeoArticle> {
  const rows = await supabaseFetch<SeoArticle[]>(env, `/rest/v1/seo_articles?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(patch)
  });

  return rows[0];
}

export async function getStats(env: Env): Promise<{ sources: Record<string, number>; articles: Record<string, number> }> {
  const [sources, articles] = await Promise.all([
    supabaseFetch<Array<{ status: string }>>(env, "/rest/v1/seo_sources?select=status"),
    supabaseFetch<Array<{ status: string }>>(env, "/rest/v1/seo_articles?select=status")
  ]);

  return {
    sources: countByStatus(sources),
    articles: countByStatus(articles)
  };
}

function countByStatus(rows: Array<{ status: string }>): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});
}

export async function uploadToStorage(
  env: Env,
  path: string,
  body: ArrayBuffer,
  contentType: string
): Promise<void> {
  await supabaseFetch(env, `/storage/v1/object/${env.SUPABASE_STORAGE_BUCKET}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      "x-upsert": "true"
    },
    body
  });
}

export function getPublicStorageUrl(env: Env, path: string): string {
  const bucket = env.SUPABASE_STORAGE_BUCKET;
  return `${env.SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}
