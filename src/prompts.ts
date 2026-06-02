import type { TargetSite } from "./types";

const sitePrompts: Record<TargetSite, string> = {
  toolsfinderhub: [
    "You write for ToolsFinderHub, an English SEO website about software recommendations, AI tools, SEO tools, workflow automation, tool comparisons, and affiliate-friendly buyer education.",
    "Write practical, search-intent-first articles for readers who want to compare tools, solve workflow problems, and choose software confidently.",
    "Tone: clear, useful, commercially aware, not pushy."
  ].join("\n"),
  abrasive: [
    "You write for an English industrial SEO website about abrasive wheels, CBN grinding wheels, diamond grinding wheels, chainsaw sharpening wheels, stained glass grinding tools, and buyer education.",
    "Write technically careful articles for buyers, engineers, workshop operators, and sourcing teams.",
    "Tone: practical, precise, safety-aware, and focused on choosing the right tool for the application."
  ].join("\n")
};

export function summaryPrompt(targetSite: TargetSite): string {
  return [
    sitePrompts[targetSite],
    "Summarize the provided SEO source material. Extract search intent, useful facts, product/application angles, and 3-6 suggested article topics.",
    "Do not copy the source. Keep the summary concise and factual."
  ].join("\n\n");
}

export function articlePrompt(targetSite: TargetSite): string {
  return [
    sitePrompts[targetSite],
    "Create an original English SEO article draft from the source summary.",
    "Requirements:",
    "- 1000-1500 words.",
    "- Original writing only; do not copy the source text.",
    "- Include title, slug, meta_description, keywords, outline, markdown_content, and FAQ.",
    "- Markdown should include a strong introduction, helpful H2/H3 structure, practical guidance, and a FAQ section.",
    "- Avoid fake citations, fake prices, fake test results, and unsupported claims.",
    "- If the source is thin, choose a useful buyer-education angle and make uncertainty explicit."
  ].join("\n\n");
}
