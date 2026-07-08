// scripts/test-report.mjs — run the vitest suites and write a self-contained HTML dashboard to test/reports/.
//
// Usage:   npm run test:report
// Runs:    the UNIT suite (vitest run) + the DB-INTEGRATION suite (test/db, vitest.db.config.ts) and MERGES
//          both into one dashboard (test/db lands in its own category). The DB suite needs the local Supabase
//          stack — if Docker isn't running the script PROMPTS to start it (npx supabase start), skips the DB
//          suite, and marks it "SKIPPED (Docker down)" in the report (so the report is still generated).
// Output:  test/reports/report-<YYYY-MM-DD-HH-MM-SS>.html  (keeps the newest 3, prunes older)
// Notes:   The report is generated even when tests FAIL (the whole point is to see what broke); the script
//          exits with the worse of the two suites' codes afterwards. test/reports/ is gitignored (build
//          artifacts). No deps beyond vitest's JSON reporter + Node stdlib; the HTML embeds all CSS/JS/data.

import { execSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const REPORT_DIR = resolve(ROOT, "test", "reports")
const UNIT_JSON = resolve(REPORT_DIR, ".unit.json")
const DB_JSON = resolve(REPORT_DIR, ".db.json")
const KEEP = 3

mkdirSync(REPORT_DIR, { recursive: true })

// ── 1. Run the unit suite + (if Docker is up) the DB-integration suite → merged JSON ─────────────────────
/** Run one vitest config → { code, json }. Keeps going on failure so the report still generates. */
function runSuite(extraArgs, outFile) {
  let code = 0
  try {
    execSync(`npx vitest run ${extraArgs} --reporter=default --reporter=json --outputFile.json="${outFile}"`, {
      cwd: ROOT, stdio: ["ignore", "inherit", "inherit"],
    })
  } catch (e) {
    code = typeof e.status === "number" ? e.status : 1
  }
  return { code, json: existsSync(outFile) ? JSON.parse(readFileSync(outFile, "utf8")) : null }
}

/** Is the local Supabase (Docker) stack up? The DB-integration suite (test/db) needs it. */
function dockerUp() {
  try {
    return execSync('docker ps --filter name=supabase_db --format "{{.Names}}"', { cwd: ROOT }).toString().trim().length > 0
  } catch {
    return false
  }
}

console.log("▶ Unit suite…\n")
const unit = runSuite("", UNIT_JSON)
if (!unit.json) {
  console.error("\n✗ test:report — the unit suite produced no JSON. No report generated.")
  process.exit(unit.code || 1)
}

let db = { code: 0, json: null }
let dbSkipped = false
if (dockerUp()) {
  console.log("\n▶ DB-integration suite (test/db, local Supabase)…\n")
  db = runSuite("--config vitest.db.config.ts", DB_JSON)
} else {
  dbSkipped = true
  console.warn("\n⚠  Local Supabase (Docker) is NOT running — the DB-integration suite (test/db) was SKIPPED.")
  console.warn("   Start it with:  npx supabase start   then re-run:  npm run test:report   for the full report.\n")
}

// Merge the two suites into one dataset (test/db files land in the "test/db" category by path).
const data = {
  numTotalTests: (unit.json.numTotalTests || 0) + (db.json?.numTotalTests || 0),
  numPassedTests: (unit.json.numPassedTests || 0) + (db.json?.numPassedTests || 0),
  numFailedTests: (unit.json.numFailedTests || 0) + (db.json?.numFailedTests || 0),
  numPendingTests: (unit.json.numPendingTests || 0) + (db.json?.numPendingTests || 0),
  numTodoTests: (unit.json.numTodoTests || 0) + (db.json?.numTodoTests || 0),
  testResults: [...(unit.json.testResults || []), ...(db.json?.testResults || [])],
}
const vitestCode = unit.code || db.code

// ── 2. Shape the data: category → file → tests ──────────────────────────────────────────────────────────
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
const ms = (n) => (n == null ? "—" : n < 1000 ? `${Math.round(n)} ms` : `${(n / 1000).toFixed(2)} s`)
const rel = (p) => p.replace(/^.*?pleks[\\/]/i, "").replace(/\\/g, "/")
const catOf = (r) => {
  const parts = r.split("/")
  if (parts[0] === "app" || parts[0] === "lib") return parts.slice(0, 2).join("/")
  if (parts[0] === "test") return "test/" + (parts[1] || "")
  return parts[0]
}

const cats = new Map()
let totalDur = 0
for (const f of data.testResults) {
  const r = rel(f.name)
  const cat = catOf(r)
  const fileDur = (f.endTime && f.startTime) ? f.endTime - f.startTime : f.assertionResults.reduce((a, t) => a + (t.duration || 0), 0)
  totalDur += fileDur
  const tests = f.assertionResults.map((t) => ({
    title: t.title,
    suite: (t.ancestorTitles || []).join(" › "),
    status: t.status,
    duration: t.duration || 0,
    fail: (t.failureMessages || []).join("\n\n"),
  }))
  const passed = tests.filter((t) => t.status === "passed").length
  const failed = tests.filter((t) => t.status === "failed").length
  const file = { name: r, base: r.split("/").pop(), dir: r.split("/").slice(0, -1).join("/"), dur: fileDur, tests, total: tests.length, passed, failed, skipped: tests.length - passed - failed }
  if (!cats.has(cat)) cats.set(cat, { name: cat, files: [], dur: 0 })
  const c = cats.get(cat)
  c.files.push(file); c.dur += fileDur
}
const catList = [...cats.values()].map((c) => {
  const all = c.files.flatMap((f) => f.tests)
  c.total = all.length
  c.passed = all.filter((t) => t.status === "passed").length
  c.failed = all.filter((t) => t.status === "failed").length
  c.skipped = c.total - c.passed - c.failed
  c.files.sort((a, b) => (b.failed - a.failed) || (b.total - a.total))
  return c
}).sort((a, b) => (b.failed - a.failed) || (b.total - a.total) || a.name.localeCompare(b.name))

const S = {
  total: data.numTotalTests, passed: data.numPassedTests, failed: data.numFailedTests,
  skipped: (data.numPendingTests || 0) + (data.numTodoTests || 0), files: data.testResults.length,
}
const rate = S.total ? (S.passed / S.total) * 100 : 0
const allGreen = S.failed === 0

const git = (cmd, fallback = "") => { try { return execSync(cmd, { cwd: ROOT }).toString().trim() } catch { return fallback } }
const META = {
  branch: git("git branch --show-current"),
  commit: git("git rev-parse --short HEAD"),
  when: new Date().toISOString().slice(0, 16).replace("T", " "),
  cmd: "npm run test:report",
  suites: dbSkipped ? "unit only — DB-integration SKIPPED (Docker down)" : "unit + DB-integration (test/db)",
  dbSkipped,
}

// ── 3. Render ───────────────────────────────────────────────────────────────────────────────────────────
const bar = (p, f, s, t) => {
  const w = (n) => (t ? (n / t) * 100 : 0)
  return `<div class="bar" role="img" aria-label="${p} passed, ${f} failed, ${s} skipped of ${t}">${p ? `<span class="seg pass" style="width:${w(p)}%"></span>` : ""}${f ? `<span class="seg fail" style="width:${w(f)}%"></span>` : ""}${s ? `<span class="seg skip" style="width:${w(s)}%"></span>` : ""}</div>`
}
const chip = (n, kind) => (n ? `<span class="chip ${kind}"><b>${n}</b> ${kind}</span>` : "")
const dot = (st) => `<span class="dot ${st === "passed" ? "pass" : st === "failed" ? "fail" : "skip"}" title="${st}"></span>`
const testRow = (t) => `<div class="test ${t.status}" data-status="${t.status === "failed" ? "failed" : t.status === "passed" ? "passed" : "skipped"}" data-name="${esc((t.suite + " " + t.title).toLowerCase())}">${dot(t.status)}<span class="tname">${esc(t.title)}</span><span class="tdur">${ms(t.duration)}</span>${t.fail ? `<pre class="fail-msg">${esc(t.fail)}</pre>` : ""}</div>`
const fileBlock = (f) => {
  const bySuite = new Map()
  for (const t of f.tests) { const k = t.suite || ""; if (!bySuite.has(k)) bySuite.set(k, []); bySuite.get(k).push(t) }
  const suites = [...bySuite.entries()].map(([name, tests]) => `${name ? `<div class="suite">${esc(name)}</div>` : ""}${tests.map(testRow).join("")}`).join("")
  return `<details class="file${f.failed ? " has-fail" : ""}"${f.failed ? " open" : ""}><summary><span class="caret" aria-hidden="true"></span><span class="fbase">${esc(f.base)}</span><span class="fdir">${esc(f.dir)}</span><span class="counts">${chip(f.failed, "fail")}${chip(f.skipped, "skip")}<span class="tnum">${f.passed}/${f.total}</span></span><span class="fdur">${ms(f.dur)}</span></summary><div class="tests">${suites}</div></details>`
}
const catBlock = (c) => `<section class="cat${c.failed ? " has-fail" : ""}" data-name="${esc(c.name.toLowerCase())}"><details${c.failed ? " open" : ""}><summary><span class="caret" aria-hidden="true"></span><span class="cname">${esc(c.name)}</span><span class="cmeta">${c.files.length} file${c.files.length === 1 ? "" : "s"}</span>${bar(c.passed, c.failed, c.skipped, c.total)}<span class="counts">${chip(c.failed, "fail")}${chip(c.skipped, "skip")}<span class="tnum">${c.passed}/${c.total}</span></span><span class="fdur">${ms(c.dur)}</span></summary><div class="files">${c.files.map(fileBlock).join("")}</div></details></section>`
const stat = (label, value, kind = "") => `<div class="stat ${kind}"><div class="sv">${value}</div><div class="sl">${label}</div></div>`

const html = `<title>Pleks — Test Report</title>
<style>
:root{--ground:#faf9f7;--panel:#fff;--panel-2:#f5f3ef;--ink:#201c14;--muted:#6f675b;--faint:#938a7c;--line:#e7e2d9;--line-strong:#d8d2c6;--accent:#d97706;--accent-ink:#8a4b04;--pass:#16a34a;--pass-bg:#eaf6ee;--fail:#dc2626;--fail-bg:#fbeceb;--skip:#9ca3af;--skip-bg:#f0eeea}
@media (prefers-color-scheme:dark){:root{--ground:#17150f;--panel:#201d16;--panel-2:#262219;--ink:#f2ede2;--muted:#a99f8d;--faint:#7c7364;--line:#332e24;--line-strong:#413a2c;--accent:#f0a83c;--accent-ink:#f5c477;--pass:#4ade80;--pass-bg:#14251a;--fail:#f87171;--fail-bg:#2a1715;--skip:#8b8375;--skip-bg:#25211a}}
:root[data-theme="light"]{--ground:#faf9f7;--panel:#fff;--panel-2:#f5f3ef;--ink:#201c14;--muted:#6f675b;--faint:#938a7c;--line:#e7e2d9;--line-strong:#d8d2c6;--accent:#d97706;--accent-ink:#8a4b04;--pass:#16a34a;--pass-bg:#eaf6ee;--fail:#dc2626;--fail-bg:#fbeceb;--skip:#9ca3af;--skip-bg:#f0eeea}
:root[data-theme="dark"]{--ground:#17150f;--panel:#201d16;--panel-2:#262219;--ink:#f2ede2;--muted:#a99f8d;--faint:#7c7364;--line:#332e24;--line-strong:#413a2c;--accent:#f0a83c;--accent-ink:#f5c477;--pass:#4ade80;--pass-bg:#14251a;--fail:#f87171;--fail-bg:#2a1715;--skip:#8b8375;--skip-bg:#25211a}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased}
.mono{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace}
.tnum,.sv,.tdur,.fdur,.chip b{font-variant-numeric:tabular-nums}
.wrap{max-width:1080px;margin:0 auto;padding:32px 24px 96px}
.head{display:flex;flex-wrap:wrap;align-items:flex-start;gap:16px;justify-content:space-between;margin-bottom:24px}
.title{font-size:20px;font-weight:650;letter-spacing:-.01em;margin:0}.title .k{color:var(--accent)}
.meta{margin-top:6px;color:var(--muted);font-size:12.5px;display:flex;flex-wrap:wrap;gap:4px 14px}
.meta .lbl{color:var(--faint);text-transform:uppercase;letter-spacing:.06em;font-size:10.5px;margin-right:4px}
.banner{display:flex;align-items:center;gap:12px;border:1px solid var(--line-strong);padding:12px 16px;background:var(--panel)}
.banner .big{font-size:22px;font-weight:700;letter-spacing:-.02em}
.banner.ok{border-color:color-mix(in srgb,var(--pass) 40%,var(--line));background:var(--pass-bg)}.banner.ok .big{color:var(--pass)}
.banner.bad{border-color:color-mix(in srgb,var(--fail) 45%,var(--line));background:var(--fail-bg)}.banner.bad .big{color:var(--fail)}
.banner small{display:block;color:var(--muted);font-size:11.5px;font-weight:500}
.stats{display:grid;grid-template-columns:repeat(6,1fr);gap:1px;background:var(--line);border:1px solid var(--line);margin-bottom:16px}
.stat{background:var(--panel);padding:14px 16px}.stat .sv{font-size:22px;font-weight:680;letter-spacing:-.02em}
.stat .sl{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--faint);margin-top:2px}
.stat.pass .sv{color:var(--pass)}.stat.fail .sv{color:var(--fail)}.stat.skip .sv{color:var(--skip)}
@media(max-width:720px){.stats{grid-template-columns:repeat(3,1fr)}}
.ratewrap{border:1px solid var(--line);background:var(--panel);padding:14px 16px;margin-bottom:22px;display:flex;align-items:center;gap:14px}
.ratewrap .pct{font-size:18px;font-weight:700;letter-spacing:-.01em;white-space:nowrap}
.bar{flex:1;height:9px;background:var(--panel-2);display:flex;overflow:hidden;border:1px solid var(--line)}
.seg{height:100%}.seg.pass{background:var(--pass)}.seg.fail{background:var(--fail)}.seg.skip{background:var(--skip)}
.controls{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:14px;position:sticky;top:0;background:var(--ground);padding:10px 0;z-index:5;border-bottom:1px solid var(--line)}
.search{flex:1;min-width:200px;display:flex;align-items:center;gap:8px;border:1px solid var(--line-strong);background:var(--panel);padding:8px 12px}
.search input{border:0;background:transparent;color:var(--ink);font:inherit;width:100%;outline:none}
.search svg{flex:none;color:var(--faint)}
button.ctl{border:1px solid var(--line-strong);background:var(--panel);color:var(--ink);font:inherit;font-size:13px;padding:8px 12px;cursor:pointer;display:inline-flex;align-items:center;gap:7px}
button.ctl:hover{border-color:var(--accent);color:var(--accent-ink)}
button.ctl[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:#17150f}
button.ctl .n{font-variant-numeric:tabular-nums;color:var(--fail);font-weight:700}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.cat{border:1px solid var(--line);background:var(--panel);margin-bottom:8px}
.cat.has-fail{border-color:color-mix(in srgb,var(--fail) 35%,var(--line))}
details{overflow:hidden}
summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:12px;padding:12px 14px;user-select:none}
summary::-webkit-details-marker{display:none}summary:hover{background:var(--panel-2)}
.caret{flex:none;width:9px;height:9px;border-right:1.5px solid var(--faint);border-bottom:1.5px solid var(--faint);transform:rotate(-45deg);transition:transform .15s ease;margin:0 2px}
details[open]>summary .caret{transform:rotate(45deg)}
.cname{font-weight:620;letter-spacing:-.005em}.cmeta{color:var(--faint);font-size:12px}
.cat>details>summary .bar{max-width:220px;margin-left:auto}
.counts{display:flex;align-items:center;gap:8px;white-space:nowrap}
.file .counts,.file>summary .counts{margin-left:auto}
.tnum{color:var(--muted);font-size:12.5px;font-weight:600}
.fdur,.tdur{color:var(--faint);font-size:12px;white-space:nowrap}
.chip{font-size:11px;padding:2px 7px;border:1px solid transparent;letter-spacing:.02em}
.chip.fail{color:var(--fail);background:var(--fail-bg);border-color:color-mix(in srgb,var(--fail) 30%,transparent)}
.chip.skip{color:var(--skip);background:var(--skip-bg);border-color:color-mix(in srgb,var(--skip) 30%,transparent)}
.files{padding:0 8px 8px;display:flex;flex-direction:column;gap:1px}
.file{border:1px solid var(--line);background:var(--panel-2)}
.file.has-fail{border-color:color-mix(in srgb,var(--fail) 40%,var(--line))}
.file>summary{padding:9px 12px;gap:10px;font-size:13px}
.fbase{font-family:ui-monospace,monospace;font-weight:600}
.fdir{font-family:ui-monospace,monospace;color:var(--faint);font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tests{padding:2px 6px 8px 30px;display:flex;flex-direction:column}
.suite{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--accent-ink);margin:10px 0 3px;font-weight:650}
.test{display:flex;align-items:center;gap:10px;padding:4px 8px}
.test:hover{background:var(--panel)}
.dot{flex:none;width:8px;height:8px;border-radius:50%}
.dot.pass{background:var(--pass)}.dot.fail{background:var(--fail)}.dot.skip{background:var(--skip)}
.tname{font-family:ui-monospace,monospace;font-size:12.5px;color:var(--ink);flex:1;min-width:0}
.test.skipped .tname{color:var(--muted)}.test .tdur{margin-left:auto}
.fail-msg{flex-basis:100%;order:9;margin:4px 0 4px 18px;padding:10px 12px;background:var(--fail-bg);border-left:2px solid var(--fail);color:var(--ink);font-size:12px;white-space:pre-wrap;overflow-x:auto}
.empty{display:none;text-align:center;color:var(--muted);padding:48px 0;font-size:14px}
.foot{margin-top:28px;color:var(--faint);font-size:11.5px;text-align:center}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
<div class="wrap">
  <header class="head">
    <div>
      <h1 class="title">Pleks <span class="k">·</span> Test Report</h1>
      <div class="meta">
        ${META.branch ? `<span><span class="lbl">Branch</span><span class="mono">${esc(META.branch)}</span></span>` : ""}
        ${META.commit ? `<span><span class="lbl">Commit</span><span class="mono">${esc(META.commit)}</span></span>` : ""}
        <span><span class="lbl">Run</span>${esc(META.when)}</span>
        <span><span class="lbl">Suites</span><span${META.dbSkipped ? ` style="color:var(--fail)"` : ""}>${esc(META.suites)}</span></span>
      </div>
    </div>
    <div class="banner ${allGreen ? "ok" : "bad"}"><div><div class="big">${allGreen ? "All passing" : `${S.failed} failing`}</div><small>${S.passed} of ${S.total} tests · ${ms(totalDur)} total</small></div></div>
  </header>
  <div class="stats">${stat("Tests", S.total)}${stat("Passed", S.passed, "pass")}${stat("Failed", S.failed, S.failed ? "fail" : "")}${stat("Skipped", S.skipped, S.skipped ? "skip" : "")}${stat("Files", S.files)}${stat("Duration", ms(totalDur))}</div>
  <div class="ratewrap"><span class="pct">${rate.toFixed(1)}%</span>${bar(S.passed, S.failed, S.skipped, S.total)}</div>
  <div class="controls">
    <label class="search"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg><input id="q" type="search" placeholder="Filter tests, files, categories…" autocomplete="off" aria-label="Filter"></label>
    <button class="ctl" id="failonly" aria-pressed="false">Failures only ${S.failed ? `<span class="n">${S.failed}</span>` : ""}</button>
    <button class="ctl" id="toggle" aria-pressed="false">Expand all</button>
  </div>
  <main id="tree">${catList.map(catBlock).join("")}<div class="empty" id="empty">No tests match your filter.</div></main>
  <div class="foot">Generated by <span class="mono">${esc(META.cmd)}</span> · vitest JSON reporter · ${S.total} tests across ${catList.length} categories</div>
</div>
<script>
(function(){
  const q=document.getElementById('q'),tree=document.getElementById('tree'),empty=document.getElementById('empty');
  const failBtn=document.getElementById('failonly'),togBtn=document.getElementById('toggle');
  const cats=[...tree.querySelectorAll('.cat')];let failOnly=false;
  function apply(){
    const term=q.value.trim().toLowerCase();let anyCat=false;
    for(const cat of cats){
      let anyFile=false;
      for(const file of cat.querySelectorAll('.file')){
        let anyTest=false;const base=file.querySelector('.fbase').textContent.toLowerCase();
        for(const t of file.querySelectorAll('.test')){
          const okStatus=!failOnly||t.dataset.status==='failed';
          const okTerm=!term||t.dataset.name.includes(term)||base.includes(term)||cat.dataset.name.includes(term);
          const show=okStatus&&okTerm;t.style.display=show?'':'none';if(show)anyTest=true;
        }
        file.style.display=anyTest?'':'none';if(anyTest){anyFile=true;if(term||failOnly)file.open=true;}
      }
      cat.style.display=anyFile?'':'none';if(anyFile){anyCat=true;if(term||failOnly)cat.querySelector('details').open=true;}
    }
    empty.style.display=anyCat?'none':'block';
  }
  q.addEventListener('input',apply);
  failBtn.addEventListener('click',()=>{failOnly=!failOnly;failBtn.setAttribute('aria-pressed',failOnly);apply();});
  togBtn.addEventListener('click',()=>{const open=togBtn.getAttribute('aria-pressed')!=='true';togBtn.setAttribute('aria-pressed',open);togBtn.textContent=open?'Collapse all':'Expand all';tree.querySelectorAll('details').forEach(d=>{if(d.parentElement.style.display!=='none')d.open=open;});});
})();
</script>`

// ── 4. Write timestamped report, prune to the newest KEEP ───────────────────────────────────────────────
const ts = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19) // YYYY-MM-DD-HH-MM-SS
const outName = `report-${ts}.html`
writeFileSync(resolve(REPORT_DIR, outName), html)

const reports = readdirSync(REPORT_DIR).filter((f) => /^report-.*\.html$/.test(f)).sort() // ISO names sort chronologically
for (const f of reports.slice(0, Math.max(0, reports.length - KEEP))) rmSync(resolve(REPORT_DIR, f))
rmSync(UNIT_JSON, { force: true })
rmSync(DB_JSON, { force: true })

const kept = readdirSync(REPORT_DIR).filter((f) => /^report-.*\.html$/.test(f)).sort().reverse()
console.log(`\n${allGreen ? "✓" : "✗"} test:report — ${S.passed}/${S.total} passed${S.failed ? `, ${S.failed} FAILED` : ""} · ${ms(totalDur)}`)
console.log(`  → test/reports/${outName}`)
console.log(`  keeping ${kept.length}: ${kept.join(", ")}`)
process.exit(vitestCode)
