#!/usr/bin/env node
/**
 * crawl.mjs — invoke a read-only crawler, parse its JSON, print the report.
 *
 * PORTED FROM life-therapy 2026-08-19, near-verbatim. Everything below the usage block is
 * theirs and none of it is guesswork — the Windows shim resolution, the trust preflight,
 * the inherited stderr and the timeout each exist because someone hit the failure it
 * describes. Reproducing that by writing a fresh wrapper would mean rediscovering all four.
 *
 * SPEC_CODEBASE_CRAWLERS §5, at the size the spec's D5 asks for TODAY. v1 of that spec
 * mandated stable IDs, fingerprint dedup and a six-state ledger before the first crawler
 * ran. That was right facing a 300-finding first run, and it is over-engineering for a
 * first run whose volume nobody has measured yet.
 *
 * ⚠ ONE CLAIM FROM LT'S HEADER DELETED RATHER THAN COPIED: theirs says "the audit reports
 * zero across its checks and knip is at zero". True there, FALSE here — knip's first run
 * on this repo reported ~380 findings across seven categories (see knip.jsonc). Copying
 * that sentence would have shipped a doctrine claim the tree contradicts, into the wrapper
 * for the crawler whose first job is finding doctrine claims the tree contradicts.
 *
 * The ledger gets built when either trigger fires — a run produces more than one sitting
 * can clear, or a second run re-emits findings from the first. Until then the run IS the
 * report, and this wrapper stays small enough to read. The knip backlog is NOT that
 * trigger: it belongs to tier 0, which is deterministic and outside crawl scope by D1.
 *
 * WHAT IS HONOURED FROM DAY ONE, because retrofitting them is what goes wrong:
 *   · D3 — the agent never writes anything. It emits JSON on stdout; this parses it. The
 *     agent's tool list has no Write and no Edit, so read-only is enforced by the grant
 *     rather than by the prompt asking nicely.
 *   · D4 — the finding cap is asserted here, not just requested in the prompt. A crawler
 *     that ignores its cap is handing triage back to the reader, which is the resource
 *     this whole spec exists to protect.
 *   · The parser is guarded. The CLI's JSON envelope carries `result`, `is_error` and
 *     cost fields; read what is needed, default what is missing, assume nothing exists.
 *
 * Usage:
 *   node scripts/crawl.mjs crawler-doctrine
 *   node scripts/crawl.mjs crawler-doctrine --scope lib/email        (first runs: scope small)
 *   node scripts/crawl.mjs crawler-doctrine --dry-run                (print the command only)
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAX_FINDINGS = 12; // must match the cap in the agent's spine

/** A headless crawl that has not finished in this long is stuck, not thorough. */
const TIMEOUT_MS = Number(process.env.CRAWL_TIMEOUT_MS ?? 10 * 60 * 1000);

const args = process.argv.slice(2);
const agent = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
const scopeIdx = args.indexOf("--scope");
const scope = scopeIdx >= 0 ? args[scopeIdx + 1] : null;

if (!agent) {
  console.error("usage: node scripts/crawl.mjs <agent-name> [--scope <path>] [--dry-run]");
  process.exit(2);
}

const agentFile = join(ROOT, ".claude/agents", `${agent}.md`);
if (!existsSync(agentFile)) {
  console.error(`❌ no such crawler: .claude/agents/${agent}.md`);
  process.exit(2);
}

// The allowlist is a build blocker (D6). Running without it produces a first report that
// flags deliberate design, and a crawler only gets one first impression.
const intentional = join(ROOT, ".claude/crawlers/INTENTIONAL.md");
if (!existsSync(intentional)) {
  console.error(`❌ .claude/crawlers/INTENTIONAL.md is missing — refusing to run.`);
  console.error(`   Without it the first run flags deliberate design as defects (D6).`);
  process.exit(2);
}

/**
 * Preflight: is this workspace trusted for headless runs?
 *
 * A headless run against an untrusted workspace IGNORES `.claude/settings.json`
 * permissions, so a tool call that should have been pre-allowed raises a prompt instead —
 * and there is nobody there to answer it. The run does not fail; it waits, forever, having
 * printed one line about ignored entries that scrolls past. The first person to try this
 * reported a stuck terminal, which is exactly what it looks like.
 *
 * Detected here rather than diagnosed afterwards, because "hung" is the least informative
 * symptom a tool can produce.
 */
function trustWarning() {
  try {
    const cfg = JSON.parse(readFileSync(join(homedir(), ".claude.json"), "utf8"));
    const entries = Object.entries(cfg.projects ?? {}).filter(
      ([p]) => p.replace(/\\/g, "/").toLowerCase() === ROOT.replace(/\\/g, "/").toLowerCase(),
    );
    if (!entries.length) return null; // never opened here; the CLI will ask on first run
    if (entries.some(([, v]) => v?.hasTrustDialogAccepted)) return null;
    return "untrusted";
  } catch {
    return null; // no config to read is not evidence of a problem
  }
}

if (!dryRun && trustWarning()) {
  console.error(`❌ this workspace is not trusted, so a headless run would hang.`);
  console.error(`\n   Without trust the CLI IGNORES .claude/settings.json permissions, so a tool`);
  console.error(`   call that should be pre-allowed raises a prompt with nobody to answer it.`);
  console.error(`   It does not error — it waits.`);
  console.error(`\n   Fix it once, either way:`);
  console.error(`     · run \`claude\` interactively in ${ROOT} and accept the trust dialog; or`);
  console.error(`     · set projects["${ROOT.replace(/\\/g, "/")}"].hasTrustDialogAccepted = true`);
  console.error(`       in ${join(homedir(), ".claude.json")}`);
  console.error(`\n   Then re-run. Use --dry-run to check the command without this preflight.\n`);
  process.exit(2);
}

const prompt = scope
  ? `Crawl ONLY the path "${scope}" and emit the JSON findings object.`
  : `Run a full crawl of the repository and emit the JSON findings object.`;

// Read-only allowlist. Never --dangerously-skip-permissions: a read-only grant means no
// permission prompt can fire, so an unattended run completes WITHOUT removing the guardrail.
const argv = [
  "-p", prompt,
  "--agent", agent,
  "--output-format", "json",
  "--allowedTools", "Read,Grep,Glob",
  "--max-turns", "40",
];

if (dryRun) {
  console.log(`claude ${argv.map((a) => (a.includes(" ") ? JSON.stringify(a) : a)).join(" ")}`);
  process.exit(0);
}

/**
 * Resolve the CLI.
 *
 * On Windows the installed entry point is usually a `.cmd` shim, and `execFileSync` does
 * NOT resolve those — it looks for a literal executable and fails with ENOENT, which
 * reads exactly like "not installed". Two different problems, one error message. So:
 * take an explicit override first, then try each candidate through a shell, and say
 * which situation it is when none works.
 */
const WIN = process.platform === "win32";

/**
 * Prefer the REAL executable over the shim, because the shim costs a shell and a shell
 * costs the timeout.
 *
 * `shell: true` is needed to resolve a `.cmd`, but then the timeout kills the SHELL while
 * the actual process survives holding the stdout pipe — so the wrapper waits for a stream
 * that never closes and hangs exactly as if there were no timeout at all. Measured: a
 * 2-second limit did not return. Resolving the binary directly removes the shell, and the
 * timeout then applies to the thing it is meant to stop.
 *
 * npm's global package dir sits beside the node binary on Windows and one level up on
 * unix, so it is derivable without spawning `npm root -g` to find out.
 */
function realBinaryCandidates() {
  const nodeDir = dirname(process.execPath);
  const pkg = join("@anthropic-ai", "claude-code", "bin", WIN ? "claude.exe" : "claude");
  return [
    join(nodeDir, "node_modules", pkg), // Windows: C:\...\nodejs\node_modules\...
    join(nodeDir, "..", "lib", "node_modules", pkg), // unix: <prefix>/lib/node_modules/...
  ];
}

const CANDIDATES = process.env.CLAUDE_CLI
  ? [{ bin: process.env.CLAUDE_CLI, shell: !existsSync(process.env.CLAUDE_CLI) }]
  : [
      ...realBinaryCandidates()
        .filter(existsSync)
        .map((bin) => ({ bin, shell: false })),
      // Shims last: they work, but they reintroduce the shell and with it the timeout hole.
      { bin: "claude", shell: true },
      ...(WIN ? [{ bin: "claude.cmd", shell: true }] : []),
    ];

/**
 * stderr is INHERITED, not captured, so the CLI's own progress reaches the terminal while
 * this runs. The first version buffered both streams: an Opus crawl takes minutes and
 * printed nothing until it finished, which is indistinguishable from a hang — and the
 * first person to run it reported exactly that. Silence is not a neutral default; it is
 * a claim that nothing is happening.
 *
 * The timeout is the other half. A headless run that stalls — waiting on auth, on a
 * permission prompt that should not fire, on a network hiccup — must end by itself rather
 * than sit there until someone gives up.
 */
/** "90s" or "10 min" — never "0 min", which is what rounding a short limit produced. */
const human = (ms) => (ms < 60000 ? `${Math.round(ms / 1000)}s` : `${Math.round(ms / 60000)} min`);

function runCli({ bin, shell }) {
  const started = Date.now();
  const via = shell ? " (via shell — timeout may not stop it; install resolves this)" : "";
  console.error(`  running ${bin}${via}\n  timeout ${human(TIMEOUT_MS)} · stderr below\n`);
  const res = spawnSync(bin, argv, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 32e6,
    shell,
    timeout: TIMEOUT_MS,
    stdio: ["ignore", "pipe", "inherit"],
  });
  if (res.error) {
    if (res.error.code === "ETIMEDOUT") {
      throw Object.assign(new Error(`timed out after ${human(Date.now() - started)}`), { timedOut: true });
    }
    throw Object.assign(res.error, { stderr: res.stderr });
  }
  if (res.signal === "SIGTERM" || res.status === null) {
    const mins = Math.round((Date.now() - started) / 60000);
    throw Object.assign(new Error(`timed out after ~${mins} min`), { timedOut: true });
  }
  if (res.status !== 0) {
    throw Object.assign(new Error(`exited ${res.status}`), { stdout: res.stdout, stderr: res.stderr });
  }
  return res.stdout;
}

let raw;
let lastErr;
for (const cand of CANDIDATES) {
  try {
    raw = runCli(cand);
    break;
  } catch (err) {
    lastErr = err;
    // ENOENT means this candidate does not exist; anything else means it ran and failed,
    // which is a real error worth surfacing rather than trying the next name.
    if (err.code !== "ENOENT" && !/not recognized|command not found/i.test(String(err.stderr ?? ""))) break;
  }
}

if (raw === undefined) {
  const notFound =
    lastErr?.code === "ENOENT" || /not recognized|command not found/i.test(String(lastErr?.stderr ?? ""));
  if (lastErr?.timedOut) {
    console.error(`❌ the crawler did not finish in time: ${lastErr.message}.`);
    console.error(`\n   A headless run that stalls is usually waiting on something interactive —`);
    console.error(`   authentication, or a permission prompt that should not fire under a read-only`);
    console.error(`   allowlist. Run \`claude\` once interactively to confirm you are logged in,`);
    console.error(`   then retry. If the scope is genuinely large, raise the limit:`);
    console.error(`     CRAWL_TIMEOUT_MS=1800000 node scripts/crawl.mjs ${agent}\n`);
  } else if (notFound) {
    console.error(`❌ the \`claude\` CLI was not found (tried: ${CANDIDATES.join(", ")}).`);
    console.error(`\n   The VS Code extension bundles its own copy and does not put one on PATH,`);
    console.error(`   so this is expected on a machine that has only ever used the extension.`);
    console.error(`\n   Either:`);
    console.error(`     · install the CLI, then re-run; or`);
    console.error(`     · point this at an existing binary:  CLAUDE_CLI="C:/path/to/claude.cmd" node scripts/crawl.mjs ${agent}`);
    console.error(`\n   Or skip the wrapper entirely: ask the \`${agent}\` agent for a crawl inside an`);
    console.error(`   interactive session. The agent is the deliverable; this wrapper only exists`);
    console.error(`   to run it unattended on a schedule.\n`);
  } else {
    console.error(`❌ crawler invocation failed: ${lastErr?.shortMessage ?? lastErr?.message}`);
    if (lastErr?.stdout) console.error(String(lastErr.stdout).slice(0, 2000));
    if (lastErr?.stderr) console.error(String(lastErr.stderr).slice(0, 2000));
  }
  process.exit(1);
}

/** The CLI envelope. Every field defaulted — never assume one exists. */
let envelope = {};
try {
  envelope = JSON.parse(raw);
} catch {
  console.error("❌ the CLI did not return JSON. First 500 characters:\n");
  console.error(raw.slice(0, 500));
  process.exit(1);
}

if (envelope.is_error) {
  console.error(`❌ the crawler reported an error: ${envelope.result ?? "(no detail)"}`);
  process.exit(1);
}

/** The agent's own payload, which arrives as a string inside `result`. */
const body = typeof envelope.result === "string" ? envelope.result : JSON.stringify(envelope.result ?? {});
const jsonStart = body.indexOf("{");
let report;
try {
  report = JSON.parse(body.slice(jsonStart));
} catch {
  console.error("❌ the crawler emitted something other than the JSON object it was asked for.");
  console.error("   The contract is: no preamble, no markdown fence, one object. Got:\n");
  console.error(body.slice(0, 500));
  process.exit(1);
}

const findings = Array.isArray(report.findings) ? report.findings : [];
/**
 * `total_cost_usd` is an API-EQUIVALENT estimate, not a charge.
 *
 * On an OAuth/subscription login — which is how this is normally run — the work draws on
 * the plan's usage, the same pool as an interactive session, and no dollar amount is
 * billed for it. Printing a bare "$0.73" reads as money leaving an account and invites
 * the wrong decision about how often to run this. The number is still worth showing: it
 * is the best available measure of how much work a run did, and therefore of how much
 * rate-limit budget it took from everything else.
 */
const cost =
  typeof envelope.total_cost_usd === "number"
    ? ` · ≈$${envelope.total_cost_usd.toFixed(2)} of work (API-equivalent; on a subscription login this is usage, not a charge)`
    : "";

console.log(`\n${agent}${scope ? ` · scope ${scope}` : ""} — ${findings.length} finding(s)${cost}\n`);

if (findings.length > MAX_FINDINGS) {
  console.log(`⚠ cap exceeded: ${findings.length} findings against a limit of ${MAX_FINDINGS}.`);
  console.log(`  An uncapped report hands triage back to the reader, which is the thing the cap`);
  console.log(`  protects. Treat this run as untriaged.\n`);
}

for (const f of findings) {
  const sev = String(f.severity ?? "?").toUpperCase().padEnd(6);
  console.log(`  [${sev}] ${f.title ?? "(untitled)"}`);
  for (const loc of f.locations ?? []) console.log(`           ${loc}`);
  if (f.rule) console.log(`           rule: ${f.rule}`);
  if (f.case) console.log(`           case: ${f.case}`);
  if (f.why_no_check) console.log(`           no check because: ${f.why_no_check}`);
  if (f.suggested_action) console.log(`           do: ${f.suggested_action}`);
  if (f.escalation_candidate) console.log(`           ⚑ believes this class should become a check`);
  console.log();
}

if (!findings.length) {
  console.log("  Nothing. An empty result is a valid answer — this crawler only looks at\n" +
              "  classes no mechanism can decide, and those should be rare in a healthy tree.\n");
}
