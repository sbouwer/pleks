/**
 * eslint-rules/no-raw-cron-secret.mjs — the cron secret is compared in exactly one place
 *
 * Every cron route is an independently HTTP-reachable production endpoint, and its ONLY gate is the
 * secret check. 32 routes each re-typed `secret !== process.env.CRON_SECRET` — a non-constant-time
 * compare that leaks the secret's length and matching prefix through response timing. Three of them also
 * accepted the secret as a `?secret=` query param, putting it into access logs, proxy logs, and browser
 * history.
 *
 * lib/cron/auth.ts is now the one place CRON_SECRET is read: requireCronAuth() to gate a route,
 * internalCronHeaders() for the orchestrator to authorise its in-process children.
 *
 * NO ALLOWLIST, deliberately. An allowlisted exception is where the next raw read hides — the audit that
 * prompted this rule found three SSOTs that already existed and were simply bypassed. A centre without a
 * lint rule is a suggestion; with one, it's an invariant.
 */

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: { description: "CRON_SECRET may only be read inside lib/cron/ — gate routes with requireCronAuth()." },
    messages: {
      rawSecret:
        "Do not read process.env.CRON_SECRET here. Gate the route with `requireCronAuth(req)` from @/lib/cron/auth (constant-time; returns a 401 Response or null). The orchestrator uses `internalCronHeaders()`. A hand-rolled `!==` is a timing side-channel.",
      queryParamSecret:
        "Never accept the cron secret from a query param — it leaks into access logs, proxy logs, and browser history. Use the x-cron-secret header via requireCronAuth(req).",
    },
    schema: [],
  },
  create(context) {
    const file = (context.filename ?? context.getFilename?.() ?? "").replaceAll("\\", "/")
    const inCronLib = file.includes("/lib/cron/")

    return {
      // process.env.CRON_SECRET  (and any member access off it)
      "MemberExpression[property.name='CRON_SECRET']"(node) {
        if (inCronLib) return
        const obj = node.object
        const isProcessEnv =
          obj?.type === "MemberExpression" &&
          obj.object?.type === "Identifier" && obj.object.name === "process" &&
          obj.property?.type === "Identifier" && obj.property.name === "env"
        if (isProcessEnv) context.report({ node, messageId: "rawSecret" })
      },
      // searchParams.get("secret") — the query-param fallback, banned everywhere including lib/cron.
      "CallExpression[callee.property.name='get'][arguments.0.value='secret']"(node) {
        const callee = node.callee
        if (callee.object?.type === "MemberExpression" && callee.object.property?.name === "searchParams") {
          context.report({ node, messageId: "queryParamSecret" })
        }
        if (callee.object?.type === "Identifier" && /searchParams/i.test(callee.object.name)) {
          context.report({ node, messageId: "queryParamSecret" })
        }
      },
    }
  },
}

export default rule
