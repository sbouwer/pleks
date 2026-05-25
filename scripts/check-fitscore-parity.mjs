/**
 * scripts/check-fitscore-parity.mjs — FitScore primitive parity-atomic CI enforcement
 *
 * Notes:  Enforces the §10.7 parity-atomic invariant: any PR that modifies a file
 *         under _pdf/primitives/ must include a corresponding change to the matching
 *         file under _web/primitives/ in the same changeset, and vice versa.
 *         Exclusion list: DocumentShell, RunningHeader, PageFooter, Watermark
 *         (paginated-chrome primitives — PDF-only by design, no web counterpart).
 *         Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §11.20, DOCTRINE.md parity-atomic invariant.
 */
import { execSync } from "child_process"

const PDF_PREFIX = "lib/reports/screening/_pdf/primitives/"
const WEB_PREFIX = "lib/reports/screening/_web/primitives/"

const EXCLUSIONS = new Set(["DocumentShell", "RunningHeader", "PageFooter", "Watermark"])

function getBase() {
  if (process.env.PARITY_BASE_SHA) return process.env.PARITY_BASE_SHA
  try {
    return execSync("git merge-base origin/main HEAD", { encoding: "utf8" }).trim()
  } catch {
    return "HEAD~1"
  }
}

const base = getBase()
let rawDiff = ""
try {
  rawDiff = execSync(`git diff --name-only ${base}..HEAD`, { encoding: "utf8" })
} catch {
  console.error("[fitscore-parity] ERROR — could not run git diff. Check PARITY_BASE_SHA.")
  process.exit(1)
}

const changed = rawDiff.trim().split("\n").filter(Boolean)

const pdfChanged = new Set()
const webChanged = new Set()

for (const f of changed) {
  const norm = f.replaceAll("\\", "/")
  if (norm.startsWith(PDF_PREFIX) && norm.endsWith(".tsx")) {
    const name = norm.slice(PDF_PREFIX.length).replace(/\.tsx$/, "")
    if (!EXCLUSIONS.has(name)) pdfChanged.add(name)
  }
  if (norm.startsWith(WEB_PREFIX) && norm.endsWith(".tsx")) {
    const name = norm.slice(WEB_PREFIX.length).replace(/\.tsx$/, "")
    if (!EXCLUSIONS.has(name)) webChanged.add(name)
  }
}

if (pdfChanged.size === 0 && webChanged.size === 0) {
  console.log("[fitscore-parity] OK — no primitives changed in this diff")
  process.exit(0)
}

const failures = []

for (const name of pdfChanged) {
  if (!webChanged.has(name)) {
    failures.push(`  _pdf/primitives/${name}.tsx changed without a matching _web/primitives/${name}.tsx update`)
  }
}
for (const name of webChanged) {
  if (!pdfChanged.has(name)) {
    failures.push(`  _web/primitives/${name}.tsx changed without a matching _pdf/primitives/${name}.tsx update`)
  }
}

if (failures.length > 0) {
  console.error("[fitscore-parity] Parity-atomic invariant violated (DOCTRINE.md §10.7 / §11.20):")
  for (const f of failures) console.error(f)
  console.error("")
  console.error("  Every _pdf/primitives/*.tsx change must have a corresponding _web/primitives/*.tsx")
  console.error("  update in the same changeset, and vice versa. Exclusions: DocumentShell,")
  console.error("  RunningHeader, PageFooter, Watermark (paginated-chrome — PDF-only by design).")
  process.exit(1)
}

console.log(`[fitscore-parity] OK — ${pdfChanged.size + webChanged.size} primitive(s) changed with symmetric parity`)
