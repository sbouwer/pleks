#!/usr/bin/env node
/**
 * scripts/check-hook-registration.mjs — a hook file is not a hook until settings wires it.
 *
 * WALKER FINDING, PR #257: nothing in this repo read `.claude/settings.json`. Deleting its `hooks`
 * block left both gates inert while `npm run check` stayed green, `check-mcp-ddl-gate.mjs` printed
 * "✅ probes green — asks on mutations…", and `check-claude-md.mjs` happily resolved
 * `@enforced hook:bash-gate` and `@enforced hook:mcp-ddl-gate` — because that resolver is
 * `existsSync(.claude/hooks/<id>.js)`, i.e. file presence. Two "enforced" tags, a probe suite
 * claiming to drive the hook "exactly as Claude Code would", and zero enforcement.
 *
 * The probe spawns the hook file directly. That is the right way to test its LOGIC and no way at
 * all to test whether anything invokes it — the L-06 shape (a fixture that does not travel the
 * real discovery path), one layer out from where L-06 was first written.
 *
 * ── ADOPTED FROM life-therapy, NOT REINVENTED ─────────────────────────────────────────────────
 * LT's `architecture-audit.mjs` already solved the harder half: each hook declares
 * `// @twin <settings pattern>` beside the rule it implements, or `// @no-twin <reason>` where the
 * settings layer cannot express the question (ddl-gate's is about statement CONTENT, and settings
 * patterns match tool and path). The audit then takes the set difference against
 * `permissions.deny ∪ permissions.ask`. Deliberately NOT equal-or-stronger: settings speaks in
 * prefix-globs and the hook in separator-aware regex, so **ask is the floor; absent is the
 * violation**.
 *
 * Two traps LT hit and recorded, avoided here: the markers live in COMMENTS, so a
 * comment-stripping read erases them (the trap that kept their `+02:00` check green for months);
 * and matching `@twin` anywhere swallows prose ABOUT the markers, so the match is anchored to a
 * dedicated comment line.
 *
 * What LT does NOT have — verified 2026-08-19, no reference to `settings.hooks`, `PreToolUse` or
 * `matcher` anywhere in their audit — is the REGISTRATION half below. That gap is open in both
 * projects; this is the half worth sending back.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

const HOOK_DIR = ".claude/hooks"
const SETTINGS = ".claude/settings.json"

/** A dedicated `// @twin <pattern>` comment line. Anchored: prose about twins is not a twin. */
const TWIN = /^\s*\/\/\s*@twin\s+(\S.*?)\s*$/gm
const NO_TWIN = /^\s*\/\/\s*@no-twin\s+(\S.*?)\s*$/m

/** Every command string in every PreToolUse (and PostToolUse) entry. */
export function registeredCommands(settings) {
  const out = []
  for (const event of Object.values(settings.hooks ?? {})) {
    for (const entry of event ?? []) {
      for (const h of entry.hooks ?? []) if (typeof h.command === "string") out.push(h.command)
    }
  }
  return out
}

export function audit(root = ".") {
  const out = []
  const hookDir = join(root, HOOK_DIR)
  const settingsPath = join(root, SETTINGS)

  if (!existsSync(settingsPath)) return [`${SETTINGS} is missing — no hook can be registered, so every hook: tag is a claim with no mechanism`]
  if (!existsSync(hookDir)) return [`${HOOK_DIR} is missing — nothing to reconcile`]

  const settings = JSON.parse(readFileSync(settingsPath, "utf8"))
  const commands = registeredCommands(settings)
  const gated = new Set([...(settings.permissions?.deny ?? []), ...(settings.permissions?.ask ?? [])])

  const hooks = readdirSync(hookDir).filter((f) => f.endsWith(".js"))
  // The enumeration asserts itself: zero hooks with tags claiming otherwise is not a pass (L-10).
  if (hooks.length === 0) out.push(`${HOOK_DIR} contains no .js hooks — the enumeration is empty, which is not a pass`)

  for (const f of hooks) {
    const src = readFileSync(join(hookDir, f), "utf8")

    // 1 — REGISTRATION. The half neither project had.
    if (!commands.some((c) => c.includes(f))) {
      out.push(`${HOOK_DIR}/${f}: not referenced by any hooks entry in ${SETTINGS} — the file exists and nothing invokes it`)
    }

    // 2 — TWIN DECLARATION (LT's pattern).
    const twins = [...src.matchAll(TWIN)].map((m) => m[1])
    const noTwin = NO_TWIN.exec(src)
    if (twins.length === 0 && !noTwin) {
      out.push(`${HOOK_DIR}/${f}: declares neither a settings twin nor @no-twin with a reason — add "// @twin <settings pattern>" per rule, or "// @no-twin <why settings cannot express it>"`)
    }

    // 3 — TWIN RECONCILIATION. Ask is the floor; absent is the violation.
    for (const t of twins) {
      if (!gated.has(t)) {
        out.push(`${HOOK_DIR}/${f}: declares @twin ${t}, which is in neither permissions.deny nor permissions.ask — the dormant layer has nothing to fall back to`)
      }
    }
  }
  return out
}

if (process.argv.includes("--selftest")) {
  let failed = 0
  const ok = (c, l) => { if (!c) failed++; console.log(`  ${c ? "✓" : "✗"} ${l}`) }

  const S = (o) => o
  ok(registeredCommands(S({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ command: 'node "x/bash-gate.js"' }] }] } })).length === 1,
    "registeredCommands finds a PreToolUse command")
  ok(registeredCommands(S({})).length === 0, "…and returns nothing when there are no hooks at all")
  ok(registeredCommands(S({ hooks: { PreToolUse: [] } })).length === 0, "…or when the event list is empty")

  // The exact deletion the walker described: the hooks block goes, the files stay.
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs")
  const { tmpdir } = await import("node:os")
  const tmp = mkdtempSync(join(tmpdir(), "hookreg-"))
  mkdirSync(join(tmp, ".claude", "hooks"), { recursive: true })
  const write = (settings, hookSrc = "// @twin Bash(git push*)\n") => {
    writeFileSync(join(tmp, ".claude", "hooks", "g.js"), hookSrc)
    writeFileSync(join(tmp, ".claude", "settings.json"), JSON.stringify(settings))
  }

  write({ permissions: { ask: ["Bash(git push*)"] }, hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ command: 'node "$DIR/.claude/hooks/g.js"' }] }] } })
  ok(audit(tmp).length === 0, "KNOWN-GOOD: registered hook with a declared twin present in settings")

  write({ permissions: { ask: ["Bash(git push*)"] } })
  ok(audit(tmp).some((x) => x.includes("nothing invokes it")), "deleting the hooks block FIRES — the walker's exact scenario")

  write({ permissions: {}, hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ command: "g.js" }] }] } })
  ok(audit(tmp).some((x) => x.includes("neither permissions.deny nor permissions.ask")), "a declared twin missing from settings fires")

  write({ permissions: { ask: ["Bash(git push*)"] }, hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ command: "g.js" }] }] } }, "// no markers here\n")
  ok(audit(tmp).some((x) => x.includes("neither a settings twin nor @no-twin")), "a hook declaring no twin and no @no-twin fires")

  write({ permissions: {}, hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ command: "g.js" }] }] } }, "// @no-twin settings match tool+path; this gate asks about content\n")
  ok(audit(tmp).length === 0, "KNOWN-GOOD: @no-twin with a reason satisfies the declaration")

  // Prose ABOUT the markers must not be read as a marker — LT recorded this exact false positive.
  write({ permissions: {}, hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ command: "g.js" }] }] } },
    "/**\n * That does not break the @twin design below; it explains it.\n */\n// @no-twin content-shaped question\n")
  ok(audit(tmp).length === 0, "prose mentioning @twin is not parsed as a twin declaration")

  rmSync(tmp, { recursive: true, force: true })
  console.log(failed ? `\n❌ ${failed} probe(s) wrong` : "\n✅ probes green — registration, declaration and reconciliation all fire")
  process.exit(failed ? 1 : 0)
}

const findings = audit(".")
if (findings.length) {
  console.log(`\n❌ ${findings.length} hook-registration finding(s):\n`)
  for (const f of findings) console.log(`  ${f}`)
  process.exit(1)
}
console.log("🪝 hooks — every hook is registered in settings, declares its twin, and its twins are present")
