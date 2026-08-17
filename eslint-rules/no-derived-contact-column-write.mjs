/**
 * eslint-rules/no-derived-contact-column-write.mjs — contacts.primary_email/primary_phone are DERIVED
 *
 * `contact_emails` and `contact_phones` are the authoritative representations. Database triggers
 * (002_contacts.sql §22 and §23) maintain `contacts.primary_email` / `contacts.primary_phone` from the
 * single `(is_primary AND is_active)` child row. Application code writes the SET, never the cache —
 * via `syncPrimaryContactEmail()` / `syncPrimaryContactPhone()` in lib/contacts.
 *
 * WHY A RULE AND NOT A GREP. The unification's writer list came up short THREE times across the arc
 * (CD §10.3) — `parties.ts` alone had 9 write sites where 4 were enumerated. The defect a missed site
 * produces is silent: the direct write lands, the trigger overwrites it on the next child-row mutation
 * or simply never agrees with it, and the two representations diverge again exactly as they did before
 * the migration. Nothing fails. Nothing logs. The failure is only visible as a wrong phone number on a
 * statutory notice months later. A grep counts what you point it at; this counts what exists.
 *
 * READS ARE FINE and are not flagged — the column remains a legitimate read-side cache. Only writes
 * are: a `primary_email:` / `primary_phone:` key in an object literal, or an assignment to a
 * `.primary_email` / `.primary_phone` member. `.select("… primary_phone")` is a string, `c.primary_phone`
 * is a read, and `primary_phone?: string` on an interface is a type — none of the three parse as a write.
 *
 * WHAT IT COVERS, EXACTLY — stated because an unstated blind spot is how a rule becomes decoration.
 * It follows the ARGUMENT of a `.insert()` / `.update()` / `.upsert()` call and reports the column only where
 * it can prove the value reaches the write. It resolves: object literals · spreads · array arguments ·
 * `await` / `as` / `!` wrappers · a payload held in a local variable (including `payload.primary_phone = …`
 * mutations on it) · a payload returned by a same-file builder function · a row array built inline with
 * `.map()` / `.flatMap()` · and it SUBTRACTS keys removed by a rest destructure, so the strip-before-write
 * fix does not report as a violation.
 *
 * The `.map()` arm exists because the step-4 sweep found `insertCompanyPeople` writing through it while this
 * rule stayed silent — a reminder that each shape is covered because someone hit it, not by construction.
 *
 * ⚠ IT DOES NOT SEE a payload that arrives as a FUNCTION PARAMETER. A parameter has no initialiser, so a
 * helper like `patchContactRecomputing(service, id, orgId, contactUpdate)` — which strips a key from its
 * parameter and writes the rest — is opaque to this rule in both directions: it cannot confirm a violation
 * and it cannot confirm safety. Those helpers were swept by hand alongside this rule; a NEW one is this
 * rule's known gap. If you add a write helper that takes its payload as a parameter, the rule will not
 * cover you — strip the derived columns at the top of it, as the existing ones do.
 *
 * EXEMPT BY PATH, deliberately and permanently:
 *   lib/popia/anonymisePlan.ts — nulls both columns explicitly next to erasing the child sets. That is
 *   the belt to the triggers' braces: it keeps a POPIA s24 erasure correct even if a trigger is ever
 *   dropped, disabled or replaced. See the ⛔ comment at the site. NOT a burn-down entry — it is right.
 *
 *   ⚠ PROBED: with this exemption disabled the rule reports ZERO on that file, because the plan's fields
 *   reach the DB through `stripGroup`'s parameter in anonymiseIdentity.ts — the blind spot above. So the
 *   exemption is currently belt-and-braces, NOT load-bearing. It is kept so the file stays correct if this
 *   rule ever learns to follow parameters, but do not mistake it for what protects that site today.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const BASELINE = new Set(JSON.parse(readFileSync(join(here, "no-derived-contact-column-write.baseline.json"), "utf8")))

const DERIVED = new Set(["primary_email", "primary_phone"])

const CWD = process.cwd().replaceAll("\\", "/").replace(/\/$/, "") + "/"
function relPath(context) {
  const file = (context.filename ?? context.getFilename?.() ?? "").replaceAll("\\", "/")
  return file.startsWith(CWD) ? file.slice(CWD.length) : file
}

const FUNCTION_NODES = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"])

/** Visit every `return <arg>` in a function body, without descending into nested functions. */
function forEachReturnArgument(node, visit) {
  if (!node || typeof node.type !== "string") return
  if (node.type === "ReturnStatement") { if (node.argument) visit(node.argument); return }
  if (FUNCTION_NODES.has(node.type)) return
  for (const key of Object.keys(node)) {
    if (key === "parent") continue
    const child = node[key]
    if (Array.isArray(child)) { for (const c of child) forEachReturnArgument(c, visit) }
    else if (child && typeof child.type === "string") forEachReturnArgument(child, visit)
  }
}

/** The name a Property/MemberExpression key resolves to, for both `foo` and `"foo"` spellings. */
function keyName(node, computed) {
  if (!node) return null
  if (node.type === "Identifier" && !computed) return node.name
  if (node.type === "Literal" && typeof node.value === "string") return node.value
  return null
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: { description: "contacts.primary_email/primary_phone are derived caches — write the child table instead." },
    messages: {
      derivedWrite:
        "`contacts.{{column}}` is a DERIVED cache — a database trigger (002_contacts.sql §22/§23) maintains it from the single (is_primary AND is_active) row in {{table}}. Writing it here either gets silently overwritten or silently diverges; nothing fails loudly either way. Write the authoritative row instead: `{{helper}}()` from @/lib/contacts. If this is a READ, take it off the write payload. If it is genuinely neither, add the file to eslint-rules/no-derived-contact-column-write.baseline.json with a reason.",
    },
    schema: [],
  },
  create(context) {
    const file = relPath(context)
    if (BASELINE.has(file)) return {}
    if (file.includes("/eslint-rules/")) return {}
    // The deliberate belt-and-braces erasure site — see the header. Permanent, not a burn-down.
    if (file === "lib/popia/anonymisePlan.ts") return {}

    function report(node, column) {
      const isEmail = column === "primary_email"
      context.report({
        node,
        messageId: "derivedWrite",
        data: {
          column,
          table: isEmail ? "contact_emails" : "contact_phones",
          helper: isEmail ? "syncPrimaryContactEmail" : "syncPrimaryContactPhone",
        },
      })
    }

    // Dedupe: one payload variable can feed several writes, and each would re-report the same source line.
    const seenReports = new Set()
    function reportOnce(node, column) {
      const key = `${node.loc.start.line}:${node.loc.start.column}:${column}`
      if (seenReports.has(key)) return
      seenReports.add(key)
      report(node, column)
    }

    /** Resolve an identifier to its ESLint scope variable, walking outward. */
    function findVariable(node) {
      let scope = context.sourceCode.getScope(node)
      while (scope) {
        const found = scope.variables.find((v) => v.name === node.name)
        if (found) return found
        scope = scope.upper
      }
      return null
    }

    function checkPayload(node, seen, excluded = new Set()) {
      if (!node) return
      switch (node.type) {
        case "ObjectExpression":
          for (const prop of node.properties) {
            if (prop.type === "Property") {
              const name = keyName(prop.key, prop.computed)
              if (name && DERIVED.has(name) && !excluded.has(name)) reportOnce(prop, name)
            } else if (prop.argument) {
              checkPayload(prop.argument, seen, excluded)   // { ...payload }
            }
          }
          return
        case "ArrayExpression":
          for (const el of node.elements) checkPayload(el, seen, excluded)   // .insert([{…}, {…}])
          return
        case "ConditionalExpression":
          checkPayload(node.consequent, seen, excluded); checkPayload(node.alternate, seen, excluded)
          return
        case "AwaitExpression":
        case "TSAsExpression":
        case "TSNonNullExpression":
          checkPayload(node.expression ?? node.argument, seen, excluded)
          return
        case "CallExpression": {
          // `.insert(rows.map(r => ({ … })))` — an array payload built inline. Found by the step-4 sweep:
          // insertCompanyPeople writes through exactly this shape and the rule was silent on it.
          if (node.callee?.type === "MemberExpression") {
            const method = keyName(node.callee.property, node.callee.computed)
            if (method !== "map" && method !== "flatMap") return
            const cb = node.arguments[0]
            if (!cb || !FUNCTION_NODES.has(cb.type)) return
            if (cb.body?.type !== "BlockStatement") checkPayload(cb.body, seen, excluded)
            else forEachReturnArgument(cb.body, (arg) => checkPayload(arg, seen, excluded))
            return
          }
          // A payload built by a local helper — `.update(buildContactScalarUpdate(f))`. parties.ts hides most
          // of its write sites behind exactly this shape, which is why the hand enumerations kept coming up
          // short there. Follow same-file builders into their return statements.
          if (node.callee?.type !== "Identifier") return
          const visitFn = `fn:${node.callee.name}|${[...excluded].sort().join(",")}`
          if (seen.has(visitFn)) return
          seen.add(visitFn)
          const variable = findVariable(node.callee)
          if (!variable) return
          for (const def of variable.defs) {
            const fn =
              def.node?.type === "FunctionDeclaration" ? def.node
              : def.node?.type === "VariableDeclarator" &&
                (def.node.init?.type === "ArrowFunctionExpression" || def.node.init?.type === "FunctionExpression")
                ? def.node.init
                : null
            if (!fn) continue
            if (fn.body?.type !== "BlockStatement") { checkPayload(fn.body, seen, excluded); return }
            forEachReturnArgument(fn.body, (arg) => checkPayload(arg, seen, excluded))
          }
          return
        }
        case "Identifier": {
          const visitKey = `${node.name}|${[...excluded].sort().join(",")}`
          if (seen.has(visitKey)) return
          seen.add(visitKey)
          const variable = findVariable(node)
          if (!variable) return
          for (const def of variable.defs) {
            if (def.node?.type !== "VariableDeclarator") continue
            // THE STRIP PATTERN. `const { primary_email: kept, ...rowPayload } = row` makes `rowPayload`
            // resolve back to `row` — which still carries the key. Following that naively reports every
            // CORRECTLY-FIXED site as a violation, and the obvious way to silence it is to put the direct
            // write back. So a rest binding subtracts every key its pattern named.
            const pattern = def.name?.parent?.type === "RestElement" ? def.name.parent.parent : null
            let nextExcluded = excluded
            if (pattern?.type === "ObjectPattern") {
              nextExcluded = new Set(excluded)
              for (const prop of pattern.properties) {
                if (prop.type !== "Property") continue
                const n = keyName(prop.key, prop.computed)
                if (n) nextExcluded.add(n)
              }
            }
            checkPayload(def.node.init, seen, nextExcluded)
          }
          // Builder mutation: `payload.primary_phone = …` anywhere the variable is referenced.
          for (const ref of variable.references) {
            const member = ref.identifier.parent
            if (member?.type !== "MemberExpression" || member.object !== ref.identifier) continue
            const assign = member.parent
            if (assign?.type !== "AssignmentExpression" || assign.left !== member) continue
            const name = keyName(member.property, member.computed)
            if (name && DERIVED.has(name) && !excluded.has(name)) reportOnce(assign, name)
          }
          return
        }
        default:
          return
      }
    }

    return {
      // Only a payload that actually REACHES a write is a defect. Mentioning the key is not: #244's pattern
      // deliberately builds the column into a payload so the completeness gate can judge it, then destructures
      // it out immediately before the write. Following the argument is what tells those two apart — and it is
      // why this rule cannot simply match the identifier `primary_phone` wherever it appears.
      CallExpression(node) {
        const callee = node.callee
        if (callee?.type !== "MemberExpression") return
        const method = keyName(callee.property, callee.computed)
        if (method !== "insert" && method !== "update" && method !== "upsert") return
        for (const arg of node.arguments) checkPayload(arg, new Set())
      },
    }
  },
}

export default rule
