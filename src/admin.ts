import {
  deleteKnowledgeItem,
  getKnowledgeItem,
  listKnowledgeItems,
  updateKnowledgeItem
} from "./supabase";
import type { Env, KnowledgeItem } from "./types";

const categories = ["AI Tools", "ToolsFinderHub", "Amazon", "SEO", "Automation", "Facebook", "LinkedIn", "YouTube", "Cloudflare", "Supabase"];
const itemTypes = ["note", "idea", "experience", "tool", "news", "link", "screenshot", "amazon", "seo", "automation"];
const statuses = ["new", "reviewed", "article_ready", "archived"];

export async function handleKnowledgeAdmin(request: Request, env: Env): Promise<Response> {
  if (!await isAuthorized(request, env)) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Knowledge Admin"' }
    });
  }

  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/admin/knowledge") {
    const items = await listKnowledgeItems(env, {
      category: url.searchParams.get("category") || undefined,
      item_type: url.searchParams.get("item_type") || undefined,
      status: url.searchParams.get("status") || undefined,
      limit: 200
    });
    return html(renderKnowledgeList(items, url));
  }

  const detailMatch = url.pathname.match(/^\/admin\/knowledge\/([0-9a-f-]+)$/i);
  if (request.method === "GET" && detailMatch) {
    const item = await getKnowledgeItem(env, detailMatch[1]);
    if (!item) return text("Not found", 404);
    return html(renderKnowledgeDetail(item));
  }

  if (request.method === "PATCH" && detailMatch) {
    const body = await request.json() as { status?: string };
    if (!body.status || !statuses.includes(body.status)) {
      return json({ ok: false, error: "Invalid status" }, 400);
    }
    const item = await updateKnowledgeItem(env, detailMatch[1], {
      status: body.status as KnowledgeItem["status"],
      updated_at: new Date().toISOString()
    });
    return json({ ok: true, item });
  }

  if (request.method === "DELETE" && detailMatch) {
    await deleteKnowledgeItem(env, detailMatch[1]);
    return json({ ok: true });
  }

  return text("Not found", 404);
}

async function isAuthorized(request: Request, env: Env): Promise<boolean> {
  if (!env.ADMIN_PASSWORD) {
    return false;
  }

  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Basic ")) {
    return false;
  }

  let decoded = "";
  try {
    decoded = atob(auth.slice("Basic ".length));
  } catch {
    return false;
  }

  const [, password = ""] = decoded.split(":", 2);
  return timingSafeEqual(password, env.ADMIN_PASSWORD);
}

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;

  for (let index = 0; index < length; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }

  return diff === 0;
}

function renderKnowledgeList(items: KnowledgeItem[], url: URL): string {
  const currentCategory = url.searchParams.get("category") ?? "";
  const currentType = url.searchParams.get("item_type") ?? "";
  const currentStatus = url.searchParams.get("status") ?? "";

  return page("Knowledge Base", `
    <header>
      <h1>Knowledge Base</h1>
      <p>${items.length} items</p>
    </header>
    <form class="filters" method="GET">
      ${select("category", "Category", categories, currentCategory)}
      ${select("item_type", "Type", itemTypes, currentType)}
      ${select("status", "Status", statuses, currentStatus)}
      <button type="submit">Filter</button>
      <a class="button secondary" href="/admin/knowledge">Reset</a>
    </form>
    <main class="list">
      ${items.map(renderKnowledgeCard).join("") || `<p class="empty">No items found.</p>`}
    </main>
  `);
}

function renderKnowledgeDetail(item: KnowledgeItem): string {
  return page(item.title, `
    <header>
      <a href="/admin/knowledge">Back</a>
      <h1>${escapeHtml(item.title)}</h1>
      <p>${escapeHtml(item.category)} / ${escapeHtml(item.item_type)} / ${escapeHtml(item.status)}</p>
    </header>
    <main class="detail">
      <section>
        <label>Status</label>
        <select id="status">${statuses.map((status) => `<option value="${status}" ${status === item.status ? "selected" : ""}>${status}</option>`).join("")}</select>
        <button onclick="updateStatus('${item.id}')">Save Status</button>
        <button class="danger" onclick="deleteItem('${item.id}')">Delete</button>
        <button onclick="copyContent()">Copy Content</button>
      </section>
      <section>
        <h2>Content</h2>
        <pre id="copyable">${escapeHtml(item.content)}</pre>
      </section>
      <section>
        <h2>AI Summary</h2>
        <p>${escapeHtml(item.ai_summary)}</p>
      </section>
      <section>
        <h2>Possible Article</h2>
        <p>${escapeHtml(item.article_idea)}</p>
      </section>
      <section>
        <h2>Raw Input</h2>
        <pre>${escapeHtml(item.raw_input)}</pre>
      </section>
      <section>
        <h2>Metadata</h2>
        <p><strong>Tags:</strong> ${item.tags.map(escapeHtml).join(", ")}</p>
        <p><strong>Source URL:</strong> ${item.source_url ? `<a href="${escapeAttr(item.source_url)}" target="_blank">${escapeHtml(item.source_url)}</a>` : "none"}</p>
        <p><strong>Created:</strong> ${escapeHtml(item.created_at)}</p>
      </section>
    </main>
    <script>
      async function updateStatus(id) {
        const status = document.getElementById("status").value;
        const res = await fetch("/admin/knowledge/" + id, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status })
        });
        if (!res.ok) alert("Failed to update status");
      }
      async function deleteItem(id) {
        if (!confirm("Delete this item?")) return;
        const res = await fetch("/admin/knowledge/" + id, { method: "DELETE" });
        if (res.ok) location.href = "/admin/knowledge";
        else alert("Failed to delete item");
      }
      async function copyContent() {
        await navigator.clipboard.writeText(document.getElementById("copyable").innerText);
      }
    </script>
  `);
}

function renderKnowledgeCard(item: KnowledgeItem): string {
  return `
    <article class="card">
      <a href="/admin/knowledge/${item.id}"><h2>${escapeHtml(item.title)}</h2></a>
      <p>${escapeHtml(item.ai_summary)}</p>
      <div class="meta">
        <span>${escapeHtml(item.category)}</span>
        <span>${escapeHtml(item.item_type)}</span>
        <span>${escapeHtml(item.status)}</span>
      </div>
      <div class="tags">${item.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
    </article>
  `;
}

function select(name: string, label: string, options: string[], current: string): string {
  return `
    <label>${label}
      <select name="${name}">
        <option value="">All</option>
        ${options.map((option) => `<option value="${escapeAttr(option)}" ${option === current ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
      </select>
    </label>
  `;
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; color: #18202a; background: #f6f7f9; }
    header, .filters, main { max-width: 1120px; margin: 0 auto; padding: 20px; }
    header { padding-top: 28px; }
    h1 { margin: 0 0 6px; font-size: 28px; }
    h2 { margin: 0 0 10px; font-size: 18px; }
    p { line-height: 1.55; }
    a { color: #0b5cad; text-decoration: none; }
    .filters { display: flex; gap: 12px; align-items: end; flex-wrap: wrap; background: #ffffff; border-block: 1px solid #e4e7eb; }
    label { display: grid; gap: 6px; font-size: 13px; color: #4b5563; }
    select, button, .button { min-height: 36px; border: 1px solid #cdd5df; border-radius: 6px; background: #fff; padding: 0 12px; color: #18202a; }
    button, .button { cursor: pointer; display: inline-flex; align-items: center; font-weight: 600; }
    button { background: #0b5cad; border-color: #0b5cad; color: #fff; }
    button.danger { background: #b42318; border-color: #b42318; }
    .button.secondary { color: #18202a; }
    .list { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
    .card, .detail section { background: #fff; border: 1px solid #e4e7eb; border-radius: 8px; padding: 16px; }
    .meta, .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
    .meta span, .tags span { background: #eef2f7; border-radius: 999px; padding: 4px 8px; font-size: 12px; }
    .detail { display: grid; gap: 14px; }
    .detail section:first-child { display: flex; gap: 10px; align-items: end; flex-wrap: wrap; }
    pre { white-space: pre-wrap; word-break: break-word; background: #f8fafc; border: 1px solid #e4e7eb; border-radius: 6px; padding: 12px; }
    .empty { color: #667085; }
  </style>
</head>
<body>${body}</body>
</html>`;
}

function html(body: string): Response {
  return new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function text(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char] ?? char));
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
