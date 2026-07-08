/**
 * eslint-rules/require-id-number-encryption.mjs — SA id_number must be encrypted at rest on every write
 *
 * A service-client write (`insert` / `update` / `upsert`) whose object literal sets `id_number:` MUST wrap the
 * value in `encryptIdNumber(...)` (or set it to `null` to clear). The canonical write helper is `idNumberColumns`
 * / `contactIdNumberColumns` (lib/crypto/idNumber.ts), which spreads `...idNumberColumns(raw)` — a spread has no
 * literal `id_number:` key, so it's never flagged. A raw `id_number: someValue` write persists a plaintext SA ID
 * (national identifier → impersonation/credit fraud) — SECURITY RULE #5. This guard is the drift-stop that makes
 * the encryption a build, not a one-time patch (the sweep proved a manual fix drifts back).
 *
 * Scope: literal object arguments to insert/update/upsert only (a variable/array-of-vars arg can't be inspected).
 * Allowed values: `encryptIdNumber(...)`, `null`, `undefined`. Anything else fails.
 *
 * A legitimate exception (e.g. a value already encrypted upstream and passed by reference) uses an explicit
 * `// eslint-disable-next-line pleks/require-id-number-encryption -- <reason>` on the property.
 * NOTE: date_of_birth + gender are intentionally NOT covered — they stay plaintext (CD ruling 2026-07-07).
 */

const MUTATORS = new Set(["insert", "update", "upsert"])

/** encryptIdNumber(...) — the only allowed producing call. */
function isEncryptCall(node) {
  return (
    node?.type === "CallExpression" &&
    node.callee.type === "Identifier" &&
    node.callee.name === "encryptIdNumber"
  )
}

/** A value is safe for an `id_number:` write if it's encryptIdNumber(...), null, or undefined. */
function isAllowedValue(node) {
  if (isEncryptCall(node)) return true
  if (node.type === "Literal" && node.value === null) return true
  if (node.type === "Identifier" && node.name === "undefined") return true
  return false
}

/** Return the offending `id_number` Property node in an ObjectExpression, or null. */
function offendingIdNumberProp(objExpr) {
  if (objExpr?.type !== "ObjectExpression") return null
  for (const p of objExpr.properties) {
    if (p.type !== "Property" || p.computed) continue
    const isIdNumber =
      (p.key.type === "Identifier" && p.key.name === "id_number") ||
      (p.key.type === "Literal" && p.key.value === "id_number")
    if (isIdNumber && !isAllowedValue(p.value)) return p
  }
  return null
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: { description: "Require SA id_number to be encrypted (encryptIdNumber / idNumberColumns) on every DB write." },
    messages: {
      rawIdNumber:
        "Raw `id_number` write — persists a plaintext SA ID (SECURITY RULE #5). Spread `...idNumberColumns(raw)` (encrypts + hashes together) or use `id_number: encryptIdNumber(raw)`. See lib/crypto/idNumber.ts. If the value is already encrypted upstream, add `// eslint-disable-next-line pleks/require-id-number-encryption -- <reason>`.",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== "MemberExpression" || node.callee.property.type !== "Identifier") return
        if (!MUTATORS.has(node.callee.property.name)) return
        const arg = node.arguments[0]
        if (!arg) return
        const objects = arg.type === "ArrayExpression" ? arg.elements : [arg]
        for (const obj of objects) {
          const offending = offendingIdNumberProp(obj)
          if (offending) context.report({ node: offending, messageId: "rawIdNumber" })
        }
      },
    }
  },
}

export default rule
