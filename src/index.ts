import { handleKnowledgeAdmin } from "./admin";
import { handleTelegramWebhook } from "./telegram";
import type { Env, TelegramUpdate } from "./types";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "seo-materials-telegram-bot" });
    }

    if (url.pathname === "/admin/knowledge" || url.pathname.startsWith("/admin/knowledge/")) {
      try {
        return await handleKnowledgeAdmin(request, env);
      } catch (error) {
        console.error(JSON.stringify({ event: "admin_error", error: String(error) }));
        return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
      }
    }

    if (request.method === "POST" && url.pathname === "/telegram/webhook") {
      try {
        const update = await request.json() as TelegramUpdate;
        await handleTelegramWebhook(env, update);
        return json({ ok: true });
      } catch (error) {
        console.error(JSON.stringify({ event: "webhook_error", error: String(error) }));
        return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
      }
    }

    return json({ ok: false, error: "Not found" }, 404);
  }
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
