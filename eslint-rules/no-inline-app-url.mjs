/**
 * eslint-rules/no-inline-app-url.mjs — build absolute URLs with absoluteUrl(), not `${APP_URL}/…`
 *
 * A link in an email or PDF must be absolute AND resolve against the one origin. `APP_URL` / `MARKETING_URL`
 * (lib/env) already centralise the origin with a single canonical default, but interpolating them inline —
 * `` `${APP_URL}/x` `` — spreads the slash-joining logic across every call site, so one site double-slashes,
 * another forgets the leading `/`, a third hardcodes the origin next to it. `absoluteUrl(path)` /
 * `marketingUrl(path)` in lib/routing is the one place a path becomes a full URL.
 *
 * This flags a TEMPLATE LITERAL that interpolates `APP_URL` or `MARKETING_URL`. Reading them bare
 * (`const origin = APP_URL`) is fine — only inline URL construction is the target. Baselined sites (dashboard
 * pages, actions, API routes) are burning down; the email/PDF surface migrated first. Baselines only shrink.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const BASELINE = new Set(JSON.parse(readFileSync(join(here, "no-inline-app-url.baseline.json"), "utf8")))

const CWD = process.cwd().replaceAll("\\", "/").replace(/\/$/, "") + "/"
function relPath(context) {
  const file = (context.filename ?? context.getFilename?.() ?? "").replaceAll("\\", "/")
  return file.startsWith(CWD) ? file.slice(CWD.length) : file
}

const ORIGIN_NAMES = new Set(["APP_URL", "MARKETING_URL"])

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: { description: "Absolute URLs are built with absoluteUrl()/marketingUrl() from lib/routing, not inline `${APP_URL}`." },
    messages: {
      inline:
        "Do not build a URL inline with `${APP_URL}` / `${MARKETING_URL}`. Use `absoluteUrl(path)` (product) or `marketingUrl(path)` from @/lib/routing/absoluteUrl — one place joins origin + path, so a slash or a hardcoded origin can't drift per call site.",
    },
    schema: [],
  },
  create(context) {
    const file = relPath(context)
    if (file.startsWith("lib/routing/") || file.includes("/lib/routing/")) return {}
    if (BASELINE.has(file)) return {}
    if (file.includes("/eslint-rules/")) return {}

    return {
      TemplateLiteral(node) {
        const hit = node.expressions.some((e) => e.type === "Identifier" && ORIGIN_NAMES.has(e.name))
        if (hit) context.report({ node, messageId: "inline" })
      },
    }
  },
}

export default rule
