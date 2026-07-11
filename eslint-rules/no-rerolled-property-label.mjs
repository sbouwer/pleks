/**
 * eslint-rules/no-rerolled-property-label.mjs — "unit, property" labels go through formatPropertyLabel
 *
 * `formatPropertyLabel(unit)` / `resolvePropertyLabel(db, unitId)` in lib/properties is the SSOT. ~100 sites
 * hand-built `${unit.unit_number}, ${unit.properties.name}` inline, each with its own separator, fallback and
 * null-handling — so the same unit rendered differently across dashboard, emails, PDFs and the tenant portal.
 *
 * This is SHAPE-based, not name-based: it flags a TEMPLATE LITERAL that concatenates a `…unit_number` member
 * access with a `…properties…` member chain (the label signature). A select string `select("unit_number,
 * properties(name)")` is a Literal, not a template concat — not flagged. Sites that legitimately need a shape
 * the helper doesn't yet own (search-index blobs, a "Unit " prefix) are baselined with their reason. Baselines
 * only shrink.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const BASELINE = new Set(JSON.parse(readFileSync(join(here, "no-rerolled-property-label.baseline.json"), "utf8")))

const CWD = process.cwd().replaceAll("\\", "/").replace(/\/$/, "") + "/"
function relPath(context) {
  const file = (context.filename ?? context.getFilename?.() ?? "").replaceAll("\\", "/")
  return file.startsWith(CWD) ? file.slice(CWD.length) : file
}

/** A member access ending in `.unit_number` (any receiver: unit.unit_number, listing.units.unit_number, …). */
function isUnitNumberAccess(node) {
  return node?.type === "MemberExpression" && node.property?.type === "Identifier" && node.property.name === "unit_number"
}

/** Does this member chain pass through a `.properties` access? (unit.properties.name, u.properties.suburb, …) */
function chainHasProperties(node) {
  let cur = node
  while (cur?.type === "MemberExpression") {
    if (cur.property?.type === "Identifier" && cur.property.name === "properties") return true
    cur = cur.object
  }
  return false
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: { description: "Unit/property display labels render through formatPropertyLabel() from lib/properties — never an inline template concat." },
    messages: {
      rerolled:
        "Do not hand-build a `${unit.unit_number}, ${unit.properties.name}` label. Use `formatPropertyLabel(unit, { separator?, fallback? })` from @/lib/properties/propertyLabel (or `resolvePropertyLabel(db, unitId)` when you only have an id) so every surface renders a unit identically. Pass your existing separator/fallback to keep the wording.",
    },
    schema: [],
  },
  create(context) {
    const file = relPath(context)
    if (file.startsWith("lib/properties/") || file.includes("/lib/properties/")) return {}
    if (BASELINE.has(file)) return {}
    if (file.includes("/eslint-rules/")) return {}

    return {
      TemplateLiteral(node) {
        const exprs = node.expressions
        const hasUnit = exprs.some(isUnitNumberAccess)
        const hasProperty = exprs.some(chainHasProperties)
        if (hasUnit && hasProperty) context.report({ node, messageId: "rerolled" })
      },
    }
  },
}

export default rule
