/**
 * eslint-rules/no-rerolled-phone-normalise.mjs — SA phone normalisation lives in lib/validation/contact
 *
 * `checkPhone` / `normalizePhone` (libphonenumber-backed, SA-strict, E.164-or-null) is the SSOT. Three
 * files had each hand-rolled a weaker `normalizeSAPhone` that STRIPPED non-digits and PASSED THROUGH
 * anything it did not recognise (`return phone`) — so an unmatchable number reached Africa's Talking
 * unchanged where the SSOT would have rejected it, and the canonical form depended on which caller dialled.
 *
 * This forbids DEFINING a phone normaliser outside lib/validation: a `function`/`const` whose name matches
 * /normali[sz]e.*phone/i. Import `normalizePhone` (E.164 | null) or `checkPhone`; senders normalise at the
 * choke point (sendSMS). Two files are baselined and burning down: `consent/verification.ts`
 * (`normalizePhoneZA` is a genuine copy, but it feeds the OTP send path so migrating it changes validation
 * semantics — its own review) and `searchworx/utils.ts` (a STRUCTURED bureau-phone parser taking
 * {DialCode, Number}, not a raw-string SA normaliser — a different operation). Baselines only shrink.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const BASELINE = new Set(JSON.parse(readFileSync(join(here, "no-rerolled-phone-normalise.baseline.json"), "utf8")))

const CWD = process.cwd().replaceAll("\\", "/").replace(/\/$/, "") + "/"
function relPath(context) {
  const file = (context.filename ?? context.getFilename?.() ?? "").replaceAll("\\", "/")
  return file.startsWith(CWD) ? file.slice(CWD.length) : file
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: { description: "Phone normalisation is defined only in lib/validation/contact — import checkPhone / normalizePhone." },
    messages: {
      rerolled:
        "Do not define a phone normaliser here. Import `normalizePhone` (E.164 | null) or `checkPhone` from @/lib/validation/contact — a hand-rolled `\\D`-strip is weaker (it passes unparseable numbers through to the SMS/WhatsApp provider). Senders normalise at the choke point (sendSMS).",
    },
    schema: [],
  },
  create(context) {
    const file = relPath(context)
    if (file.startsWith("lib/validation/") || file.includes("/lib/validation/")) return {}
    if (BASELINE.has(file)) return {}
    const NAME = /normali[sz]e.*phone/i

    function check(id, node) {
      if (id?.type === "Identifier" && NAME.test(id.name)) {
        context.report({ node, messageId: "rerolled" })
      }
    }
    return {
      FunctionDeclaration(node) { check(node.id, node) },
      "VariableDeclarator > ArrowFunctionExpression, VariableDeclarator > FunctionExpression"(node) {
        check(node.parent.id, node.parent)
      },
    }
  },
}

export default rule
