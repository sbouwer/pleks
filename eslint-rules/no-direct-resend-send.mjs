/**
 * eslint-rules/no-direct-resend-send.mjs — every outbound email goes through sendEmail()
 *
 * lib/comms/send-email.ts is the single choke point: it applies the opt-out check (canSend), the org's
 * branding via the central EmailLayout, the Resend idempotency key, and the communication_log audit row
 * (which is what the delivery-feedback webhook joins on via external_id). A module that calls
 * resend.emails.send() directly bypasses ALL of that — the email ships unbranded, unlogged, and invisible
 * to the delivery-feedback loop.
 *
 * The pre-existing bypasses are grandfathered in no-direct-resend-send.baseline.json and burning down.
 * The baseline only SHRINKS — remove a file from it as you migrate it. A NEW bypass fails immediately.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const baseline = new Set(
  JSON.parse(readFileSync(join(here, "no-direct-resend-send.baseline.json"), "utf8")).files,
)

/** Repo-relative, forward-slashed path for stable comparison against the baseline. */
function relPath(context) {
  const file = (context.filename ?? context.getFilename?.() ?? "").replaceAll("\\", "/")
  const i = file.lastIndexOf("/lib/")
  const j = file.lastIndexOf("/app/")
  const cut = Math.max(i, j)
  return cut === -1 ? file : file.slice(cut + 1)
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: { description: "Outbound email must go through sendEmail(), never resend.emails.send() directly." },
    messages: {
      noDirect:
        "Do not call resend.emails.send() directly — it bypasses the opt-out check, the central branded EmailLayout, the idempotency key, and the communication_log row the delivery webhook joins on. Use sendEmail({ contentHtml }) from @/lib/comms/send-email (or sendPlatformEmail for agency-admin mail with a retry net).",
    },
    schema: [],
  },
  create(context) {
    const file = relPath(context)
    // send-email.ts IS the choke point — it is the one place allowed to talk to Resend.
    if (file.endsWith("lib/comms/send-email.ts")) return {}
    if (baseline.has(file)) return {}

    return {
      // Matches `<anything>.emails.send(...)` — resend.emails.send, getResend().emails.send, this.resend.emails.send
      "CallExpression > MemberExpression[property.name='send'] > MemberExpression[property.name='emails']"(node) {
        context.report({ node: node.parent, messageId: "noDirect" })
      },
    }
  },
}

export default rule
