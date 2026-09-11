#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// delivery-report — the project's position, for the person paying for it,
// per standards/DELIVERY-STANDARD.md
//
// @kit delivery-report v2 — tracked. Edit it in dev-standards and re-adopt; a local change
// here is a fork, and `check-kit-drift.mjs` will say so.
//
//   node scripts/delivery-report.mjs [dir] --check              # the gate: the plan is well-formed
//                                                               # and its baseline moved only on record
//   node scripts/delivery-report.mjs [dir] --html [period] [--out file]
//   node scripts/delivery-report.mjs [dir] --json [period]      # the computed model, for a portfolio
//   node scripts/delivery-report.mjs --selftest
//
//   period: --month 2026-09 · --quarter 2026-Q3 · --since 2026-09-01 · --from D --to D
//           · nothing, for the project to date
//
// ONE SOURCE, WRITTEN FOR THE READER. Everything the report shows comes from
// `brief/build/90-release.md` — the band BRIEF-STANDARD §3.1 reserved for "phases, cutover, what
// ships when" and nobody had used. The report reads no other file in the tree, so nothing written
// for an engineer (a path, a lesson id, a credential in EVIDENCE.md) can reach the person paying.
// That is the redaction boundary, and it is an allow-list: one file, named fields. EVIDENCE.md is
// read for one thing — that the contract value is a fact it carries — and nothing from it is shown.
//
// STATUS IS COMPUTED, NEVER WRITTEN. The plan holds dates that happened and figures that were
// agreed; "on track", "slipping", "overdue" are derived from them as of a date. A status somebody
// types is a claim, and BRIEF-STANDARD §2.1 already forbids a hand-kept status file for that reason.
//
// THE BASELINE MOVES ONLY ON RECORD. Once the plan carries `**Baseline agreed:**`, a changed
// baseline date, budget or estimate — and an added or removed milestone — must be matched by a
// `**Changed:**` line saying when, what, and why. Read from git history, every committed version
// against the next, so a slip cannot be absorbed by editing the date it slipped against. The change
// log is append-only for the same reason. Before agreement the plan is a draft and moves freely.
//
// A REPORT IS REPRODUCIBLE OR IT SAYS SO. A past period is rendered from the plan AS COMMITTED at
// the period's end, so September's report reads the same in December. A report from uncommitted
// changes is refused unless --preview, and then it is stamped PREVIEW on every page.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, mkdirSync, realpathSync, symlinkSync } from "node:fs";
import { join, resolve, relative, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

/* KIT:CONFIG report — yours */
const PLAN_PATH = "brief/build/90-release.md";
const EVIDENCE_PATH = "brief/EVIDENCE.md";
const LOCALE = "en-ZA";
const WAIT_AMBER_DAYS = 14;
/* KIT:CONFIG /report */

const HEADER_FIELDS = ["project", "for", "currency", "contract value", "delivery date", "day rate", "baseline agreed", "rag override"];
const MS_FIELDS = ["outcome", "done when", "estimate", "budget", "baseline", "forecast", "started", "done", "evidence", "waiting on", "learned"];
/** Fields the report renders. `evidence` is the one that is NOT — it is for the gate, and may carry a SHA. */
const RENDERED_MS = ["outcome", "done when", "waiting on", "learned"];
const CHANGE_FIELDS = ["baseline", "budget", "estimate", "added", "removed", "delivery", "contract"];

/* ── primitives ───────────────────────────────────────────────────────────── */

const EMPTY = /^[—–-]?$/;
const blank = (v) => v === undefined || EMPTY.test(String(v).trim());
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "") && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
/** A figure: digits, with spaces or commas as thousands separators and a dot for decimals. */
const num = (s) => {
  const t = String(s ?? "").replace(/[\s,]/g, "");
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
};
const daysOf = (s) => {
  const m = /^(\d+(?:\.\d+)?)\s*days?$/.exec(String(s ?? "").trim());
  return m ? Number(m[1]) : NaN;
};
const ms = (d) => Date.parse(`${d}T00:00:00Z`);
const dayDiff = (a, b) => Math.round((ms(a) - ms(b)) / 86400000);
const addDays = (d, n) => new Date(ms(d) + n * 86400000).toISOString().slice(0, 10);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
/**
 * `…, since YYYY-MM-DD` closing a line: the date, and the text before it less that comma. A string
 * operation rather than `/,?\s*since …$/`, which an unanchored search retries from every position.
 */
export const sinceTail = (s) => {
  const m = /since (\d{4}-\d{2}-\d{2})\s*$/.exec(s);
  if (!m) return null;
  const before = s.slice(0, m.index).trimEnd();
  return { date: m[1], before: before.endsWith(",") ? before.slice(0, -1) : before };
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/* ── parse ────────────────────────────────────────────────────────────────── */

// LINEAR BY CONSTRUCTION (CF-5, pleks). No two adjacent pieces can match the same character, so the
// engine never has a choice to backtrack over: the old value holds no arrow and does not start with
// an em dash, the new value holds no em dash, and the reason is trimmed where it is read rather than
// by a `\s*` in front of `(.*)`. `\s` stays — `[ \t]` would stop matching a non-breaking space.
const CHANGE = /^(\d{4}-\d{2}-\d{2})\s*·\s*(MS-\d{2,3}|plan)\s+([a-z]+)(?:\s+((?:[^\s→—-]|-(?!>))(?:[^\s→-]|-(?!>))*)\s*(?:→|->)\s*([^\s—]+))?\s*—(.*)$/;

/**
 * The plan, as data. Lenient by design — it collects what it cannot read into `problems` rather than
 * throwing, so `--check` can name every defect in one run and history can parse old versions.
 */
export function parsePlan(text) {
  const plan = { header: {}, milestones: [], spend: [], changes: [], problems: [] };
  let section = "header";
  let cur = null;
  let cols = null;
  let body = false;
  const put = (target, allowed, key, val, n, where, written) => {
    if (!allowed.includes(key)) {
      plan.problems.push(`${n}: \`**${written}:**\` is not a ${where} field — one of: ${allowed.join(", ")}`);
      return;
    }
    if (key in target) plan.problems.push(`${n}: \`**${written}:**\` appears twice in ${where === "plan" ? "the header" : cur.id}`);
    target[key] = val;
  };
  String(text).split(/\r?\n/).forEach((raw, i) => {
    const n = i + 1;
    const line = raw.trimEnd();
    const h2 = /^## (.+)$/.exec(line);
    if (h2) {
      const t = h2[1].trim().toLowerCase();
      section = ["milestones", "spend", "changes"].includes(t) ? t : "other";
      cur = null;
      cols = null;
      body = false;
      return;
    }
    const h3 = /^### (.+)$/.exec(line);
    if (h3 && section === "milestones") {
      const m = /^(MS-\d{2,3})\s*·(.+)$/.exec(h3[1].trim());
      if (!m) {
        plan.problems.push(`${n}: a milestone heading reads \`### MS-01 · what the payer gets\` — got \`### ${h3[1].trim()}\``);
        cur = null;
        return;
      }
      cur = { id: m[1], title: m[2].trim(), line: n, f: {} };
      plan.milestones.push(cur);
      return;
    }
    const f = /^\s*-\s*\*\*([^*:]+):\*\*(.*)$/.exec(line);
    if (f) {
      const key = f[1].trim().toLowerCase();
      const val = f[2].trim();
      if (section === "header") put(plan.header, HEADER_FIELDS, key, val, n, "plan", f[1].trim());
      else if (section === "milestones" && cur) put(cur.f, MS_FIELDS, key, val, n, "milestone", f[1].trim());
      else if (section === "changes") {
        if (key !== "changed") plan.problems.push(`${n}: under ## Changes every entry is \`- **Changed:** …\``);
        else plan.changes.push(parseChange(val, n, plan.problems));
      }
      return;
    }
    if (section === "spend" && line.trim().startsWith("|")) {
      const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      if (!cols) {
        cols = cells.map((c) => c.toLowerCase());
        for (const need of ["date", "milestone", "days", "amount"]) {
          if (!cols.includes(need)) plan.problems.push(`${n}: the spend table needs a \`${need}\` column — it has ${cols.join(", ")}`);
        }
        return;
      }
      if (!body) {
        if (cells.every((c) => /^:?-{3,}:?$/.test(c))) body = true;
        return;
      }
      const row = Object.fromEntries(cols.map((c, j) => [c, cells[j] ?? ""]));
      plan.spend.push({ line: n, date: row.date, ms: row.milestone, days: row.days, amount: row.amount, note: row.note ?? "" });
    }
  });
  return plan;
}

function parseChange(val, n, problems) {
  const m = CHANGE.exec(val);
  const shape = "`- **Changed:** 2026-09-12 · MS-03 baseline 2026-10-15 → 2026-11-01 — why, and who agreed`";
  if (!m) {
    problems.push(`${n}: a change reads ${shape}`);
    return { line: n, raw: val, bad: true };
  }
  const [, date, target, field, from, to, reason] = m;
  const c = { line: n, raw: val, date, target, field, from: from ?? null, to: to ?? null, reason: reason.trim() };
  const valued = ["baseline", "budget", "estimate", "delivery", "contract"].includes(field);
  if (!CHANGE_FIELDS.includes(field)) problems.push(`${n}: \`${field}\` is not something a change can move — one of: ${CHANGE_FIELDS.join(", ")}`);
  else if ((target === "plan") !== ["delivery", "contract"].includes(field)) {
    problems.push(`${n}: \`${field}\` belongs to ${["delivery", "contract"].includes(field) ? "`plan`" : "a milestone"}, not \`${target}\``);
  } else if (valued && (c.from === null || c.to === null)) problems.push(`${n}: a ${field} change names both values — \`${field} OLD → NEW\``);
  else if (!valued && c.from !== null) problems.push(`${n}: \`${field}\` takes no values — \`${target} ${field} — why\``);
  if (!c.reason) problems.push(`${n}: a change without a reason is the silent edit this log exists to prevent`);
  if (!isDate(date)) problems.push(`${n}: \`${date}\` is not a date`);
  return c;
}

/* ── check ────────────────────────────────────────────────────────────────── */

/** Anything that reads as written for an engineer. The report's reader is the person paying. */
const INTERNAL = [
  [/\bL-\d{2,3}\b/, "a lesson id"],
  [/\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/, "a commit SHA"],
  [/\b[\w.-]+\/[\w./-]*\.(?:m?js|ts|tsx|jsx|md|json|sql|ya?ml|css|html)\b/, "a file path"],
  [/\b(?:sk|pk|rk)_(?:live|test)_|\beyJ[\w-]{10,}|-----BEGIN |\bghp_\w{20,}/, "something shaped like a credential"],
];

export function internalMarks(text) {
  return INTERNAL.filter(([re]) => re.test(String(text ?? ""))).map(([, what]) => what);
}

/** Every finding in the plan as it stands. `evidence` is EVIDENCE.md's text, or null if absent. */
export function checkPlan(plan, { evidence }) {
  const out = [...plan.problems];
  const h = plan.header;
  const at = (id) => `${PLAN_PATH} ${id}`;

  if (blank(h.for)) out.push(`${PLAN_PATH}: \`**For:**\` names who the report is for — the client or board paying for the work`);
  let currencyOk = false;
  try {
    currencyOk = /^[A-Z]{3}$/.test(h.currency ?? "") && !!new Intl.NumberFormat("en", { style: "currency", currency: h.currency });
  } catch { /* an unknown code is reported below */ }
  if (!currencyOk) out.push(`${PLAN_PATH}: \`**Currency:**\` is a three-letter code such as ZAR or USD — got \`${h.currency ?? "(none)"}\``);
  const contract = num(h["contract value"]);
  if (Number.isNaN(contract)) out.push(`${PLAN_PATH}: \`**Contract value:**\` is a figure — got \`${h["contract value"] ?? "(none)"}\``);
  else if (evidence === null) out.push(`${EVIDENCE_PATH} is missing, and the contract value is a fact it must carry (BRIEF-STANDARD §2.3)`);
  else if (!carries(evidence, contract)) {
    out.push(`${PLAN_PATH}: the contract value ${h["contract value"]} is not in ${EVIDENCE_PATH} — every figure is a fact with a source there first (BRIEF-STANDARD §2.3)`);
  }
  if (!isDate(h["delivery date"])) out.push(`${PLAN_PATH}: \`**Delivery date:**\` is the agreed date, YYYY-MM-DD — got \`${h["delivery date"] ?? "(none)"}\``);
  if (!blank(h["day rate"]) && Number.isNaN(num(h["day rate"]))) out.push(`${PLAN_PATH}: \`**Day rate:**\` is a figure — got \`${h["day rate"]}\``);
  if (!blank(h["baseline agreed"]) && !/^\d{4}-\d{2}-\d{2}\b/.test(h["baseline agreed"])) {
    out.push(`${PLAN_PATH}: \`**Baseline agreed:**\` opens with the date the payer agreed the plan — got \`${h["baseline agreed"]}\``);
  }
  if (!blank(h["rag override"]) && !/^(green|amber|red)\s*—\s*\S/.test(h["rag override"])) {
    out.push(`${PLAN_PATH}: \`**RAG override:**\` reads \`amber — the reason\`; an override without its reason is not shown to anyone`);
  }
  for (const k of ["project", "for"]) for (const what of internalMarks(h[k])) out.push(`${PLAN_PATH}: \`**${k}:**\` carries ${what}, and it is shown to the payer`);

  // L-10: a report on nothing must not render as a clean one.
  if (!plan.milestones.length) out.push(`${PLAN_PATH}: no milestones under \`## Milestones\` — a report on nothing reads as a clean one`);

  const seen = new Set();
  for (const m of plan.milestones) {
    const f = m.f;
    if (seen.has(m.id)) out.push(`${at(m.id)}: the id appears twice`);
    seen.add(m.id);
    for (const k of ["outcome", "done when"]) if (blank(f[k])) out.push(`${at(m.id)}: \`**${k}:**\` is empty`);
    if (Number.isNaN(daysOf(f.estimate))) out.push(`${at(m.id)}: \`**Estimate:**\` reads \`8 days\` — got \`${f.estimate ?? "(none)"}\``);
    if (Number.isNaN(num(f.budget))) out.push(`${at(m.id)}: \`**Budget:**\` is a figure — got \`${f.budget ?? "(none)"}\``);
    if (!isDate(f.baseline)) out.push(`${at(m.id)}: \`**Baseline:**\` is the agreed date, YYYY-MM-DD — got \`${f.baseline ?? "(none)"}\``);
    else if (isDate(h["delivery date"]) && f.baseline > h["delivery date"]) {
      out.push(`${at(m.id)}: its baseline ${f.baseline} is after the delivery date ${h["delivery date"]} — the plan is late on the day it is agreed`);
    }
    for (const k of ["started", "done", "forecast"]) if (!blank(f[k]) && !isDate(f[k])) out.push(`${at(m.id)}: \`**${k}:**\` is YYYY-MM-DD or — ; got \`${f[k]}\``);
    const done = !blank(f.done);
    if (!done && blank(f.forecast)) out.push(`${at(m.id)}: not done, so \`**Forecast:**\` says when it will be`);
    if (done) {
      if (blank(f.started)) out.push(`${at(m.id)}: done with no \`**Started:**\` date — its duration cannot be measured`);
      else if (isDate(f.started) && isDate(f.done) && f.done < f.started) out.push(`${at(m.id)}: done ${f.done} before it started ${f.started}`);
      if (blank(f.evidence)) out.push(`${at(m.id)}: done with no \`**Evidence:**\` — what can be checked to show it is done`);
      if (blank(f.learned)) out.push(`${at(m.id)}: done with no \`**Learned:**\` — closing a milestone records what it taught, for the reader`);
    }
    for (const what of internalMarks(m.title)) out.push(`${at(m.id)}: its title carries ${what}, and it is shown to the payer`);
    for (const k of RENDERED_MS) for (const what of internalMarks(f[k])) out.push(`${at(m.id)}: \`**${k}:**\` carries ${what}, and it is shown to the payer — the gate's proof goes in \`**Evidence:**\`, which is not`);
  }

  const budgets = plan.milestones.map((m) => num(m.f.budget)).filter((x) => !Number.isNaN(x));
  if (!Number.isNaN(contract) && sum(budgets) > contract) {
    out.push(`${PLAN_PATH}: the milestone budgets total ${sum(budgets)}, more than the contract value ${contract}`);
  }

  const rate = num(plan.header["day rate"]);
  for (const s of plan.spend) {
    const where = `${PLAN_PATH}:${s.line}`;
    if (!isDate(s.date)) out.push(`${where}: spend date \`${s.date}\` is not YYYY-MM-DD`);
    if (!seen.has(s.ms)) out.push(`${where}: spend against \`${s.ms}\`, which is not a milestone here`);
    const d = blank(s.days) ? null : num(s.days);
    const a = blank(s.amount) ? null : num(s.amount);
    if (Number.isNaN(d) || Number.isNaN(a)) out.push(`${where}: days and amount are figures or —`);
    if (d === null && a === null) out.push(`${where}: a spend row with neither days nor an amount records nothing`);
    if (a === null && d !== null && Number.isNaN(rate)) out.push(`${where}: no amount and no \`**Day rate:**\` to cost ${s.days} days with`);
    for (const what of internalMarks(s.note)) out.push(`${where}: the note carries ${what}, and it is shown to the payer`);
  }
  for (const c of plan.changes) for (const what of internalMarks(c.reason)) out.push(`${PLAN_PATH}:${c.line}: the reason carries ${what}, and it is shown to the payer`);
  return out;
}

/** Does EVIDENCE.md carry this figure, however its thousands are separated? */
function carries(evidence, value) {
  const flat = evidence.replace(/(\d)[\s,](?=\d{3}(?!\d))/g, "$1").replace(/(\d)[\s,](?=\d{3}(?!\d))/g, "$1");
  return new RegExp(`(?<![\\d.])${String(value).replace(".", "\\.")}(?![\\d]|\\.\\d)`).test(flat);
}

/* ── history ──────────────────────────────────────────────────────────────── */

const same = (a, b) => (Number.isNaN(num(a)) || Number.isNaN(num(b)) ? String(a ?? "").trim() === String(b ?? "").trim() : num(a) === num(b));

/**
 * Every move of the agreed baseline, and whether the latest plan records it. `versions` runs oldest
 * to newest as `{ label, text }`. A move is recorded when the LATEST version holds a matching
 * `**Changed:**` line — late is allowed, because a finding about an old commit must be fixable in
 * today's tree; silently is not.
 */
export function historyFindings(versions) {
  if (versions.length < 2) return [];
  const out = [];
  const parsed = versions.map((v) => ({ label: v.label, plan: parsePlan(v.text) }));
  const latest = parsed.at(-1).plan;
  const log = latest.changes.filter((c) => !c.bad);
  const recorded = (target, field, from, to) =>
    log.some((c) => c.target === target && c.field === field && (from === undefined || (same(c.from, from) && same(c.to, to))));
  const shape = (target, field, from, to) =>
    `\`- **Changed:** YYYY-MM-DD · ${target} ${field}${from === undefined ? "" : ` ${from} → ${to}`} — why, and who agreed\``;

  const kept = new Set(log.map((c) => c.raw));
  const gone = new Set();
  for (const { label, plan } of parsed.slice(0, -1)) {
    for (const c of plan.changes) {
      if (!c.bad && !kept.has(c.raw) && !gone.has(c.raw)) {
        gone.add(c.raw);
        out.push(`${PLAN_PATH}: the change \`${c.raw}\` (in ${label}) is no longer in the log — the log is append-only; restore it`);
      }
    }
  }

  for (let i = 0; i + 1 < parsed.length; i++) {
    const a = parsed[i].plan;
    const b = parsed[i + 1].plan;
    const where = parsed[i + 1].label;
    if (blank(a.header["baseline agreed"])) continue; // a draft moves freely
    if (blank(b.header["baseline agreed"])) {
      out.push(`${where}: the plan was agreed and is a draft again — \`**Baseline agreed:**\` cannot be removed once set`);
      continue;
    }
    const miss = (target, field, from, to, what) => {
      if (!recorded(target, field, from, to)) out.push(`${where}: ${what} with no recorded reason — add ${shape(target, field, from, to)} under ## Changes`);
    };
    for (const [key, field] of [["delivery date", "delivery"], ["contract value", "contract"]]) {
      if (!same(a.header[key], b.header[key])) miss("plan", field, a.header[key], b.header[key], `the ${key} moved ${a.header[key]} → ${b.header[key]}`);
    }
    const before = new Map(a.milestones.map((m) => [m.id, m]));
    const after = new Map(b.milestones.map((m) => [m.id, m]));
    for (const [id] of before) if (!after.has(id)) miss(id, "removed", undefined, undefined, `${id} was removed`);
    for (const [id] of after) if (!before.has(id)) miss(id, "added", undefined, undefined, `${id} was added after the plan was agreed`);
    for (const [id, m] of after) {
      const o = before.get(id);
      if (!o) continue;
      for (const field of ["baseline", "budget"]) {
        if (!same(o.f[field], m.f[field])) miss(id, field, o.f[field], m.f[field], `${id} ${field} moved ${o.f[field]} → ${m.f[field]}`);
      }
      const e0 = daysOf(o.f.estimate);
      const e1 = daysOf(m.f.estimate);
      if (e0 !== e1 && !(Number.isNaN(e0) && Number.isNaN(e1))) miss(id, "estimate", String(e0), String(e1), `${id} estimate moved ${e0} → ${e1} days`);
    }
  }
  return out;
}

/**
 * Every committed version of the plan, oldest first, plus the working tree if it differs.
 *
 * READ FROM THE REPOSITORY THAT TRACKS THE PLAN, which need not be the project's (CF-4, pleks). The
 * plan carries the contract value, the day rate and every budget, so a project on a PUBLIC
 * repository cannot commit it; it can keep the plan in a private repository and link to it (`brief/`
 * as a symlink, say), and the history is then that repository's. The real path decides, not the
 * project's `.git`.
 *
 * A plan no repository tracks has no history, and says so. v1 said so for one case only — no `.git`
 * — and stayed quiet in the case that misleads more: a repository present, the plan ignored by it,
 * `git log` returning nothing, and one version compared with nothing reported as "history: 1
 * version(s) read". `ls-files` separates that from the first commit of a tracked plan, which is
 * staged, has no history yet, and is fine.
 */
export function planVersions(root, planFile = join(root, PLAN_PATH)) {
  const file = realpathSync(planFile);
  const wt = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  // `dirty`: an untracked plan is, honestly, not any commit. What it may still produce is decided by
  // `untracked` where the report is built, not by this field happening to be unset.
  const unchecked = (why) => ({ versions: [{ label: "working tree", date: null, text: wt }], dirty: true, untracked: true, note: `${why} — the baseline's history was NOT checked` });
  const top = spawnSync("git", ["-C", dirname(file), "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  if (top.status !== 0) return unchecked("the plan is not in a git repository");
  // From the repository's root, because a pathspec after `--` is read relative to where git runs.
  const git = (...a) => spawnSync("git", ["-C", top.stdout.trim(), ...a], { encoding: "utf8", maxBuffer: 64 << 20 });
  const rel = relative(top.stdout.trim(), file).split(sep).join("/");
  if (git("ls-files", "--error-unmatch", "--", rel).status !== 0) {
    return unchecked(git("check-ignore", "-q", "--", rel).status === 0 ? "the plan is ignored by git" : "the plan is not tracked by git");
  }
  const log = git("log", "--format=%H %cs", "--reverse", "--", rel);
  if (log.status !== 0) return { error: `git log failed: ${(log.stderr || "").trim().split("\n")[0]}` };
  const versions = [];
  for (const l of log.stdout.split("\n").filter(Boolean)) {
    const [sha, date] = l.split(" ");
    const show = git("show", `${sha}:${rel}`);
    if (show.status === 0) versions.push({ label: sha.slice(0, 7), sha, date, text: show.stdout.replace(/\r\n/g, "\n") });
  }
  const dirty = !versions.length || versions.at(-1).text !== wt;
  if (dirty) versions.push({ label: "working tree", date: null, text: wt });
  return { versions, dirty };
}

/* ── compute ──────────────────────────────────────────────────────────────── */

/**
 * The position as of a date, and what happened in a period. Facts dated after `asof` are not yet
 * facts: a milestone done after it is not done, spend after it is not spent. Pure.
 */
export function compute(plan, { asof, from, to, label }) {
  const h = plan.header;
  const rate = num(h["day rate"]);
  const contract = num(h["contract value"]);
  const delivery = h["delivery date"];
  const inPeriod = (d) => isDate(d) && d >= from && d <= to;
  const spendAmount = (s) => (blank(s.amount) ? (blank(s.days) ? 0 : num(s.days) * rate) : num(s.amount));
  const spend = plan.spend.filter((s) => isDate(s.date) && s.date <= asof).map((s) => ({ ...s, cost: spendAmount(s), d: blank(s.days) ? 0 : num(s.days) }));

  const milestones = plan.milestones.map((m) => {
    const f = m.f;
    const done = isDate(f.done) && f.done <= asof ? f.done : null;
    const started = isDate(f.started) && f.started <= asof ? f.started : null;
    const forecast = isDate(f.forecast) ? f.forecast : null;
    const rows = spend.filter((s) => s.ms === m.id);
    const x = {
      id: m.id, title: m.title, outcome: f.outcome, doneWhen: f["done when"], learned: blank(f.learned) ? null : f.learned,
      waiting: blank(f["waiting on"]) ? null : f["waiting on"],
      baseline: f.baseline, forecast, started, done,
      estimate: daysOf(f.estimate), budget: num(f.budget),
      logged: sum(rows.map((s) => s.d)), cost: sum(rows.map((s) => s.cost)),
      state: done ? "done" : started ? "active" : "planned",
    };
    x.end = done ?? forecast ?? x.baseline;
    if (done) {
      const late = dayDiff(done, x.baseline);
      x.tone = late > 0 ? "warn" : "good";
      x.status = late > 0 ? `Done, ${late} day${late === 1 ? "" : "s"} late` : "Done";
    } else {
      const overdue = forecast && asof > forecast ? dayDiff(asof, forecast) : 0;
      const slip = forecast ? dayDiff(forecast, x.baseline) : 0;
      x.overdue = overdue;
      x.slip = slip;
      x.tone = overdue ? "bad" : slip > 0 ? "warn" : "good";
      x.status = overdue ? `Overdue by ${overdue} day${overdue === 1 ? "" : "s"}`
        : slip > 0 ? `${slip} day${slip === 1 ? "" : "s"} behind plan`
          : started ? "In progress" : "Not started";
    }
    const since = /since (\d{4}-\d{2}-\d{2})/.exec(x.waiting ?? "");
    x.waitingAge = since ? dayDiff(asof, since[1]) : null;
    return x;
  });

  const forecastDelivery = milestones.map((m) => m.end).filter(isDate).sort().at(-1) ?? delivery;
  const costTotal = sum(spend.map((s) => s.cost));
  const budgetTotal = sum(milestones.map((m) => m.budget).filter((b) => !Number.isNaN(b)));
  const earned = sum(milestones.filter((m) => m.done).map((m) => m.budget));
  const planned = sum(milestones.filter((m) => m.baseline <= asof).map((m) => m.budget));

  const red = [];
  const amber = [];
  for (const m of milestones) {
    if (m.overdue) red.push(`${m.id} ${m.title} is ${m.overdue} day${m.overdue === 1 ? "" : "s"} past its forecast date.`);
    else if (m.slip > 0) amber.push(`${m.id} ${m.title} is forecast ${m.slip} day${m.slip === 1 ? "" : "s"} after its agreed date.`);
    if (m.cost > m.budget) amber.push(`${m.id} has cost more than its budget.`);
    // Effort is a risk while the work is still running. Once a milestone is done its overrun is
    // history — the table shows it — and its money, if any was lost, is already in the cost check.
    if (!m.done && m.logged > m.estimate) amber.push(`${m.id} has taken more days than estimated (${m.logged} of ${m.estimate}) and is not finished.`);
    if (!m.done && m.waitingAge !== null && m.waitingAge > WAIT_AMBER_DAYS) amber.push(`${m.id} has waited on you for ${m.waitingAge} days.`);
  }
  if (isDate(delivery) && forecastDelivery > delivery) red.push(`The forecast finish is ${dayDiff(forecastDelivery, delivery)} days after the agreed delivery date.`);
  if (costTotal > contract) red.push("Spend has passed the contract value.");
  const computed = red.length ? "red" : amber.length ? "amber" : "green";
  const o = /^(green|amber|red)\s*—(.+)$/.exec(h["rag override"] ?? "");

  const period = {
    from, to, label,
    completed: milestones.filter((m) => inPeriod(m.done)),
    started: milestones.filter((m) => inPeriod(m.started)),
    changes: plan.changes.filter((c) => !c.bad && inPeriod(c.date) && c.date <= asof),
    spend: spend.filter((s) => inPeriod(s.date)),
  };
  period.cost = sum(period.spend.map((s) => s.cost));
  period.days = sum(period.spend.map((s) => s.d));

  return {
    project: h.project || "This project", for: h.for, currency: h.currency, asof,
    agreed: blank(h["baseline agreed"]) ? null : h["baseline agreed"],
    delivery, forecastDelivery, contract, budgetTotal, costTotal, earned, planned,
    daysLogged: sum(spend.map((s) => s.d)), estimateTotal: sum(milestones.map((m) => m.estimate).filter((e) => !Number.isNaN(e))),
    milestones, period,
    rag: { computed, shown: o ? o[1] : computed, override: o ? o[2].trim() : null, reasons: computed === "red" ? [...red, ...amber] : amber },
    learned: milestones.filter((m) => m.done && m.learned).sort((a, b) => (a.done < b.done ? 1 : -1)),
    waiting: milestones.filter((m) => !m.done && m.waiting),
  };
}

/* ── period ───────────────────────────────────────────────────────────────── */

export function resolvePeriod(opts, today, plan) {
  const fmtM = (y, m) => new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
  const last = (y, m) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const dates = [
    plan.header["baseline agreed"]?.slice(0, 10),
    ...plan.milestones.map((m) => m.f.started),
    ...plan.spend.map((s) => s.date),
    ...plan.changes.map((c) => c.date),
  ].filter(isDate).sort();
  let from;
  let to;
  let label;
  if (opts.month) {
    const m = /^(\d{4})-(\d{2})$/.exec(opts.month);
    if (!m || +m[2] < 1 || +m[2] > 12) return { error: `--month takes YYYY-MM — got ${opts.month}` };
    from = `${opts.month}-01`;
    to = last(+m[1], +m[2]);
    label = fmtM(+m[1], +m[2]);
  } else if (opts.quarter) {
    const q = /^(\d{4})-Q([1-4])$/.exec(opts.quarter);
    if (!q) return { error: `--quarter takes YYYY-Q1…Q4 — got ${opts.quarter}` };
    const first = (+q[2] - 1) * 3 + 1;
    from = `${q[1]}-${String(first).padStart(2, "0")}-01`;
    to = last(+q[1], first + 2);
    label = `Q${q[2]} ${q[1]}`;
  } else if (opts.since) {
    from = opts.since;
    to = today;
    label = `Since ${fmtDate(opts.since)}`;
  } else if (opts.from || opts.to) {
    from = opts.from ?? dates[0] ?? today;
    to = opts.to ?? today;
    label = `${fmtDate(from)} – ${fmtDate(to)}`;
  } else {
    from = dates[0] ?? today;
    to = today;
    label = "Project to date";
  }
  for (const [k, v] of [["from", from], ["to", to]]) if (!isDate(v)) return { error: `the period's ${k} date \`${v}\` is not YYYY-MM-DD` };
  if (from > to) return { error: `the period starts ${from}, after it ends ${to}` };
  return { from, to, label, asof: to < today ? to : today };
}

/* ── render ───────────────────────────────────────────────────────────────── */

const fmtDate = (s) => (isDate(s) ? new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${s}T00:00:00Z`)) : "—");
const fmtShort = (s) => new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${s}T00:00:00Z`));
const days = (n) => `${Number.isInteger(n) ? n : n.toFixed(1)} day${n === 1 ? "" : "s"}`;

const RAG_WORD = { green: "On track", amber: "At risk", red: "Off track" };
const RAG_TONE = { green: "good", amber: "warn", red: "bad" };

/** The report as a standalone HTML document — or, with `fragment`, the page body alone. */
export function renderHtml(m, { source, preview = false, fragment = false, generated, unverified = false }) {
  const money = (n) => new Intl.NumberFormat(LOCALE, { style: "currency", currency: m.currency, maximumFractionDigits: 0 }).format(n);
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
  const chip = (tone, text) => `<span class="chip ${tone}">${esc(text)}</span>`;
  const doneCount = m.milestones.filter((x) => x.done).length;
  const late = isDate(m.delivery) ? dayDiff(m.forecastDelivery, m.delivery) : 0;

  const verdict = late > 0
    ? `Forecast to finish on <b>${fmtDate(m.forecastDelivery)}</b>, ${days(late)} after the agreed ${fmtDate(m.delivery)}.`
    : `Forecast to finish on <b>${fmtDate(m.forecastDelivery)}</b>, ${late === 0 ? "on" : `${days(-late)} before`} the agreed ${fmtDate(m.delivery)}.`;

  // One scale for the whole schedule: every bar, marker, tick and label is placed by `x`.
  const all = m.milestones.flatMap((x) => [x.started, x.baseline, x.end]).concat([m.delivery, m.asof, m.period.from]).filter(isDate).sort();
  const lo = addDays(all[0], -10);
  const hi = addDays(all.at(-1), 10);
  const span = ms(hi) - ms(lo);
  const x = (d) => ((ms(d) - ms(lo)) / span) * 100;
  const months = [];
  for (let d = `${lo.slice(0, 7)}-01`; d <= hi; d = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7), 1)).toISOString().slice(0, 10)) if (d >= lo) months.push(d);
  const every = months.length > 14 ? 3 : months.length > 7 ? 2 : 1;
  const monthFmt = new Intl.DateTimeFormat(LOCALE, { month: "short", timeZone: "UTC" });
  const axis = months.map((d, i) => `<span class="tick${i % every ? " quiet" : ""}" style="left:${x(d).toFixed(2)}%">${i % every ? "" : esc(monthFmt.format(new Date(`${d}T00:00:00Z`)) + (d.slice(5, 7) === "01" || i === 0 ? ` ${d.slice(0, 4)}` : ""))}</span>`).join("");
  const guides = `<i class="guide today" style="left:${x(m.asof).toFixed(2)}%"></i>${isDate(m.delivery) ? `<i class="guide due" style="left:${x(m.delivery).toFixed(2)}%"></i>` : ""}`;
  const rows = m.milestones.map((s) => {
    const parts = [];
    if (s.started) {
      const stop = s.done ?? m.asof;
      parts.push(`<i class="bar ${s.done ? "done" : "active"}" style="left:${x(s.started).toFixed(2)}%;width:${Math.max(x(stop) - x(s.started), 0.6).toFixed(2)}%"></i>`);
    }
    if (!s.done && s.forecast && s.forecast > (s.started ? m.asof : s.forecast)) {
      parts.push(`<i class="bar ahead" style="left:${x(m.asof).toFixed(2)}%;width:${(x(s.forecast) - x(m.asof)).toFixed(2)}%"></i>`);
    }
    if (s.end > s.baseline) parts.push(`<i class="slip" style="left:${x(s.baseline).toFixed(2)}%;width:${(x(s.end) - x(s.baseline)).toFixed(2)}%"></i>`);
    parts.push(`<i class="mark base" style="left:${x(s.baseline).toFixed(2)}%" title="Agreed ${fmtDate(s.baseline)}"></i>`);
    parts.push(`<i class="mark end ${s.tone}" style="left:${x(s.end).toFixed(2)}%" title="${s.done ? "Done" : "Forecast"} ${fmtDate(s.end)}"></i>`);
    return `<div class="g-row"><div class="g-label"><span class="id">${esc(s.id)}</span> ${esc(s.title)}</div><div class="g-track">${guides}${parts.join("")}</div></div>`;
  }).join("");

  const list = (items, empty) => (items.length ? `<ul>${items.join("")}</ul>` : `<p class="none">${esc(empty)}</p>`);
  const p = m.period;
  const changeText = (c) => {
    if (c.field === "added") return `${c.target} added to the plan`;
    if (c.field === "removed") return `${c.target} removed from the plan`;
    const v = (val) => (c.field === "budget" || c.field === "contract" ? money(num(val)) : c.field === "estimate" ? days(num(val)) : fmtDate(val));
    const what = { baseline: "agreed date", budget: "budget", estimate: "estimate", delivery: "delivery date", contract: "contract value" }[c.field];
    return `${c.target === "plan" ? "The" : `${c.target}`} ${what} moved from ${v(c.from)} to ${v(c.to)}`;
  };
  const bySpend = [...new Set(p.spend.map((s) => s.ms))].map((id) => {
    const r = p.spend.filter((s) => s.ms === id);
    const t = m.milestones.find((z) => z.id === id);
    return `<li><span class="id">${esc(id)}</span> ${esc(t?.title ?? "")} <span class="fig">${money(sum(r.map((s) => s.cost)))}</span></li>`;
  });

  const table = m.milestones.map((s) => `<tr>
      <td><span class="id">${esc(s.id)}</span><b>${esc(s.title)}</b><small>${esc(s.outcome)}</small></td>
      <td>${chip(s.tone, s.status)}</td>
      <td class="num">${fmtDate(s.baseline)}</td>
      <td class="num">${s.done ? fmtDate(s.done) : `${fmtDate(s.forecast)}<small>forecast</small>`}</td>
      <td class="num">${days(s.logged)}<small>of ${days(s.estimate)}</small></td>
      <td class="num">${money(s.cost)}<small>of ${money(s.budget)}</small></td>
    </tr>`).join("");

  const spentPct = pct(m.costTotal, m.contract);
  const unallocated = m.contract - m.budgetTotal;
  const title = `${m.project} · Delivery report · ${p.label}`;

  const body = `
<div class="sheet">
  ${preview ? `<p class="banner">PREVIEW — built from uncommitted changes to the plan. Not for sending.</p>` : ""}
  ${m.agreed ? "" : `<p class="banner">DRAFT PLAN — not yet agreed. Dates and figures may still change without a recorded reason.</p>`}
  <header class="mast">
    <p class="eyebrow">Delivery report · ${esc(p.label)}</p>
    <h1>${esc(m.project)}</h1>
    <p class="for">Prepared for ${esc(m.for)} · Position as of ${fmtDate(m.asof)}</p>
  </header>

  <section class="verdict ${RAG_TONE[m.rag.shown]}">
    <div class="state"><span class="dot"></span>${RAG_WORD[m.rag.shown]}</div>
    <div class="why">
      <p class="lede">${verdict}</p>
      ${m.rag.override ? `<p class="override">Our own measures read <b>${RAG_WORD[m.rag.computed].toLowerCase()}</b>; the team has set this to ${RAG_WORD[m.rag.shown].toLowerCase()} because ${esc(m.rag.override)}</p>` : ""}
      ${m.rag.reasons.length ? `<ul class="reasons">${m.rag.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
    </div>
  </section>

  <section class="figures" aria-label="Key figures">
    <div class="fig-cell"><span class="k">Finish</span><span class="v">${fmtDate(m.forecastDelivery)}</span><span class="s">agreed ${fmtDate(m.delivery)}${late > 0 ? ` · <em class="bad">${days(late)} late</em>` : ""}</span></div>
    <div class="fig-cell"><span class="k">Spent</span><span class="v">${money(m.costTotal)}</span><span class="s">${spentPct}% of ${money(m.contract)}</span><span class="meter"><i style="width:${Math.min(spentPct, 100)}%"></i></span></div>
    <div class="fig-cell"><span class="k">Delivered</span><span class="v">${money(m.earned)}</span><span class="s">of ${money(m.budgetTotal)} in milestones · ${money(m.planned)} due by now${m.earned >= m.planned ? "" : ` · <em class="bad">${money(m.planned - m.earned)} behind</em>`}</span><span class="meter"><i style="width:${Math.min(pct(m.earned, m.budgetTotal), 100)}%"></i><b style="left:${Math.min(pct(m.planned, m.budgetTotal), 100)}%" title="due by now"></b></span></div>
    <div class="fig-cell"><span class="k">Milestones</span><span class="v">${doneCount} of ${m.milestones.length}</span><span class="s">complete</span></div>
  </section>
  <p class="note">“Delivered” counts a milestone's budget only once it is complete — no part-credit for work in progress.</p>

  <section>
    <h2>Schedule</h2>
    <div class="gantt">
      <div class="g-row axis"><div class="g-label"></div><div class="g-track">${axis}</div></div>
      ${rows}
    </div>
    <p class="legend"><span><i class="mark base"></i>agreed date</span><span><i class="mark end good"></i>done or forecast</span><span><i class="slip-key"></i>behind the agreed date</span><span><i class="guide-key today"></i>today</span><span><i class="guide-key due"></i>agreed delivery</span></p>
  </section>

  <section class="period">
    <h2>${esc(p.label)}</h2>
    <div class="cols">
      <div><h3>Completed</h3>${list(p.completed.map((s) => `<li><span class="id">${esc(s.id)}</span> ${esc(s.title)} <span class="fig">${fmtShort(s.done)}</span></li>`), "No milestone completed in this period.")}</div>
      <div><h3>Started</h3>${list(p.started.map((s) => `<li><span class="id">${esc(s.id)}</span> ${esc(s.title)} <span class="fig">${fmtShort(s.started)}</span></li>`), "No milestone started in this period.")}</div>
      <div><h3>Spend · ${money(p.cost)}</h3>${list(bySpend, "Nothing was spent in this period.")}</div>
    </div>
    <h3>Changes to the agreed plan</h3>
    ${list(p.changes.map((c) => `<li><span class="fig">${fmtShort(c.date)}</span> ${esc(changeText(c))}. <span class="reason">${esc(c.reason)}</span></li>`), "The agreed plan did not change in this period.")}
  </section>

  ${m.waiting.length ? `<section class="waiting"><h2>Waiting on you</h2><ul>${m.waiting.map((s) => {
    const since = sinceTail(s.waiting);
    const what = since ? since.before : s.waiting;
    return `<li><span class="id">${esc(s.id)}</span> ${esc(what)}${since ? ` <span class="fig${s.waitingAge > WAIT_AMBER_DAYS ? " warn" : ""}">waiting ${days(s.waitingAge)}, since ${fmtShort(since.date)}</span>` : ""}</li>`;
  }).join("")}</ul></section>` : ""}

  <section>
    <h2>Milestones</h2>
    <div class="scroll"><table>
      <thead><tr><th>Milestone</th><th>Status</th><th class="num">Agreed</th><th class="num">Done / forecast</th><th class="num">Effort</th><th class="num">Cost</th></tr></thead>
      <tbody>${table}</tbody>
      <tfoot><tr><td colspan="4">Total${unallocated > 0 ? ` · ${money(unallocated)} of the contract not yet allocated to a milestone` : ""}</td><td class="num">${days(m.daysLogged)}<small>of ${days(m.estimateTotal)}</small></td><td class="num">${money(m.costTotal)}<small>of ${money(m.budgetTotal)}</small></td></tr></tfoot>
    </table></div>
  </section>

  <section>
    <h2>What we learned</h2>
    ${list(m.learned.map((s) => `<li><span class="id">${esc(s.id)}</span> <b>${esc(s.title)}</b>${s.done >= p.from && s.done <= p.to ? ` <span class="new">new</span>` : ""}<p>${esc(s.learned)}</p></li>`), "Lessons are recorded as each milestone closes; none has closed yet.")}
  </section>

  <footer>
    Generated ${fmtDate(generated)} from ${esc(source)}. Every status here is computed from dates and spend recorded in the plan;
    ${unverified
      ? "changes to the agreed dates, budgets and estimates are listed above as the team recorded them. This plan is not kept under version control, so a change made without a record cannot be detected."
      : "the agreed dates, budgets and estimates change only with a recorded reason, listed above when they do."}
  </footer>
</div>`;

  const style = `<style>
:root{--paper:#F4F6F5;--sheet:#FFFFFF;--ink:#17212B;--muted:#5A6672;--rule:#D5DCDF;--accent:#245E72;--accent-soft:#E2EDF0;--track:#ECF0F1;
--good:#2F7A4E;--good-soft:#E3F1E8;--warn:#A86B12;--warn-soft:#F7ECD8;--bad:#B0362C;--bad-soft:#F6E0DD;
--display:"Schibsted Grotesk","Helvetica Neue",Arial,sans-serif;--text:"Source Serif 4",Georgia,"Times New Roman",serif}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--paper:#10161B;--sheet:#161F26;--ink:#E3E8EB;--muted:#97A4AE;--rule:#2A353D;--accent:#7DB6CA;--accent-soft:#1B3441;--track:#1E2931;--good:#6CC08F;--good-soft:#16301F;--warn:#E3A84D;--warn-soft:#352711;--bad:#EE7D71;--bad-soft:#3B1C19}}
:root[data-theme="dark"]{--paper:#10161B;--sheet:#161F26;--ink:#E3E8EB;--muted:#97A4AE;--rule:#2A353D;--accent:#7DB6CA;--accent-soft:#1B3441;--track:#1E2931;--good:#6CC08F;--good-soft:#16301F;--warn:#E3A84D;--warn-soft:#352711;--bad:#EE7D71;--bad-soft:#3B1C19}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:400 1rem/1.55 var(--text);padding:clamp(16px,4vw,48px) max(16px,3vw)}
.sheet{max-width:62rem;margin:0 auto;background:var(--sheet);border:1px solid var(--rule);padding:clamp(20px,4vw,56px);display:grid;gap:2.75rem}
h1,h2,h3,.eyebrow,.k,.chip,.state,th,.id,.fig,.legend,footer,.banner,.new,.note{font-family:var(--display)}
h1{font-size:clamp(1.9rem,4.5vw,2.8rem);line-height:1.08;font-weight:700;letter-spacing:-.02em;margin:.2rem 0 .5rem;text-wrap:balance}
h2{font-size:1.25rem;font-weight:700;margin:0 0 1rem;letter-spacing:-.01em;padding-bottom:.5rem;border-bottom:2px solid var(--ink)}
h3{font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:0 0 .6rem;font-weight:600}
section{min-width:0}
.eyebrow{margin:0;font-size:.8rem;text-transform:uppercase;letter-spacing:.1em;color:var(--accent);font-weight:600}
.for{margin:0;color:var(--muted)}
.banner{margin:0;padding:.6rem .9rem;background:var(--warn-soft);color:var(--warn);font-weight:600;font-size:.85rem;letter-spacing:.02em}
.verdict{display:grid;grid-template-columns:minmax(9rem,auto) 1fr;gap:1.5rem;padding:1.4rem 1.5rem;background:var(--accent-soft);border-left:6px solid var(--tone)}
.verdict.good{--tone:var(--good);background:var(--good-soft)}.verdict.warn{--tone:var(--warn);background:var(--warn-soft)}.verdict.bad{--tone:var(--bad);background:var(--bad-soft)}
.state{font-size:1.5rem;font-weight:700;color:var(--tone);display:flex;align-items:center;gap:.6rem;white-space:nowrap}
.dot{width:.8rem;height:.8rem;border-radius:50%;background:var(--tone)}
.lede{margin:0;font-size:1.2rem;line-height:1.45}
.reasons{margin:.7rem 0 0;padding-left:1.1rem;color:var(--ink)}
.override{margin:.6rem 0 0;font-size:.95rem;color:var(--muted)}
.figures{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--rule);border-bottom:1px solid var(--rule)}
.fig-cell{display:grid;gap:.15rem;align-content:start;padding:1.1rem 1.1rem 1.2rem;border-left:1px solid var(--rule)}
.fig-cell:first-child{border-left:0;padding-left:0}
.k{font-size:.72rem;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);font-weight:600}
.v{font-family:var(--display);font-size:1.55rem;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:-.01em;line-height:1.2}
.s{font-size:.88rem;color:var(--muted)}
.s em{font-style:normal;font-weight:600}.s em.bad{color:var(--bad)}
.meter{position:relative;height:4px;background:var(--track);margin-top:.5rem}.meter i{display:block;height:100%;background:var(--accent)}
.meter b{position:absolute;top:-4px;bottom:-4px;width:2px;background:var(--ink);transform:translateX(-1px)}
.note{margin:-2rem 0 0;font-size:.78rem;color:var(--muted)}
.gantt{display:grid;border-top:1px solid var(--rule)}
.g-row{display:grid;grid-template-columns:minmax(10rem,15rem) 1fr;gap:1rem;align-items:center;border-bottom:1px solid var(--rule)}
.g-label{font-size:.92rem;line-height:1.3;padding:.55rem 0}
.g-track{position:relative;height:2.4rem}
.axis .g-track{height:1.6rem}.axis{border-bottom-color:var(--ink)}
.tick{position:absolute;bottom:.25rem;transform:translateX(-50%);font-size:.72rem;color:var(--muted);white-space:nowrap}
.tick::after{content:"";position:absolute;left:50%;bottom:-.3rem;height:.25rem;border-left:1px solid var(--muted)}
.tick.quiet::after{opacity:.4}
.guide{position:absolute;top:0;bottom:0;border-left:1.5px solid var(--accent)}
.guide.due{border-left:1.5px dashed var(--ink)}
.bar{position:absolute;top:50%;height:.55rem;transform:translateY(-50%)}
.bar.done{background:var(--muted)}.bar.active{background:var(--accent)}
.bar.ahead{height:0;border-top:2px dotted var(--accent)}
.slip{position:absolute;top:calc(50% + .6rem);height:2px;background:var(--warn)}
.mark{position:absolute;top:50%;width:.8rem;height:.8rem;transform:translate(-50%,-50%) rotate(45deg);background:var(--sheet);border:2px solid var(--ink)}
.mark.end{border:0;width:.72rem;height:.72rem}.mark.end.good{background:var(--good)}.mark.end.warn{background:var(--warn)}.mark.end.bad{background:var(--bad)}
.legend{display:flex;flex-wrap:wrap;gap:.5rem 1.4rem;font-size:.78rem;color:var(--muted);margin:.8rem 0 0}
.legend span{display:inline-flex;align-items:center;gap:.45rem}
.legend .mark{position:static;transform:rotate(45deg);display:inline-block}
.slip-key{display:inline-block;width:1.2rem;height:2px;background:var(--warn)}
.guide-key{display:inline-block;height:.9rem;border-left:1.5px solid var(--accent)}.guide-key.due{border-left:1.5px dashed var(--ink)}
.cols{display:grid;grid-template-columns:repeat(3,1fr);gap:1.5rem;margin-bottom:1.5rem}
ul{margin:0;padding:0;list-style:none;display:grid;gap:.55rem}
li{line-height:1.45}
.id{display:inline-block;font-size:.72rem;font-weight:700;letter-spacing:.04em;color:var(--accent);margin-right:.35rem;font-variant-numeric:tabular-nums}
.fig{font-size:.85rem;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}.fig.warn{color:var(--warn);font-weight:600}
.reason{color:var(--muted)}
.none{margin:0;color:var(--muted);font-style:italic}
.waiting ul li{padding:.7rem .9rem;background:var(--warn-soft)}
.scroll{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:.92rem;min-width:40rem}
th{font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:600;text-align:left;padding:.5rem .6rem;border-bottom:2px solid var(--ink)}
td{padding:.75rem .6rem;border-bottom:1px solid var(--rule);vertical-align:top}
td b{display:block;font-weight:600}
td small{display:block;color:var(--muted);font-size:.8rem;line-height:1.35;margin-top:.15rem}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
tfoot td{font-family:var(--display);font-weight:600;border-bottom:0;border-top:2px solid var(--ink)}
.chip{display:inline-block;font-size:.76rem;font-weight:600;padding:.2rem .55rem;white-space:nowrap}
.chip.good{background:var(--good-soft);color:var(--good)}.chip.warn{background:var(--warn-soft);color:var(--warn)}.chip.bad{background:var(--bad-soft);color:var(--bad)}
.new{font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--accent);border:1px solid currentColor;padding:0 .3rem;margin-left:.3rem;vertical-align:middle}
li p{margin:.3rem 0 0;max-width:65ch}
footer{font-size:.78rem;color:var(--muted);border-top:1px solid var(--rule);padding-top:1rem;line-height:1.5}
@media (max-width:760px){.figures{grid-template-columns:repeat(2,1fr)}.fig-cell:nth-child(3){border-left:0;padding-left:0}.fig-cell:nth-child(n+3){border-top:1px solid var(--rule)}
.cols{grid-template-columns:1fr}.verdict{grid-template-columns:1fr;gap:.6rem}.g-row{grid-template-columns:1fr;gap:0}.g-label{padding-bottom:0}.axis .g-label{display:none}}
@media print{:root,:root[data-theme="dark"]{--paper:#fff;--sheet:#fff;--ink:#17212B;--muted:#5A6672;--rule:#D5DCDF;--accent:#245E72;--accent-soft:#E2EDF0;--track:#ECF0F1;--good:#2F7A4E;--good-soft:#E3F1E8;--warn:#A86B12;--warn-soft:#F7ECD8;--bad:#B0362C;--bad-soft:#F6E0DD}
body{padding:0}.sheet{border:0;padding:0;max-width:none}section{break-inside:avoid}tr,.g-row{break-inside:avoid}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{size:A4;margin:16mm}}
</style>`;
  const fonts = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap">`;
  if (fragment) return `<title>${esc(title)}</title>\n${fonts}\n${style}\n${body}`;
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${esc(title)}</title>\n${fonts}\n${style}\n</head>\n<body>${body}\n</body>\n</html>\n`;
}

/* ── selftest ─────────────────────────────────────────────────────────────── */

const GOOD = `# Release plan

- **Project:** Client portal
- **For:** The board of Example Holdings
- **Currency:** ZAR
- **Contract value:** 300 000
- **Delivery date:** 2026-12-01
- **Day rate:** 3000
- **Baseline agreed:** 2026-08-01 — signed off by the board

## Milestones

### MS-01 · Sign-in works
- **Outcome:** Staff sign in with their work accounts.
- **Done when:** ten staff have signed in on the live site.
- **Estimate:** 10 days
- **Budget:** 30000
- **Baseline:** 2026-09-01
- **Forecast:** —
- **Started:** 2026-08-03
- **Done:** 2026-08-28
- **Evidence:** merged in abc1234, live-site walk recorded
- **Waiting on:** —
- **Learned:** Settling the account provider before building saved a rework.

### MS-02 · Bookings online
- **Outcome:** Clients book and pay online.
- **Done when:** a real paid booking reaches the calendar.
- **Estimate:** 20 days
- **Budget:** 60000
- **Baseline:** 2026-10-15
- **Forecast:** 2026-10-15
- **Started:** 2026-09-01
- **Done:** —
- **Evidence:** —
- **Waiting on:** Board — approve the cancellation policy wording, since 2026-09-02
- **Learned:** —

## Spend

| date | milestone | days | amount | note |
|---|---|---|---|---|
| 2026-08-15 | MS-01 | 5 | | build |
| 2026-08-28 | MS-01 | 4 | 12000 | build and release |
| 2026-09-10 | MS-02 | 3 | | first week |

## Changes
`;
const EVIDENCE = "Contract signed 2026-08-01 for R300 000 (source: signed SOW).";

if (process.argv.includes("--selftest")) {
  let failed = 0;
  const check = (label, ok, detail = "") => {
    if (!ok) failed++;
    console.log(`  ${ok ? "✓" : "✗"} ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  };
  const fire = (text, re, evidence = EVIDENCE) => checkPlan(parsePlan(text), { evidence }).some((f) => re.test(f));
  const quiet = (text, evidence = EVIDENCE) => checkPlan(parsePlan(text), { evidence });
  const edit = (from, to, text = GOOD) => {
    if (!text.includes(from)) throw new Error(`fixture anchor not found: ${from}`);
    return text.replace(from, to);
  };

  const g = quiet(GOOD);
  check("KNOWN-GOOD: a complete plan has no findings", g.length === 0, g.join(" | "));
  check("a plan with no milestones fires — a report on nothing reads as a clean one", fire(GOOD.split("## Milestones")[0] + "## Milestones\n", /no milestones/));
  check("a missing currency fires", fire(edit("- **Currency:** ZAR\n", ""), /Currency/));
  check("an unknown currency code fires", fire(edit("ZAR", "ZZZZ"), /Currency/));
  check("a done milestone with no Learned line fires", fire(edit("- **Learned:** Settling the account provider before building saved a rework.", "- **Learned:** —"), /MS-01: done with no `\*\*Learned/));
  check("a done milestone with no Evidence fires", fire(edit("- **Evidence:** merged in abc1234, live-site walk recorded", "- **Evidence:** —"), /MS-01: done with no `\*\*Evidence/));
  check("done with no Started date fires", fire(edit("- **Started:** 2026-08-03", "- **Started:** —"), /no `\*\*Started/));
  check("a misspelt field fires rather than vanishing", fire(edit("- **Budget:** 30000", "- **Budgte:** 30000"), /Budgte/));
  check("a duplicated id fires", fire(edit("### MS-02 · Bookings online", "### MS-01 · Bookings online"), /appears twice/));
  check("a not-done milestone with no forecast fires", fire(edit("- **Forecast:** 2026-10-15", "- **Forecast:** —"), /MS-02: not done/));
  check("spend against an unknown milestone fires", fire(edit("| 2026-09-10 | MS-02 |", "| 2026-09-10 | MS-09 |"), /MS-09/));
  check("spend with no amount and no day rate fires", fire(edit("- **Day rate:** 3000\n", ""), /no `\*\*Day rate/));
  check("budgets above the contract value fire", fire(edit("- **Budget:** 60000", "- **Budget:** 290000"), /more than the contract/));
  check("a milestone agreed after the delivery date fires", fire(edit("- **Baseline:** 2026-10-15", "- **Baseline:** 2026-12-15"), /late on the day it is agreed/));
  check("a contract value EVIDENCE.md does not carry fires", fire(GOOD, /not in brief\/EVIDENCE/, "Contract signed for R250 000."));
  check("KNOWN-GOOD: the figure is found however its thousands are separated (R300 000 vs 300,000)", quiet(GOOD, "Contract: 300,000").length === 0);
  check("no EVIDENCE.md at all fires", fire(GOOD, /EVIDENCE.md is missing/, null));
  check("a lesson id in a Learned line fires — it is shown to the payer",
    fire(edit("saved a rework.", "saved a rework, per L-42."), /carries a lesson id/));
  check("a file path in an Outcome fires", fire(edit("Staff sign in with their work accounts.", "Staff sign in via lib/auth.ts."), /carries a file path/));
  check("KNOWN-GOOD: a SHA in Evidence is fine — Evidence is never rendered", !quiet(GOOD).some((f) => /SHA/.test(f)));
  check("a malformed change line fires", fire(GOOD + "- **Changed:** moved MS-02 because\n", /a change reads/));
  check("a change with no reason fires", fire(GOOD + "- **Changed:** 2026-09-05 · MS-02 baseline 2026-10-15 → 2026-10-20 — \n", /without a reason/));
  check("an override with no reason fires", fire(edit("- **Baseline agreed:**", "- **RAG override:** green\n- **Baseline agreed:**"), /RAG override/));

  // History: the baseline moves only on record.
  const moved = edit("- **Baseline:** 2026-10-15", "- **Baseline:** 2026-10-29");
  const why = "- **Changed:** 2026-09-05 · MS-02 baseline 2026-10-15 → 2026-10-29 — the payment provider's onboarding took two weeks; agreed with the board on 2026-09-05\n";
  const H = (...texts) => historyFindings(texts.map((text, i) => ({ label: `v${i}`, text })));
  check("a baseline moved with no recorded reason fires", H(GOOD, moved).some((f) => /MS-02 baseline moved 2026-10-15 → 2026-10-29 with no recorded reason/.test(f)));
  check("KNOWN-GOOD: the same move with its Changed line is quiet", H(GOOD, moved + why).length === 0, H(GOOD, moved + why).join(" | "));
  check("a move recorded LATE (in a later version) is accepted — an old finding must be fixable today", H(GOOD, moved, moved + why).length === 0);
  check("a Changed line later deleted fires — the log is append-only", H(GOOD, moved + why, moved).some((f) => /append-only/.test(f)));
  const extra = GOOD.replace("## Spend", "### MS-03 · Reports\n- **Outcome:** o\n- **Done when:** d\n- **Estimate:** 5 days\n- **Budget:** 10000\n- **Baseline:** 2026-11-20\n- **Forecast:** 2026-11-20\n\n## Spend");
  check("a milestone added after agreement fires — it is scope change", H(GOOD, extra).some((f) => /MS-03 was added/.test(f)));
  check("KNOWN-GOOD: an addition with `added` recorded is quiet", H(GOOD, extra + "- **Changed:** 2026-09-06 · MS-03 added — the board asked for monthly reports\n").length === 0);
  check("a milestone removed silently fires", H(extra.replace("- **Baseline agreed:** 2026-08-01 — signed off by the board", "- **Baseline agreed:** 2026-08-01"), GOOD).some((f) => /MS-03 was removed/.test(f)));
  check("an estimate raised silently fires — it would hide an overrun", H(GOOD, edit("- **Estimate:** 20 days", "- **Estimate:** 30 days")).some((f) => /estimate moved 20 → 30/.test(f)));
  check("the delivery date moved silently fires", H(GOOD, edit("- **Delivery date:** 2026-12-01", "- **Delivery date:** 2027-01-15")).some((f) => /delivery date moved/.test(f)));
  const draft = edit("- **Baseline agreed:** 2026-08-01 — signed off by the board\n", "");
  check("KNOWN-GOOD: a draft moves freely", H(draft, draft.replace("2026-10-15\n- **Forecast", "2026-11-01\n- **Forecast")).length === 0);
  check("an agreed plan turned back into a draft fires", H(GOOD, draft).some((f) => /draft again/.test(f)));

  // Compute: status is derived, as of a date.
  const P = parsePlan(GOOD);
  const at = (asof, from = "2026-08-01", to = asof) => compute(P, { asof, from, to, label: "t" });
  const a = at("2026-09-15");
  check("KNOWN-GOOD: on plan, the verdict is green with no reasons", a.rag.computed === "green" && a.rag.reasons.length === 0, JSON.stringify(a.rag));
  const late = at("2026-10-20");
  check("a milestone past its forecast is red, and the reason names it", late.rag.computed === "red" && late.rag.reasons.some((r) => /MS-02 .* past its forecast/.test(r)), JSON.stringify(late.rag));
  const slipped = compute(parsePlan(edit("- **Forecast:** 2026-10-15", "- **Forecast:** 2026-10-25")), { asof: "2026-09-15", from: "2026-09-01", to: "2026-09-15", label: "t" });
  check("a forecast after the agreed date is amber", slipped.rag.computed === "amber" && slipped.rag.reasons.some((r) => /10 days after its agreed date/.test(r)));
  check("a wait older than the threshold is amber", at("2026-09-30").rag.reasons.some((r) => /waited on you for 28 days/.test(r)));
  const overrun = parsePlan(GOOD.replace("| 2026-09-10 | MS-02 | 3 | |", "| 2026-09-10 | MS-02 | 21 | |"));
  check("an unfinished milestone past its estimate is amber", compute(overrun, { asof: "2026-09-15", from: "2026-09-01", to: "2026-09-15", label: "t" }).rag.reasons.some((r) => /MS-02 has taken more days/.test(r)));
  const doneOver = parsePlan(GOOD.replace("| 2026-08-28 | MS-01 | 4 | 12000 |", "| 2026-08-28 | MS-01 | 9 | 12000 |"));
  check("KNOWN-GOOD: a FINISHED milestone's effort overrun is history, not risk — the table shows it",
    !compute(doneOver, { asof: "2026-09-15", from: "2026-09-01", to: "2026-09-15", label: "t" }).rag.reasons.some((r) => /MS-01 has taken/.test(r)));
  // CF-5's rewrite made every parsing regex linear. What it must not break, as pleks listed it and as
  // the non-breaking-space removal before it relied on.
  {
    const p = parsePlan("## Milestones\n\n### MS-01 · Sign-in\n- **Learned:**\n-  **Outcome:**   staff sign in  \n\n## Changes\n\n" +
      "- **Changed:** 2026-09-05\u00a0·\u00a0MS-01 baseline 2026-09-01 → 2026-09-15 — the provider — slow — agreed with the board\n");
    const c = p.changes[0] ?? {};
    check("an EMPTY field value parses as empty, not as a missing field", p.milestones[0]?.f.learned === "");
    check("a field's value is trimmed however it is spaced", p.milestones[0]?.f.outcome === "staff sign in");
    check("a change line parses across non-breaking spaces, and its reason keeps its own em dashes",
      !c.bad && c.from === "2026-09-01" && c.to === "2026-09-15" && c.reason === "the provider — slow — agreed with the board", JSON.stringify(c));
    const t = sinceTail("Clinic — the 2019 export ,  since 2026-08-20 ");
    check("`since DATE` is split off the end with its comma, and nothing else is taken", t?.date === "2026-08-20" && t.before === "Clinic — the 2019 export ", JSON.stringify(t));
    check("KNOWN-GOOD: a waiting line with no date has no tail", sinceTail("the signed SOW") === null);
  }
  const early = at("2026-08-20");
  check("facts after the as-of date are not facts yet: MS-01 is not done on 2026-08-20", early.milestones[0].state === "active" && early.earned === 0);
  check("delivered value is 0/100 — an in-progress milestone earns nothing", a.earned === 30000 && a.planned === 30000);
  check("spend without an amount is costed at the day rate", a.costTotal === 5 * 3000 + 12000 + 3 * 3000, String(a.costTotal));
  const sep = compute(P, { asof: "2026-09-30", from: "2026-09-01", to: "2026-09-30", label: "September" });
  check("a period counts only its own spend, while the totals run to date", sep.period.cost === 9000 && sep.costTotal === 36000, `${sep.period.cost} / ${sep.costTotal}`);
  const ov = compute(parsePlan(edit("- **Baseline agreed:**", "- **RAG override:** green — the board moved the date informally; awaiting the written change\n- **Baseline agreed:**")), { asof: "2026-10-20", from: "2026-10-01", to: "2026-10-20", label: "t" });
  check("an override is shown alongside what the measures say", ov.rag.shown === "green" && ov.rag.computed === "red" && renderHtml(ov, { source: "x", generated: "2026-10-20" }).includes("Our own measures read <b>off track</b>"));

  // Period resolution.
  const r1 = resolvePeriod({ month: "2026-09" }, "2026-11-02", P);
  check("--month resolves to the calendar month, and a past month is positioned at its end", r1.from === "2026-09-01" && r1.to === "2026-09-30" && r1.asof === "2026-09-30");
  const r2 = resolvePeriod({ month: "2026-11" }, "2026-11-02", P);
  check("the current month is positioned at today, not at a future month end", r2.asof === "2026-11-02");
  check("--quarter resolves", resolvePeriod({ quarter: "2026-Q3" }, "2026-11-02", P).to === "2026-09-30");
  check("a malformed period is refused, not guessed", !!resolvePeriod({ month: "Sept" }, "2026-11-02", P).error);
  check("to date starts at the earliest dated fact", resolvePeriod({}, "2026-11-02", P).from === "2026-08-01");

  // Render.
  const hostile = compute(parsePlan(edit("### MS-02 · Bookings online", "### MS-02 · Bookings <script>alert(1)</script>")), { asof: "2026-09-15", from: "2026-09-01", to: "2026-09-15", label: "t" });
  const html = renderHtml(hostile, { source: "commit abc1234", generated: "2026-09-15" });
  check("text from the plan is escaped", !html.includes("<script>alert") && html.includes("&lt;script&gt;"));
  check("money is shown in the plan's currency", /R\s?300\s?000/.test(html));
  check("a standalone report is a whole document; a fragment is not", html.startsWith("<!doctype html>") && !renderHtml(hostile, { source: "x", generated: "2026-09-15", fragment: true }).includes("<!doctype"));
  check("a draft plan is stamped DRAFT", renderHtml(compute(parsePlan(draft), { asof: "2026-09-15", from: "2026-09-01", to: "2026-09-15", label: "t" }), { source: "x", generated: "2026-09-15" }).includes("DRAFT PLAN"));

  // THE SEAM, live: a real repository, a real commit, the CLI as a project gate runs it.
  const dir = mkdtempSync(join(tmpdir(), "delivery-"));
  try {
    const git = (...args) => spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
    if (git("init", "-q").status !== 0) {
      check("git is available for the history probe", false, "git init failed — the baseline rule could not be probed");
    } else {
      git("config", "user.email", "probe@example.invalid");
      git("config", "user.name", "probe");
      mkdirSync(join(dir, "brief", "build"), { recursive: true });
      writeFileSync(join(dir, EVIDENCE_PATH), EVIDENCE);
      writeFileSync(join(dir, PLAN_PATH), GOOD);
      git("add", "-A");
      // A commit can fail on a machine whose git config demands signing. That is reported, never
      // bypassed — and the probes below would then be measuring an uncommitted tree.
      const first = git("commit", "-qm", "agreed plan");
      if (first.status !== 0) throw new Error(`git commit failed in the probe repo: ${(first.stderr || "").trim().split("\n")[0]}`);
      const run = (...a) => spawnSync(process.execPath, [fileURLToPath(import.meta.url), dir, "--today", "2026-09-15", ...a], { encoding: "utf8" });
      const clean = run("--check");
      check("KNOWN-GOOD: --check passes a committed, agreed plan", clean.status === 0, clean.stdout + clean.stderr);
      writeFileSync(join(dir, PLAN_PATH), moved);
      const silent = run("--check");
      check("--check fails an uncommitted baseline move with no reason — before the commit, not after", silent.status === 1 && /no recorded reason/.test(silent.stdout));
      writeFileSync(join(dir, PLAN_PATH), moved + why);
      check("KNOWN-GOOD: --check passes once the reason is recorded", run("--check").status === 0);
      const refused = run("--html", "--out", join(dir, "r.html"));
      check("--html refuses to build from uncommitted changes", refused.status === 1 && !existsSync(join(dir, "r.html")));
      const prev = run("--html", "--preview", "--out", join(dir, "r.html"));
      check("--html --preview builds it, stamped PREVIEW", prev.status === 0 && readFileSync(join(dir, "r.html"), "utf8").includes("PREVIEW"));
      git("add", "-A");
      if (git("commit", "-qm", "rebaselined MS-02").status !== 0) throw new Error("git commit failed in the probe repo");
      const real = run("--html", "--out", join(dir, "r.html"));
      const out = readFileSync(join(dir, "r.html"), "utf8");
      check("--html from a committed plan writes the report, unstamped, naming its commit", real.status === 0 && !out.includes("PREVIEW") && /from the plan as committed in [0-9a-f]{7}/.test(out), real.stderr);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  // CF-4, live. Every arm where the plan has no history must SAY so, and the one where it lives in
  // another repository must read that repository's.
  const tmp = [];
  try {
    const repo = (name, { init = true } = {}) => {
      const d = mkdtempSync(join(tmpdir(), `delivery-${name}-`));
      tmp.push(d);
      const g = (...args) => spawnSync("git", ["-C", d, ...args], { encoding: "utf8" });
      if (init) {
        g("init", "-q");
        g("config", "user.email", "probe@example.invalid");
        g("config", "user.name", "probe");
      }
      const commit = (msg) => {
        g("add", "-A");
        const c = g("commit", "-qm", msg);
        if (c.status !== 0) throw new Error(`git commit failed in the probe repo: ${(c.stderr || "").trim().split("\n")[0]}`);
      };
      return { d, g, commit };
    };
    const plant = (d, text) => {
      mkdirSync(join(d, "brief", "build"), { recursive: true });
      writeFileSync(join(d, EVIDENCE_PATH), EVIDENCE);
      writeFileSync(join(d, PLAN_PATH), text);
    };
    const cli = (d, ...a) => spawnSync(process.execPath, [fileURLToPath(import.meta.url), d, "--today", "2026-09-15", ...a], { encoding: "utf8" });

    // pleks's reproduction: brief/ ignored, an undeclared baseline move.
    const ig = repo("ignored");
    writeFileSync(join(ig.d, ".gitignore"), "brief/\n");
    writeFileSync(join(ig.d, "README.md"), "x\n");
    ig.commit("project");
    plant(ig.d, moved);
    const igc = cli(ig.d, "--check");
    check("an IGNORED plan says its history was NOT checked — not `1 version(s) read`",
      igc.status === 0 && /⊘ the plan is ignored by git — the baseline's history was NOT checked/.test(igc.stdout) && !/version\(s\) read/.test(igc.stdout), igc.stdout + igc.stderr);
    const igh = cli(ig.d, "--html", "--out", join(ig.d, "r.html"));
    const igp = existsSync(join(ig.d, "r.html")) ? readFileSync(join(ig.d, "r.html"), "utf8") : "";
    check("the payer's page from an untracked plan says a change without a record cannot be detected — and drops the claim that none can happen",
      igh.status === 0 && /cannot be detected/.test(igp) && !/change only with a recorded reason/.test(igp) && !igp.includes("PREVIEW"), igh.stderr);
    check("a past period from an untracked plan is refused — there is no record of it as it stood",
      cli(ig.d, "--html", "--month", "2026-08", "--out", join(ig.d, "p.html")).status === 1);

    const un = repo("untracked");
    writeFileSync(join(un.d, "README.md"), "x\n");
    un.commit("project");
    plant(un.d, GOOD);
    check("an untracked plan, not ignored, is named as such", /the plan is not tracked by git/.test(planVersions(un.d).note ?? ""));
    un.g("add", "-A");
    const staged = planVersions(un.d);
    check("KNOWN-GOOD: a plan staged for its first commit is tracked — no history yet, and nothing to report", !staged.untracked && !staged.note && staged.dirty === true);

    const loose = repo("loose", { init: false });
    plant(loose.d, GOOD);
    check("a plan in no repository at all is named as such", /the plan is not in a git repository/.test(planVersions(loose.d).note ?? ""));

    // A public project, its plan in a private repository, reached through a link.
    const priv = repo("private");
    plant(priv.d, GOOD);
    priv.commit("agreed plan");
    writeFileSync(join(priv.d, PLAN_PATH), moved);
    priv.commit("moved MS-02, no reason");
    const pub = repo("public");
    writeFileSync(join(pub.d, "README.md"), "x\n");
    pub.commit("project");
    const via = planVersions(pub.d, join(priv.d, PLAN_PATH));
    check("the history is read from the repository that TRACKS the plan, not the project's",
      !via.untracked && via.versions.length === 2 && historyFindings(via.versions).some((f) => /no recorded reason/.test(f)), JSON.stringify(via.note ?? via.versions.length));
    // "junction" is a directory link on Windows that needs no privilege; elsewhere the type is ignored.
    symlinkSync(join(priv.d, "brief"), join(pub.d, "brief"), "junction");
    const linked = cli(pub.d, "--check");
    check("…and through a linked brief/, the CLI catches the private repository's unrecorded move", linked.status === 1 && /no recorded reason/.test(linked.stdout), linked.stdout + linked.stderr);
  } finally {
    for (const d of tmp) rmSync(d, { recursive: true, force: true });
  }

  console.log(failed ? `\n❌ ${failed} fixture(s) wrong` : "\n✅ delivery-report fixtures green — fires and stays quiet");
  process.exit(failed ? 1 : 0);
}

/* ── run ──────────────────────────────────────────────────────────────────── */

const VALUED = new Set(["--month", "--quarter", "--since", "--from", "--to", "--out", "--today"]);
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const val = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};
const positional = argv.filter((a, i) => !a.startsWith("--") && !VALUED.has(argv[i - 1]));
const root = resolve(positional[0] ?? ".");
// --today pins the clock, so a report can be regenerated byte for byte and a probe does not depend
// on the day it runs.
const today = val("--today") ?? new Date().toISOString().slice(0, 10);

if (!flag("--check") && !flag("--html") && !flag("--json")) {
  console.error("usage: delivery-report.mjs [dir] --check | --html [--month YYYY-MM | --quarter YYYY-Qn | --since D | --from D --to D] [--out file] [--preview] | --json | --selftest");
  process.exit(2);
}

const planFile = join(root, PLAN_PATH);
if (!existsSync(planFile)) {
  // BRIEF-STANDARD §3.1: an absent band reads as never applicable. A report is refused, not blank.
  if (flag("--check")) {
    console.log(`⊘ delivery-report: no ${PLAN_PATH} — this project has no payer-facing plan, so there is nothing to check`);
    process.exit(0);
  }
  console.error(`❌ no ${PLAN_PATH} — a report needs a plan; DELIVERY-STANDARD §2 shows its shape`);
  process.exit(1);
}

const hist = planVersions(root);
if (hist.error) {
  console.error(`❌ delivery-report: ${hist.error} — the baseline's history could not be read, so the plan is NOT checked`);
  process.exit(1);
}
const current = parsePlan(readFileSync(planFile, "utf8"));
const evidence = existsSync(join(root, EVIDENCE_PATH)) ? readFileSync(join(root, EVIDENCE_PATH), "utf8") : null;
const findings = [...checkPlan(current, { evidence }), ...historyFindings(hist.versions)];

if (flag("--check")) {
  if (hist.note) console.log(`⊘ ${hist.note}`);
  if (findings.length) {
    console.log(`❌ delivery-report: ${findings.length} finding(s) in ${PLAN_PATH}\n`);
    for (const f of findings) console.log(`  ${f}`);
    process.exit(1);
  }
  const done = current.milestones.filter((m) => !blank(m.f.done)).length;
  console.log(`✅ delivery-report: ${current.milestones.length} milestones (${done} done), ${current.spend.length} spend rows, ${current.changes.length} recorded changes · ${blank(current.header["baseline agreed"]) ? "DRAFT — not yet agreed" : `agreed ${current.header["baseline agreed"].slice(0, 10)}`} · ${hist.untracked ? "history: NOT checked" : `history: ${hist.versions.length} version(s) read`}`);
  process.exit(0);
}

if (findings.length) {
  console.error(`❌ the plan has ${findings.length} finding(s); a report is not built from a plan the gate rejects. Run --check.`);
  process.exit(1);
}
const period = resolvePeriod({ month: val("--month"), quarter: val("--quarter"), since: val("--since"), from: val("--from"), to: val("--to") }, today, current);
if (period.error) {
  console.error(`❌ ${period.error}`);
  process.exit(2);
}

// A past period reads the plan as it was committed at the period's end — September's report is the
// same document in December. The present reads the tree, which must be committed unless --preview.
let source;
let planForReport = current;
const preview = flag("--preview");
if (period.asof < today) {
  const then = hist.versions.filter((v) => v.date && v.date <= period.asof).at(-1);
  if (!then) {
    console.error(hist.untracked
      ? `❌ ${hist.note.split(" — ")[0]}, so there is no record of it as it stood on ${period.asof} — a past period can only be read from a commit`
      : `❌ the plan was not yet committed on ${period.asof}, so there is no position to report for that date`);
    process.exit(1);
  }
  planForReport = parsePlan(then.text);
  source = `the plan as committed in ${then.label} (${fmtDate(then.date)})`;
} else if (hist.dirty && !hist.untracked) {
  if (!preview) {
    console.error("❌ the plan has uncommitted changes — a report you send must be reproducible from a commit. Commit, or pass --preview for a copy stamped PREVIEW.");
    process.exit(1);
  }
  source = "uncommitted changes to the plan";
} else {
  const head = hist.versions.at(-1);
  source = head.sha ? `the plan as committed in ${head.label}` : "the plan (not under version control)";
}

const model = compute(planForReport, period);
if (flag("--json")) {
  console.log(JSON.stringify({ ...model, source, historyChecked: !hist.untracked }, null, 2));
  process.exit(0);
}
const out = resolve(val("--out") ?? `delivery-report-${period.to}.html`);
writeFileSync(out, renderHtml(model, { source, preview: preview && hist.dirty && !hist.untracked, fragment: flag("--fragment"), generated: today, unverified: !!hist.untracked }));
console.log(`✅ wrote ${relative(process.cwd(), out) || out} — ${period.label}, position as of ${period.asof}, ${RAG_WORD[model.rag.shown].toLowerCase()}`);
