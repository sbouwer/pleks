/**
 * scripts/check-action-freshness.mjs — every server action must leave the page it ran from fresh, or say why not
 *
 * A server action that writes and returns without `revalidatePath` / `revalidateTag` / `updateTag` /
 * `refresh` / `redirect` leaves the page it was called from showing what was there before the write, and
 * the client router cache (staleTimes.dynamic, next.config) keeps serving that page for a while after.
 * Nothing fails: tsc, lint and every test pass, and the user sees their change "not save" until a reload.
 *
 * Fails on:
 *   • an exported action in a "use server" module that calls none of those (directly, or through a function
 *     in the same file) and has no entry in scripts/action-freshness.baseline.json;
 *   • an export this scan cannot read as a function (a wrapped `withX(async …)`, `export default <expr>`, a
 *     re-export) with no entry — it is reported as unknown rather than dropped, so a new shape cannot pass
 *     by not being seen (.handoff/check-action-freshness/02-walker.md F1);
 *   • a baseline entry whose action now refreshes, or no longer exists — the baseline only shrinks, so a
 *     healed or deleted action must leave it;
 *   • an entry with no reason, or a class outside CLASSES.
 *
 * An auth-guard `redirect("/login")` does not count as fresh: it is how an action refuses, not how it
 * finishes (walker F2). What this cannot see, stated rather than implied: WHICH branch the fresh call is on
 * (a revalidate only on the error path counts), whether it is reachable, a parameter shadowing the import,
 * and a callee in another module (that is the `indirect` class, classified by hand).
 *
 * An entry means READ AND CLASSIFIED, never exempt. It is keyed by `file::action`, so a new action in a
 * file whose other actions are baselined is not covered by them. The classes are what a caller-trace found:
 * read · indirect (a callee elsewhere refreshes) · client-refresh (every caller refreshes the view itself,
 * or rebuilds it from the action's return) · no-view (writes nothing a rendered view reads back) ·
 * internal (no client calls it; a route or another action does, and owns freshness) · uncalled.
 * A write that leaves a view stale is fixed, not baselined. First count 2026-10-10 at 7cf6feb3: 143 of 247
 * actions — a hypothesis, classified per site in .handoff/check-action-freshness/01-census.md.
 */
import { readdirSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const ts = createRequire(import.meta.url)("typescript")

const ROOTS = ["app", "lib", "components"]
const BASELINE = "scripts/action-freshness.baseline.json"
const CLASSES = new Set(["read", "indirect", "client-refresh", "no-view", "internal", "uncalled"])
/** The calls that leave a view fresh, and the modules they must be imported from to count. */
const FRESH = new Set(["revalidatePath", "revalidateTag", "updateTag", "refresh", "redirect", "permanentRedirect"])
const FRESH_FROM = new Set(["next/cache", "next/navigation"])
const REDIRECTS = new Set(["redirect", "permanentRedirect"])
/** A redirect to one of these is an auth refusal, not a finish. */
const AUTH_PATH = /^\/(login|auth|sign-?in|switch-role)(\/|\?|$)/

/** A module is a server-action module only when "use server" is its FIRST statement (Next's rule). */
function isServerActionModule(sf) {
  const first = sf.statements[0]
  return !!first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) && first.expression.text === "use server"
}

const fnBody = (init) => (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) ? init.body : null)
const hasModifier = (s, kind) => !!s.modifiers?.some((m) => m.kind === kind)

/** Import bindings from next/cache + next/navigation that are fresh calls: local name → imported name. */
function freshImports(sf) {
  const out = new Map()
  for (const s of sf.statements) {
    if (!ts.isImportDeclaration(s) || !ts.isStringLiteral(s.moduleSpecifier) || !FRESH_FROM.has(s.moduleSpecifier.text)) continue
    const named = s.importClause?.namedBindings
    if (!named || !ts.isNamedImports(named)) continue
    for (const el of named.elements) {
      const imported = (el.propertyName ?? el.name).text
      if (FRESH.has(imported)) out.set(el.name.text, imported)
    }
  }
  return out
}

/** Exported bindings → { as, local } when the scan can read a function body, { as, unknown } when it cannot. */
function exportsOf(sf, local) {
  const out = []
  const unknown = (as) => out.push({ as, unknown: true })
  for (const s of sf.statements) {
    const exported = hasModifier(s, ts.SyntaxKind.ExportKeyword)
    const isDefault = hasModifier(s, ts.SyntaxKind.DefaultKeyword)
    if (ts.isFunctionDeclaration(s) && exported) {
      if (!s.body) continue // an overload signature
      const name = s.name?.text ?? "#default"
      if (!s.name) local.set(name, s.body)
      out.push({ as: isDefault ? "default" : name, local: name })
    } else if (ts.isVariableStatement(s) && exported) {
      for (const d of s.declarationList.declarations) {
        const name = ts.isIdentifier(d.name) ? d.name.text : d.name.getText(sf)
        if (local.has(name) && fnBody(d.initializer)) out.push({ as: name, local: name })
        else unknown(name)
      }
    } else if (ts.isExportAssignment(s)) {
      const body = fnBody(s.expression)
      if (body) { local.set("#default", body); out.push({ as: "default", local: "#default" }) }
      else unknown("default")
    } else if (ts.isExportDeclaration(s) && !s.isTypeOnly) {
      if (!s.exportClause) { unknown("*"); continue } // export * from "…"
      if (!ts.isNamedExports(s.exportClause)) { unknown(s.exportClause.name.text); continue }
      for (const el of s.exportClause.elements) {
        if (el.isTypeOnly) continue
        const ref = (el.propertyName ?? el.name).text
        if (!s.moduleSpecifier && local.has(ref)) out.push({ as: el.name.text, local: ref })
        else unknown(el.name.text)
      }
    } else if (exported && (ts.isClassDeclaration(s) || ts.isEnumDeclaration(s))) {
      unknown(s.name?.text ?? "default")
    }
  }
  return out
}

/** Every exported action of one module → fresh: true | false | "unknown" (an export the scan cannot read). */
export function actionsOf(fileName, text) {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  if (!isServerActionModule(sf)) return []

  const fresh = freshImports(sf)
  const local = new Map()
  for (const s of sf.statements) {
    if (ts.isFunctionDeclaration(s) && s.name && s.body) local.set(s.name.text, s.body)
    if (ts.isVariableStatement(s)) {
      for (const d of s.declarationList.declarations) {
        const body = ts.isIdentifier(d.name) ? fnBody(d.initializer) : null
        if (body) local.set(d.name.text, body)
      }
    }
  }

  const isAuthRefusal = (call, imported) => {
    if (!REDIRECTS.has(imported)) return false
    const arg = call.arguments[0]
    return !!arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) && AUTH_PATH.test(arg.text)
  }
  /** Names this body calls, plus whether it makes a fresh call itself. */
  const scan = (node) => {
    const called = new Set()
    let direct = false
    const visit = (n) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
        const name = n.expression.text
        const imported = fresh.get(name)
        if (imported && !isAuthRefusal(n, imported)) direct = true
        called.add(name)
      }
      ts.forEachChild(n, visit)
    }
    visit(node)
    return { called, direct }
  }
  const refreshes = (name, seen = new Set()) => {
    if (seen.has(name) || !local.has(name)) return false
    seen.add(name)
    const { called, direct } = scan(local.get(name))
    if (direct) return true
    for (const c of called) if (refreshes(c, seen)) return true
    return false
  }

  return exportsOf(sf, local).map((e) => ({ name: e.as, fresh: e.unknown ? "unknown" : refreshes(e.local) }))
}

/** Compare the scan with the baseline → the four failure lists. */
export function judge(actions, entries) {
  const byKey = new Map(actions.map((a) => [a.key, a]))
  const missing = actions.filter((a) => a.fresh !== true && !entries[a.key])
  const healed = Object.keys(entries).filter((k) => byKey.get(k)?.fresh === true)
  const gone = Object.keys(entries).filter((k) => !byKey.has(k))
  const malformed = Object.entries(entries)
    .filter(([, v]) => !CLASSES.has(v?.class) || typeof v?.reason !== "string" || v.reason.trim().length < 10)
    .map(([k]) => k)
  return { missing, healed, gone, malformed }
}

function selftest() {
  const imp = 'import { revalidatePath } from "next/cache"\nimport { redirect } from "next/navigation"\n'
  const mod = (body) => `"use server"\n${imp}${body}`
  const one = (src) => actionsOf("x.ts", src).map((a) => `${a.name}:${a.fresh}`).join(",")
  const cases = [
    ["KNOWN-GOOD: a direct revalidatePath", mod('export async function a() { await w(); revalidatePath("/x") }'), "a:true"],
    ["KNOWN-GOOD: a redirect", mod('export const a = async () => { redirect("/x") }'), "a:true"],
    ["KNOWN-GOOD: through a same-file helper, two deep", mod('function h2() { revalidatePath("/x") }\nfunction h() { h2() }\nexport async function a() { h() }'), "a:true"],
    ["KNOWN-GOOD: an aliased import counts", '"use server"\nimport { revalidatePath as rp } from "next/cache"\nexport async function a() { rp("/x") }', "a:true"],
    ["KNOWN-GOOD: `export { a }` of a local function is seen", mod('async function a() { revalidatePath("/x") }\nexport { a }'), "a:true"],
    ["KNOWN-GOOD: an auth guard plus a real revalidate is fresh", mod('export async function a() { if (!gw) redirect("/login"); await w(); revalidatePath("/x") }'), "a:true"],
    ["KNOWN-GOOD: a type-only re-export is not an action", mod('export type { T } from "./t"\nexport async function a() { revalidatePath("/x") }'), "a:true"],
    ["an action that writes and returns FIRES", mod("export async function a() { await db.update() }"), "a:false"],
    ["an auth-guard redirect alone FIRES", mod('export async function a() { if (!gw) redirect("/login"); await w() }'), "a:false"],
    ["a local function NAMED refresh is not next/cache's", '"use server"\nfunction refresh() {}\nexport async function a() { refresh() }', "a:false"],
    ["a method called redirect is not next/navigation's", mod("export async function a() { NextResponse.redirect(u) }"), "a:false"],
    ["mutual recursion terminates and FIRES", mod("function p() { q() }\nfunction q() { p() }\nexport async function a() { p() }"), "a:false"],
    ["a wrapped action is UNKNOWN, not dropped", mod("export const a = withGate(async () => { await w() })"), "a:unknown"],
    ["export default <expression> is UNKNOWN", mod("export default withGate(async () => {})"), "default:unknown"],
    ["KNOWN-GOOD: export default async function is scanned", mod('export default async function () { revalidatePath("/x") }'), "default:true"],
    ["a re-export from another module is UNKNOWN", mod('export { b } from "./impl"'), "b:unknown"],
    ["`export { b }` of a wrapped local is UNKNOWN", mod("const b = withGate(async () => {})\nexport { b }"), "b:unknown"],
    ["mention-fixture: a module with the directive below line one is not a server module", 'import x from "y"\n"use server"\nexport async function a() {}', ""],
  ]
  const judgeCases = [
    ["KNOWN-GOOD: a classified miss passes", [{ key: "m.ts::act", fresh: false }], { "m.ts::act": { class: "read", reason: "pure lookup of x" } }, [0, 0, 0, 0]],
    ["an unclassified miss FIRES", [{ key: "m.ts::act", fresh: false }], {}, [1, 0, 0, 0]],
    ["an unclassified UNKNOWN export FIRES", [{ key: "m.ts::act", fresh: "unknown" }], {}, [1, 0, 0, 0]],
    ["a baselined action that now refreshes FIRES (baseline only shrinks)", [{ key: "m.ts::act", fresh: true }], { "m.ts::act": { class: "read", reason: "pure lookup of x" } }, [0, 1, 0, 0]],
    ["an entry for a deleted action FIRES", [], { "m.ts::act": { class: "read", reason: "pure lookup of x" } }, [0, 0, 1, 0]],
    ["an entry with an unknown class FIRES", [{ key: "m.ts::act", fresh: false }], { "m.ts::act": { class: "stale", reason: "page shows old value" } }, [0, 0, 0, 1]],
    ["an entry with no reason FIRES", [{ key: "m.ts::act", fresh: false }], { "m.ts::act": { class: "read", reason: "" } }, [0, 0, 0, 1]],
  ]
  let bad = 0
  for (const [label, src, want] of cases) {
    const got = one(src)
    if (got !== want) { bad++; console.log(`  ✗ ${label} — expected "${want}", got "${got}"`) }
    else console.log(`  ✓ ${label}`)
  }
  for (const [label, actions, entries, want] of judgeCases) {
    const r = judge(actions, entries)
    const got = [r.missing.length, r.healed.length, r.gone.length, r.malformed.length]
    if (got.join() !== want.join()) { bad++; console.log(`  ✗ ${label} — expected ${want}, got ${got}`) }
    else console.log(`  ✓ ${label}`)
  }
  console.log(bad ? `\n✗ ${bad} selftest case(s) failed` : "\n✅ check-action-freshness selftest green")
  process.exit(bad ? 1 : 0)
}

function main() {
  const files = []
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name).replaceAll("\\", "/")
      if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== "__tests__") walk(p) }
      else if (/\.tsx?$/.test(e.name) && !/\.(test|spec|dbtest)\./.test(e.name)) files.push(p)
    }
  }
  ROOTS.forEach(walk)

  const actions = files.flatMap((f) => actionsOf(f, readFileSync(f, "utf8")).map((a) => ({ ...a, key: `${f}::${a.name}` })))

  // The enumeration asserts itself (L-10): a scan that finds nothing reports a clean tree. Measured 247 / 97
  // on 2026-10-10; the floors sit just under so a lost module or a handful of lost actions is seen (walker F7).
  const FLOOR = { actions: 240, modules: 95 }
  const modules = new Set(actions.map((a) => a.key.split("::")[0])).size
  if (actions.length < FLOOR.actions || modules < FLOOR.modules) {
    console.error(`\n❌ action freshness — found ${actions.length} actions in ${modules} modules (floors ${FLOOR.actions} / ${FLOOR.modules}).`)
    console.error(`   The scan is broken, or actions were removed — lower the floor in the same change if so.\n`)
    process.exit(1)
  }

  const { entries = {} } = JSON.parse(readFileSync(BASELINE, "utf8"))
  const { missing, healed, gone, malformed } = judge(actions, entries)

  console.log("🔎  server actions leave their page fresh")
  if (!missing.length && !healed.length && !gone.length && !malformed.length) {
    const fresh = actions.filter((a) => a.fresh === true).length
    console.log(`  ✓ ${actions.length} actions: ${fresh} refresh or redirect, ${actions.length - fresh} classified in ${BASELINE}`)
    process.exit(0)
  }
  for (const a of missing) {
    console.error(a.fresh === "unknown"
      ? `  ✗ ${a.key} — an export this scan cannot read as a function; write it as one, or classify it`
      : `  ✗ ${a.key} — calls no revalidatePath/revalidateTag/updateTag/refresh/redirect`)
  }
  for (const k of healed) console.error(`  ✗ ${k} — now refreshes; remove its baseline entry`)
  for (const k of gone) console.error(`  ✗ ${k} — no such action; remove its baseline entry`)
  for (const k of malformed) console.error(`  ✗ ${k} — baseline entry needs a class (${[...CLASSES].join(" · ")}) and a reason`)
  if (missing.length) {
    console.error(`\n   Revalidate the paths whose data the action changed, or redirect. If the action truly needs`)
    console.error(`   neither, classify it in ${BASELINE} with the caller-trace that proves it.\n`)
  }
  process.exit(1)
}

// Importable: actionsOf/judge are exported, and only a direct run scans the tree (walker F7).
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.includes("--selftest")) selftest()
  else main()
}
