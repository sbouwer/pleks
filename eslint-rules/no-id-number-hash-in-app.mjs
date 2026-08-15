/**
 * eslint-rules/no-id-number-hash-in-app.mjs — id_number_hash never leaves lib/, and never reaches a UI
 *
 * `hashIdNumber()` = SHA256(normalised SA ID + a GLOBAL salt). The salt is one env var, not per-org, so the
 * same human hashes IDENTICALLY in every organisation on the platform. `id_number_hash` is therefore already
 * a cross-org identity key by construction — on `applications`, `contacts` and `tenants`.
 *
 * Today every call site is org-scoped and it is rendered in no UI. But that invariant is held by the ABSENCE
 * OF A CALLER, not by a control: nothing stops the next feature from resolving one applicant across every
 * agency on Pleks. The moment an agent can see "this applicant also applied at another agency", Pleks has
 * built a shared tenant blacklist — a different product, with a different consent basis and a different
 * regulatory profile, shipped by accident. This rule is that missing control.
 *
 * SCOPE: anything under `app/` — pages, components AND route handlers. Legitimate uses are dedup and
 * analytics, and those live in `lib/` where the helpers already are (`idNumberColumns`, `hashIdNumber`,
 * the import identity matcher). An `app/` file needing it is doing identity resolution at the edge, which is
 * exactly what this exists to make visible.
 *
 * Matches the IDENTIFIER and the STRING alike — `.select("id_number_hash")`, `row.id_number_hash`,
 * `const { id_number_hash } = row`, and the camelCase `idNumberHash` — because a rule keyed to one AST shape
 * is trivially false-zeroed by destructuring or a re-export (see .claude/rules/lint-rules.md).
 *
 * Baseline: EMPTY — cleared, not grandfathered. Two of the three candidate sites hand-rolled
 * `id_number: encryptIdNumber(x)` alongside `id_number_hash: hashIdNumber(x)`; both now spread
 * `idNumberColumns(x)`, the canonical write helper that bundles exactly that pair. The third was a false
 * positive from the grep used to seed the baseline — its only match was inside a COMMENT, which ESLint
 * never parses as an Identifier or Literal.
 *
 * A ZERO baseline is the point: every hit is then a real regression, with no judgement call about whether
 * a given site was pre-existing. Baselines only shrink, and this one has nowhere left to shrink to.
 * See brief/build/SPEC_ANALYTICS_CAPTURE.md §2.3.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const BASELINE = new Set(JSON.parse(readFileSync(join(here, "no-id-number-hash-in-app.baseline.json"), "utf8")))

const CWD = process.cwd().replaceAll("\\", "/").replace(/\/$/, "") + "/"
function relPath(context) {
  const file = (context.filename ?? context.getFilename?.() ?? "").replaceAll("\\", "/")
  return file.startsWith(CWD) ? file.slice(CWD.length) : file
}

/** Both spellings: the DB column and the JS-side alias. */
const BANNED = new Set(["id_number_hash", "idNumberHash"])

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: { description: "id_number_hash is a cross-org identity key — it must not appear under app/." },
    messages: {
      leaked:
        "`{{name}}` must not appear under app/. It is SHA256(SA ID + a GLOBAL salt), so the same person hashes identically in EVERY org — surfacing or querying it at the edge is how a shared tenant blacklist gets built by accident (different product, different consent basis, different regulatory profile). Keep the lookup in lib/ (hashIdNumber / idNumberColumns / the import identity matcher), org-scoped and service-role only. If this site is genuinely unavoidable, add it to eslint-rules/no-id-number-hash-in-app.baseline.json with a reason — baselines only shrink. See brief/build/SPEC_ANALYTICS_CAPTURE.md §2.3.",
    },
    schema: [],
  },
  create(context) {
    const file = relPath(context)
    if (!file.startsWith("app/")) return {}
    if (BASELINE.has(file)) return {}

    const report = (node, name) => context.report({ node, messageId: "leaked", data: { name } })

    return {
      // row.id_number_hash · { id_number_hash } · { id_number_hash: x } · a bare reference
      Identifier(node) {
        if (!BANNED.has(node.name)) return
        report(node, node.name)
      },
      // .select("id_number_hash") · .eq("id_number_hash", x) · any string carrying the column name
      Literal(node) {
        if (typeof node.value !== "string") return
        if (!BANNED.has(node.value) && !node.value.includes("id_number_hash")) return
        report(node, "id_number_hash")
      },
      // `...${x} id_number_hash...` in a template literal (a select string built by hand)
      TemplateElement(node) {
        const raw = node.value?.cooked ?? node.value?.raw ?? ""
        if (!raw.includes("id_number_hash")) return
        report(node, "id_number_hash")
      },
    }
  },
}

export default rule
