/**
 * bash-gate.config.mjs — KIT FILE, install at `.claude/hooks/`.
 *
 * @kit bash-gate-config v1 — tracked OUTSIDE its `KIT:CONFIG` region. The region is yours;
 * this file exists so there is exactly ONE of it.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────────────────────
 *
 * `PROTECTED_BRANCH` used to be declared in a `KIT:CONFIG` region of `bash-gate.js` AND in a
 * `KIT:CONFIG` region of `bash-gate.probe.mjs`, with the only thing binding them a sentence in the
 * probe's region: *"must match the hook's KIT:CONFIG branch region"*. Prose — the last rung — doing
 * a check's job, on the one value in the file every adopting project is invited to change.
 *
 * ⚠ THE DIRECTION THAT MATTERS IS THE SILENT ONE, and it is why this was worth a file. Set the
 * PROBE to `master` and leave the hook at `main`: the probe FAILS — loud, safe, self-correcting.
 * Set the HOOK to `master` and leave the probe at `main`: the probe PASSES, exercising a branch
 * nothing protects, while the branch that IS protected is never tested. **A green probe over the
 * wrong subject** is this estate's oldest failure, and here it was one careless edit away.
 *
 * The hook consumes stdin at top level and exports nothing, so the probe cannot import it — the
 * same constraint `agent-write-scope` met, with the same answer (M-KIT-06). A value two artefacts
 * must agree on lives in a module they both import, and then there is nothing to keep in sync.
 * Filed as the open half of M-KIT-07 and closed 2026-09-09.
 *
 * ── AND IT IS AN .mjs ON PURPOSE ─────────────────────────────────────────────────────────────
 *
 * `.mjs` is ESM whatever the project's `package.json` says. The hook is a `.js`, whose module kind
 * depends on the nearest `"type"` field — a project without one gets CJS and `import` is a syntax
 * error there. That is a real trap and it is the hook's to state, not this file's; see the note at
 * the top of `bash-gate.js`. What matters here: this file is importable from both kinds and never
 * changes meaning when a project adds or removes `"type": "module"`.
 */

/* KIT:CONFIG branch — the ASK gate every project needs: whatever act constitutes
 * the DEPLOYMENT, plus the everyday branch that must never prompt.
 *
 * PROTECTED is whatever the deployment runs from. Name it, and say in the REASON what is on the
 * other side of it — "this targets main" teaches nothing; "there is no staging step between this
 * and the live site" stops the hand.
 *
 * WORKING is a stand-in for ANY branch that is not the protected one. The probe asserts that
 * pushing it is ALLOWED, which is the case that matters: a gate that prompts on ordinary work is a
 * gate people learn to wave through. In a single-branch repo it names no real branch, and that is
 * fine — it is a synthetic value like the `cwd` region's (L-89), and it must simply DIFFER from
 * PROTECTED_BRANCH or the allow-cases and the ask-cases assert opposite things about one string. */
export const PROTECTED_BRANCH = "main";
export const WORKING_BRANCH = "develop";
export const PROTECTED_REASON =
  `this targets \`${PROTECTED_BRANCH}\`, and Vercel deploys from it on push — there is no staging step ` +
  `between this and app.pleks.co.za. The deploy gate (\`npm run security\`) is a manual pre-deploy ` +
  `step that nothing blocks the deployment on, so this prompt is the last place a human sees it.`;
/* KIT:CONFIG /branch */

// THE ONE INVARIANT THIS FILE CAN HOLD ITSELF, and it earned its place the hour the file was
// written: canon set WORKING_BRANCH to its own single branch name, honestly, and four probes
// flipped from allow to ask — "pushing main is not the deployment" against "pushing to main asks".
// Both cases are right; the configuration was contradictory. A config module that can refuse an
// impossible configuration should, at load, where the message can say why — not four assertions
// later, in a probe whose failures name neither the value nor the file it came from.
if (PROTECTED_BRANCH === WORKING_BRANCH) {
  throw new Error(
    `bash-gate.config.mjs: PROTECTED_BRANCH and WORKING_BRANCH are both "${PROTECTED_BRANCH}". ` +
      `WORKING_BRANCH stands for any branch that is NOT protected — the probe asserts pushing it is ` +
      `allowed while asserting pushing PROTECTED_BRANCH asks, so equal values assert opposite things ` +
      `about one string. In a single-branch repo leave WORKING_BRANCH as a name you do not use.`,
  );
}
