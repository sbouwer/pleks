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
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const HOOK_DIR = ".claude/hooks"
const SETTINGS = ".claude/settings.json"

/** A dedicated `// @twin <pattern>` comment line. Anchored: prose about twins is not a twin. */
const TWIN = /^\s*\/\/\s*@twin\s+(\S.*?)\s*$/gm
const NO_TWIN = /^\s*\/\/\s*@no-twin\s+(\S.*?)\s*$/m

/**
 * Claude Code's hook events. Anything else is a typo or an invention, and either way the block is
 * inert — settings does not validate event names, so `PreToolUsee` is silently ignored.
 */
const KNOWN_EVENTS = new Set([
  "PreToolUse", "PostToolUse", "UserPromptSubmit", "Notification",
  "Stop", "SubagentStop", "PreCompact", "SessionStart", "SessionEnd",
])
/** Only PreToolUse can refuse a call. A gate registered anywhere else cannot block. */
const BLOCKING_EVENTS = new Set(["PreToolUse"])
/** The events whose entries are scoped by a `matcher`. The rest have no tool to match. */
const MATCHED_EVENTS = new Set(["PreToolUse", "PostToolUse"])

/**
 * Registrations that actually invoke a hook FILE, with the event and matcher they carry.
 *
 * The first version returned bare command strings and matched them with `c.includes(filename)`.
 * Adversarial review found that green on SEVEN distinct ways a hook can be unwired: a misspelled
 * event, an invented event, registration under PostToolUse (runs after the call — cannot block),
 * a matcher that never sees the tool, the filename appearing inside an `echo` string, a command
 * pointing at a COPY of the file outside `.claude/hooks`, and an entry missing `type: "command"`.
 * A substring test on a filename is not a registration check.
 */
export function registrations(settings) {
  const out = []
  for (const [event, entries] of Object.entries(settings.hooks ?? {})) {
    for (const entry of entries ?? []) {
      for (const h of entry.hooks ?? []) {
        if (h.type !== "command" || typeof h.command !== "string") continue
        // The command must EXECUTE a file under .claude/hooks — not merely mention one.
        const m = h.command.match(/(?:^|\s)(?:node|npx|sh|bash)\s+["']?([^"'\s]*[/\\]\.claude[/\\]hooks[/\\][\w.-]+\.js)["']?/)
        if (!m) continue
        out.push({ event, matcher: entry.matcher, file: m[1].replace(/.*[/\\]hooks[/\\]/, ""), command: h.command })
      }
    }
  }
  return out
}

/** Kept for the probes: the raw command strings, unfiltered. */
export function registeredCommands(settings) {
  return registrations(settings).map((r) => r.command)
}

/**
 * The other two directions, from CD's independent close of the same gap. Three distinct failures,
 * not one — each looks complete from a different angle:
 *
 *   hook file not registered   → the control never runs, and every artefact says it exists
 *   registration → missing file → L-16's shape: a non-blocking error nobody reads
 *   registration with no matcher → a scope nobody chose
 *
 * The middle one is why a renamed hook file is dangerous: a gate was disabled during a canary
 * experiment by renaming its file, and nothing would have caught a failure to restore it.
 */
export function registrationFindings(settings, root, existsFn) {
  const out = []
  for (const [event, entries] of Object.entries(settings.hooks ?? {})) {
    for (const entry of entries ?? []) {
      // Only the tool-scoped events take a matcher. Demanding one on SessionStart/Stop would be a
      // false positive on a correct config, and a check that cries wolf on the good case is how a
      // real finding gets waved through.
      if (MATCHED_EVENTS.has(event) && (!entry.matcher || String(entry.matcher).trim() === "")) {
        out.push(`${SETTINGS}: a ${event} entry has no matcher — it declares a scope nobody chose`)
      }
      for (const h of entry.hooks ?? []) {
        const cmd = typeof h.command === "string" ? h.command : ""
        // Pull the .js path out of the command, however it is quoted or variable-prefixed.
        const m = cmd.match(/([\w./\\$-]*\.claude[/\\]hooks[/\\][\w.-]+\.js)/)
        if (!m) continue
        const file = m[1].replace(/.*[/\\]hooks[/\\]/, "")
        if (!existsFn(join(root, HOOK_DIR, file))) {
          out.push(`${SETTINGS}: ${event} registers ${file}, which does not exist in ${HOOK_DIR} — the registration resolves to nothing`)
        }
      }
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
  const regs = registrations(settings)
  const gated = new Set([...(settings.permissions?.deny ?? []), ...(settings.permissions?.ask ?? [])])

  // Unknown event names are inert, and settings will not tell you.
  for (const event of Object.keys(settings.hooks ?? {})) {
    if (!KNOWN_EVENTS.has(event)) {
      out.push(`${SETTINGS}: hooks.${event} is not a Claude Code event — the whole block is inert and nothing reports it`)
    }
  }

  out.push(...registrationFindings(settings, root, existsSync))

  const hooks = readdirSync(hookDir).filter((f) => f.endsWith(".js"))
  // The enumeration asserts itself: zero hooks with tags claiming otherwise is not a pass (L-10).
  if (hooks.length === 0) out.push(`${HOOK_DIR} contains no .js hooks — the enumeration is empty, which is not a pass`)

  for (const f of hooks) {
    const src = readFileSync(join(hookDir, f), "utf8")

    // 1 — REGISTRATION, and what it is registered AS. A gate that runs after the call, or under a
    //     matcher that never sees its tool, is registered and still cannot stop anything.
    const mine = regs.filter((r) => r.file === f)
    if (mine.length === 0) {
      out.push(`${HOOK_DIR}/${f}: no ${SETTINGS} entry EXECUTES it — the file exists and nothing invokes it`)
    } else {
      // Each hook declares the event and matcher it needs, beside the rules it implements.
      const wantEvent = (/^\s*\/\/\s*@event\s+(\S+)/m.exec(src) ?? [])[1]
      const wantMatcher = (/^\s*\/\/\s*@matcher\s+(\S.*?)\s*$/m.exec(src) ?? [])[1]
      if (!wantEvent || !wantMatcher) {
        out.push(`${HOOK_DIR}/${f}: declares no "// @event <Event>" and "// @matcher <pattern>" — without them nothing can check it is registered for the calls it gates`)
      } else {
        if (!mine.some((r) => r.event === wantEvent)) {
          out.push(`${HOOK_DIR}/${f}: declares @event ${wantEvent} but is registered under ${[...new Set(mine.map((r) => r.event))].join(", ")}`)
        }
        if (!mine.some((r) => r.matcher === wantMatcher)) {
          out.push(`${HOOK_DIR}/${f}: declares @matcher ${wantMatcher} but is registered with ${mine.map((r) => JSON.stringify(r.matcher)).join(", ")} — a matcher that never sees its tool is a gate that cannot fire`)
        }
        // A hook on a non-blocking event cannot refuse anything. That is a defect for a GATE and
        // correct for an ANNOTATOR — `context-budget.js` sits on UserPromptSubmit and only ever
        // adds a line of context, which no blocking event could do. So the file declares which it
        // is, the same way it declares its twin: `// @non-blocking <why>`. Without the marker this
        // still fires, so the PostToolUse-instead-of-PreToolUse case stays caught; with it, the
        // reason is in the file rather than in someone's memory.
        const nonBlocking = /^\s*\/\/\s*@non-blocking\s+(\S.*?)\s*$/m.exec(src)
        for (const r of mine) {
          if (!BLOCKING_EVENTS.has(r.event) && !nonBlocking) {
            out.push(`${HOOK_DIR}/${f}: registered under ${r.event}, which cannot refuse a call — only PreToolUse blocks. If that is deliberate, declare "// @non-blocking <why>".`)
          }
        }
      }
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

/** True only when THIS file is the process entrypoint — not when another script imports it. */
const isEntry = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))

// ⚠ `process.argv.includes("--selftest")` alone was wrong, and wrong in the silent direction:
// `check-claude-md.mjs --selftest` imports `registrations` from here, so THIS selftest ran on
// import, printed its own green banner and `process.exit(0)`d — check-claude-md's 40-odd fixtures
// never ran, and the output looked like a pass. A probe suite that pre-empts another probe suite
// is worse than no probe suite.
if (isEntry && process.argv.includes("--selftest")) {
  let failed = 0
  const ok = (c, l) => { if (!c) failed++; console.log(`  ${c ? "✓" : "✗"} ${l}`) }

  const S = (o) => o
  ok(registeredCommands(S({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: 'node "$D/.claude/hooks/g.js"' }] }] } })).length === 1,
    "registeredCommands finds a PreToolUse command that EXECUTES a hook file")
  ok(registeredCommands(S({})).length === 0, "…and returns nothing when there are no hooks at all")
  ok(registeredCommands(S({ hooks: { PreToolUse: [] } })).length === 0, "…or when the event list is empty")

  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs")
  const { tmpdir } = await import("node:os")
  const tmp = mkdtempSync(join(tmpdir(), "hookreg-"))
  mkdirSync(join(tmp, ".claude", "hooks"), { recursive: true })

  // The fixture hook is a CORRECT hook: it declares the event and matcher it needs and names its
  // settings twin. Every case below unwires exactly one thing, so a finding is attributable.
  const GOOD_HOOK = "// @event PreToolUse\n// @matcher Bash\n// @twin Bash(git push*)\n"
  const ASK = { ask: ["Bash(git push*)"] }
  const RUNS = 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/g.js"'
  const entry = (matcher, command = RUNS, type = "command") => ({ matcher, hooks: [{ type, command }] })
  const write = (settings, hookSrc = GOOD_HOOK) => {
    writeFileSync(join(tmp, ".claude", "hooks", "g.js"), hookSrc)
    writeFileSync(join(tmp, ".claude", "settings.json"), JSON.stringify(settings))
  }
  const fires = (settings, needle, label, hookSrc) => {
    write(settings, hookSrc)
    const f = audit(tmp)
    ok(f.some((x) => x.includes(needle)), `${label}${f.some((x) => x.includes(needle)) ? "" : `\n      got: ${JSON.stringify(f)}`}`)
  }
  const clean = (settings, label, hookSrc) => {
    write(settings, hookSrc)
    const f = audit(tmp)
    ok(f.length === 0, `${label}${f.length ? `\n      got: ${JSON.stringify(f)}` : ""}`)
  }

  clean({ permissions: ASK, hooks: { PreToolUse: [entry("Bash")] } },
    "KNOWN-GOOD: registered under the declared event and matcher, twin present in settings")

  // ── The seven ways a hook can be unwired while every artefact still says it exists ────────────
  // The first version of this check — `commands.some(c => c.includes(filename))` over
  // `Object.values(settings.hooks)` — was GREEN on all seven.
  fires({ permissions: ASK }, "nothing invokes it",
    "1/7 the hooks block is deleted outright — the walker's exact scenario")

  fires({ permissions: ASK, hooks: { PreToolUsee: [entry("Bash")] } }, "is not a Claude Code event",
    "2/7 a MISSPELLED event name — settings does not validate these, so the block is silently inert")

  fires({ permissions: ASK, hooks: { OnBashCommand: [entry("Bash")] } }, "is not a Claude Code event",
    "3/7 an INVENTED event name — same silence, different origin")

  fires({ permissions: ASK, hooks: { PostToolUse: [entry("Bash")] } }, "cannot refuse a call",
    "4/7 registered under PostToolUse — it runs AFTER the call it was written to block")

  // …and the legitimate case it must not swallow. An ANNOTATOR belongs on a non-blocking event —
  // no blocking event can add context to a prompt — so the file says so and the reason is in the
  // file rather than in someone's memory. Without the marker the case above still fires.
  clean({ permissions: ASK, hooks: { UserPromptSubmit: [entry("Bash")] } },
    "KNOWN-GOOD: a declared @non-blocking annotator on a non-blocking event",
    "// @event UserPromptSubmit\n// @matcher Bash\n// @non-blocking it annotates, it does not gate\n// @twin Bash(git push*)\n")
  fires({ permissions: ASK, hooks: { UserPromptSubmit: [entry("Bash")] } }, "cannot refuse a call",
    "…and the SAME registration with no @non-blocking still fires",
    "// @event UserPromptSubmit\n// @matcher Bash\n// @twin Bash(git push*)\n")

  fires({ permissions: ASK, hooks: { PreToolUse: [entry("Read")] } }, "a matcher that never sees its tool",
    "5/7 a matcher scoped to the wrong tool — registered, and it never fires")

  fires({ permissions: ASK, hooks: { PreToolUse: [entry("Bash", 'echo "see .claude/hooks/g.js"')] } },
    "nothing invokes it",
    "6/7 the filename appears inside an echo STRING — mentioned, not executed")

  fires({ permissions: ASK, hooks: { PreToolUse: [entry("Bash", 'node "$D/scripts/copies/g.js"')] } },
    "nothing invokes it",
    "7/7 the command runs a COPY outside .claude/hooks — the tracked file is inert")

  fires({ permissions: ASK, hooks: { PreToolUse: [entry("Bash", RUNS, "prompt")] } }, "nothing invokes it",
    "…and an entry whose type is not \"command\" never runs anything")

  // ── The declarations themselves ───────────────────────────────────────────────────────────────
  fires({ permissions: ASK, hooks: { PreToolUse: [entry("Bash")] } }, "declares no",
    "a hook with no @event/@matcher cannot be checked against its registration — that is a finding",
    "// @twin Bash(git push*)\n")

  fires({ permissions: {}, hooks: { PreToolUse: [entry("Bash")] } }, "neither permissions.deny nor permissions.ask",
    "a declared twin missing from settings fires")

  fires({ permissions: ASK, hooks: { PreToolUse: [entry("Bash")] } }, "neither a settings twin nor @no-twin",
    "a hook declaring no twin and no @no-twin fires",
    "// @event PreToolUse\n// @matcher Bash\n")

  clean({ permissions: {}, hooks: { PreToolUse: [entry("Bash")] } },
    "KNOWN-GOOD: @no-twin with a reason satisfies the declaration",
    "// @event PreToolUse\n// @matcher Bash\n// @no-twin settings match tool+path; this gate asks about content\n")

  // Prose ABOUT the markers must not be read as a marker — LT recorded this exact false positive.
  clean({ permissions: {}, hooks: { PreToolUse: [entry("Bash")] } },
    "prose mentioning @twin is not parsed as a twin declaration",
    "/**\n * That does not break the @twin design below; it explains it.\n */\n// @event PreToolUse\n// @matcher Bash\n// @no-twin content-shaped question\n")

  // CD's other two directions.
  const yes = () => true, no = () => false
  ok(registrationFindings({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ command: 'node ".claude/hooks/g.js"' }] }] } }, ".", yes).length === 0,
    "KNOWN-GOOD: a matcher and a file that exists")
  ok(registrationFindings({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ command: 'node ".claude/hooks/gone.js"' }] }] } }, ".", no)
    .some((x) => x.includes("does not exist")),
    "a registration pointing at a MISSING file fires — the renamed-hook case")
  ok(registrationFindings({ hooks: { PreToolUse: [{ hooks: [{ command: 'node ".claude/hooks/g.js"' }] }] } }, ".", yes)
    .some((x) => x.includes("no matcher")),
    "a registration with NO MATCHER fires — a scope nobody chose")
  ok(registrationFindings({ hooks: { PreToolUse: [{ matcher: "", hooks: [] }] } }, ".", yes)
    .some((x) => x.includes("no matcher")),
    "…and an empty-string matcher counts as none")
  // …but only where a matcher is the scoping mechanism. SessionStart has no tool to match, and a
  // check that fires on a correct config is how a real finding gets waved through.
  ok(registrationFindings({ hooks: { SessionStart: [{ hooks: [{ command: 'node ".claude/hooks/g.js"' }] }] } }, ".", yes).length === 0,
    "KNOWN-GOOD: a matcher-less SessionStart entry is not a finding — that event takes no matcher")

  rmSync(tmp, { recursive: true, force: true })
  console.log(failed ? `\n❌ ${failed} probe(s) wrong` : "\n✅ probes green — registration, declaration and reconciliation all fire")
  process.exit(failed ? 1 : 0)
}

// Only when RUN. This module exports `registrations`/`registrationFindings` for other probes, and
// a top-level audit meant importing it audited the repo and could `process.exit` the importer.
if (isEntry) {
const findings = audit(".")
if (findings.length) {
  console.log(`\n❌ ${findings.length} hook-registration finding(s):\n`)
  for (const f of findings) console.log(`  ${f}`)
  process.exit(1)
}
console.log("🪝 hooks — every hook is registered in settings, declares its twin, and its twins are present")
}
