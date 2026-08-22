import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import sonarjs from "eslint-plugin-sonarjs";
import requireSupabaseErrorCheck from "./eslint-rules/require-supabase-error-check.mjs";
import noPopiaRawDelete from "./eslint-rules/no-popia-raw-delete.mjs";
import requireAuditOnSensitiveMutation from "./eslint-rules/require-audit-on-sensitive-mutation.mjs";
import requireScopeOnDelete from "./eslint-rules/require-scope-on-delete.mjs";
import settingsUseDetailTabs from "./eslint-rules/settings-use-detail-tabs.mjs";
import noCookieClientFrom from "./eslint-rules/no-cookie-client-from.mjs";
import requireOrgScopeOnServiceWrite from "./eslint-rules/require-org-scope-on-service-write.mjs";
import requireOrgScopeOnServiceRead from "./eslint-rules/require-org-scope-on-service-read.mjs";
import requireIdNumberEncryption from "./eslint-rules/require-id-number-encryption.mjs";
import noDirectResendSend from "./eslint-rules/no-direct-resend-send.mjs";
import noRawCronSecret from "./eslint-rules/no-raw-cron-secret.mjs";
import noAdhocDates from "./eslint-rules/no-adhoc-dates.mjs";
import noRawProcessEnv from "./eslint-rules/no-raw-process-env.mjs";
import noRawContentHash from "./eslint-rules/no-raw-content-hash.mjs";
import noDerivedContactColumnWrite from "./eslint-rules/no-derived-contact-column-write.mjs";
import noRerolledPhoneNormalise from "./eslint-rules/no-rerolled-phone-normalise.mjs";
import noRerolledMoneyFormat from "./eslint-rules/no-rerolled-money-format.mjs";
import noInlineAppUrl from "./eslint-rules/no-inline-app-url.mjs";
import noRawAuditLogInsert from "./eslint-rules/no-raw-audit-log-insert.mjs";
import noIdNumberHashInApp from "./eslint-rules/no-id-number-hash-in-app.mjs";
import noRerolledPropertyLabel from "./eslint-rules/no-rerolled-property-label.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  sonarjs.configs.recommended,
  {
    // Keep security + correctness rules; silence pure style/complexity noise
    rules: {
      "sonarjs/cognitive-complexity":          ["warn", 25],
      "sonarjs/no-nested-conditional":         "warn",
      "sonarjs/no-nested-functions":           "off",
      "sonarjs/no-nested-template-literals":   "off",
      "sonarjs/todo-tag":                      "off",
      "sonarjs/void-use":                      "off",
    },
  },
  {
    // Test files legitimately assert exact, deterministic float values (e.g. expect(rate).toBe(0.15)). The
    // no-floating-point-equality rule targets production comparison bugs, not test assertions — scope it off here.
    files: ["**/__tests__/**", "**/*.test.ts", "**/*.test.tsx"],
    rules: { "sonarjs/no-floating-point-equality": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // ⚠ `scripts/**` WAS IGNORED HERE, as "dev-only utility scripts — not production code".
    // REMOVED 2026-08-22 (control-aim audit R1, CD ruling). That reason was false for at least four
    // tracked files, each of which declares production intent in its OWN header while holding a
    // service-role key: encrypt-existing-pii.ts ("the highest-risk, IRREVERSIBLE operation in the
    // PII programme"), migrate-totp-host-claims.ts ("run once after deploying to production"),
    // backfill-insurance-checklists.ts ("run once on 60A go-live"), and nuke-user.mjs (which also
    // carries a management PAT).
    //
    // This is the `.claude/**` finding one entry up, repeated: the note below explains at length why
    // "not production code" stopped being true there — and the identical premise sat nine lines
    // above it, unexamined, for as long.
    //
    // The ruling was NOT "add a baseline". A baseline records violations as debt to burn down, and
    // several of these exemptions are correct FOREVER — encrypt-existing-pii.ts must handle raw ID
    // values because it IS the encryption implementation; the one-off migrations are deliberately
    // platform-wide, so an org filter would defeat them. A baseline would have filed permanent
    // correctness as a backlog. Exemptions live at the SITE, as an inline disable carrying its
    // reason, where the next person to touch the file reads it in the diff.
    // Claude Code agent worktrees and prompt files — not production code.
    // ⚠ THE HOOKS AND THE STATUSLINE ARE DELIBERATELY NOT IGNORED (the negations below). That
    // reason — "not production code" — was written when `.claude/` held prompts and worktrees, and
    // it stopped being true once the hooks became security controls: bash-gate.js is the only rung
    // that refuses --no-verify and rm-on-root, and agent-write-scope.js is what fences a subagent's
    // writes. On 2026-08-21 a `[perm]` branch in context-budget.js referenced a block-scoped `const`
    // from outside its block — a ReferenceError on EVERY invocation, swallowed by the surrounding
    // catch, so the feature never ran once while `npm run check` stayed green. `no-undef` catches
    // that in one pass, and could not see the file.
    // Listed per-directory rather than as `.claude/**` with negations: in flat config an ignored
    // DIRECTORY is never descended into, so `!.claude/hooks/**` cannot rescue a file underneath it.
    // The five tracked `.js` files (four hooks + the statusline) are therefore reached by NOT
    // ignoring their directories at all; everything else here is prompts, markdown and worktrees.
    ".claude/agents/**",
    ".claude/commands/**",
    ".claude/rules/**",
    ".claude/skills/**",
    ".claude/crawlers/**",
    ".claude/agent-memory/**",
    ".claude/worktrees/**",
    // Agent handoff artefacts. OUTSIDE `.claude/` since 2026-08-21 — `.claude` is a permission-
    // protected path, and putting every agent artefact inside it was the handoff protocol writing
    // into the one tree the permission system will not auto-approve. Gitignored either way.
    ".handoff/**",
    // Design prototypes and build specs — not production code
    "brief/**",
    // Local ESLint rule implementations — not app code
    "eslint-rules/**",
  ]),
  {
    // ── the Claude Code hooks + statusline ────────────────────────────────────────────────────
    // CommonJS Node scripts, not app code, and they need their own block for two reasons: the Next
    // presets assume ESM and browser globals, and `no-undef` is OFF by default under the TS preset
    // (the type-checker covers it there — but these are plain `.js`, so nothing did).
    //
    // The rule set is deliberately ONE rule. This is not an invitation to style-police the hooks;
    // it is the specific control for the specific defect — a name referenced where it is not
    // defined. Anything broader would produce a cleanup backlog on files whose value is that they
    // are stable, and a noisy gate gets removed.
    files: [".claude/hooks/**/*.js", ".claude/statusline.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        require: "readonly", module: "writable", exports: "writable", process: "readonly",
        console: "readonly", Buffer: "readonly", __dirname: "readonly", __filename: "readonly",
        setTimeout: "readonly", clearTimeout: "readonly", URL: "readonly", TextDecoder: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
      // Claude Code loads these as CommonJS — `require` is the calling convention, not a style
      // choice, and `statusline.js` requires the hook as a library so the two share one reader.
      "@typescript-eslint/no-require-imports": "off",
      // KEPT ON, and it is the reason this block earns its place: `sonarjs/super-linear-regex` was
      // configured in this repo the whole time and `.claude/**` sat in globalIgnores, so the one
      // mechanism that catches catastrophic backtracking was pointed away from the security hooks.
      // It flagged two live patterns the moment it could see them — one written this session, one
      // years older — and both are now token matchers. See `bash-gate.js`.
      "sonarjs/super-linear-regex": "error",
      // OFF, deliberately, and the boundary is the point: these are maintainability opinions, and
      // the repo runs `--max-warnings 0`, so leaving them on would make adding this block a
      // refactor of four stable security hooks. A gate that arrives with a cleanup backlog gets
      // reverted, and the two rules above — a name that is not defined, a regex that backtracks —
      // are the ones with a demonstrated incident behind them in this very file.
      "sonarjs/cognitive-complexity": "off",
      "sonarjs/no-nested-conditional": "off",
    },
  },
  {
    // Part 1 of ADDENDUM_SCHEMA_SELECT_GUARD: make a Supabase query that ignores `error`
    // a build failure, so column drift / RLS / timeout failures are loud, not silent.
    files: ["**/*.ts", "**/*.tsx"],
    plugins: { pleks: { rules: { "require-supabase-error-check": requireSupabaseErrorCheck, "no-popia-raw-delete": noPopiaRawDelete, "require-audit-on-sensitive-mutation": requireAuditOnSensitiveMutation, "require-scope-on-delete": requireScopeOnDelete, "settings-use-detail-tabs": settingsUseDetailTabs, "no-cookie-client-from": noCookieClientFrom, "require-org-scope-on-service-write": requireOrgScopeOnServiceWrite, "require-org-scope-on-service-read": requireOrgScopeOnServiceRead, "require-id-number-encryption": requireIdNumberEncryption, "no-direct-resend-send": noDirectResendSend, "no-raw-cron-secret": noRawCronSecret, "no-adhoc-dates": noAdhocDates, "no-raw-process-env": noRawProcessEnv, "no-raw-content-hash": noRawContentHash, "no-rerolled-phone-normalise": noRerolledPhoneNormalise, "no-rerolled-money-format": noRerolledMoneyFormat, "no-inline-app-url": noInlineAppUrl, "no-raw-audit-log-insert": noRawAuditLogInsert, "no-id-number-hash-in-app": noIdNumberHashInApp, "no-rerolled-property-label": noRerolledPropertyLabel, "no-derived-contact-column-write": noDerivedContactColumnWrite } } },
    rules: { "pleks/require-supabase-error-check": "error", "pleks/no-popia-raw-delete": "error", "pleks/require-audit-on-sensitive-mutation": "error", "pleks/require-scope-on-delete": "error", "pleks/settings-use-detail-tabs": "error", "pleks/no-cookie-client-from": "error", "pleks/require-org-scope-on-service-write": "error", "pleks/require-org-scope-on-service-read": "error", "pleks/require-id-number-encryption": "error", "pleks/no-direct-resend-send": "error", "pleks/no-raw-cron-secret": "error", "pleks/no-adhoc-dates": "error", "pleks/no-raw-process-env": "error", "pleks/no-raw-content-hash": "error", "pleks/no-rerolled-phone-normalise": "error", "pleks/no-rerolled-money-format": "error", "pleks/no-inline-app-url": "error", "pleks/no-raw-audit-log-insert": "error", "pleks/no-id-number-hash-in-app": "error", "pleks/no-rerolled-property-label": "error", "pleks/no-derived-contact-column-write": "error" },
  },
  {
    // SCOPED 2026-08-22 (R1). This block carried no `files:` and so applied to every file ESLint
    // could see — which was harmless only because everything that was not TS/TSX sat in
    // globalIgnores. Un-ignoring `scripts/**` exposed it immediately: `react/jsx-key` reached `.mjs`
    // files, where `next/core-web-vitals` has not registered the react plugin, and ESLint hard-fails
    // ("the react plugin is not defined in your configuration file") rather than skipping. These are
    // TS and React rules; naming their surface is what they always meant.
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],

      // ⚠ RESTATED FOR LEGIBILITY, NOT FOR BEHAVIOUR. Both of these were ALREADY enforced, inherited
      // from `next/core-web-vitals` + the TS preset — probe-verified 2026-08-18 by planting a
      // violation of each and watching eslint reject it. Nothing changes at runtime.
      //
      // What changes is that they become VISIBLE to `scripts/check-claude-md.mjs`, whose `eslint:`
      // resolver reads this file. Rules enforced only through a preset are real controls that the
      // resolver cannot see, so the tagging pass was forced to mark them UNENFORCEABLE — inflating
      // the binding metric with controls that exist. Legibility to the resolver is now part of what
      // "enforced" means, and a preset-inherited rule that matters should be restated here.
      "@typescript-eslint/no-explicit-any": "error",
      "react/jsx-key": "error",
      // eslint-plugin-react-hooks@7 added set-state-in-effect which flags the standard
      // useEffect(() => { load() }, [deps]) data-fetch pattern. Disabled until the rule
      // matures — the pattern is documented and intentional across the codebase.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    // Searchworx vendor URLs (uatapp/uatrest/rest.searchworks.co.za) must never leave
    // lib/searchworx/. The PDF and imagery endpoints are publicly-accessible by GUID;
    // exposing them to client code or logs creates POPIA s19 artefact-lifecycle risk.
    // Download immediately via downloadAndStoreSearchworxArtefact() and discard the URL.
    // D-14H-10, D-14H-12. See ADDENDUM_14H §5.
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["lib/searchworx/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: String.raw`Literal[value=/searchworks\.co\.za/]`,
          message:
            "Searchworx vendor URLs must not leave lib/searchworx/. " +
            "Download and store via downloadAndStoreSearchworxArtefact() in lib/searchworx/storage.ts. " +
            "See ADDENDUM_14H §5 and D-14H-12.",
        },
      ],
    },
  },
  {
    // Direct @anthropic-ai/sdk usage is prohibited — all AI calls must go through
    // lib/ai/client.ts, which handles logging, cost attribution, and org tracking.
    //
    // Payment-initiation APIs are prohibited everywhere (D-TRUST-01: Pleks is not
    // the trustee). If a genuine need arises, write a spec addendum first.
    // See brief/legal/TRUST_ACCOUNT_POSITIONING.md.
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["lib/ai/client.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{
          name: "@anthropic-ai/sdk",
          message: "Direct Anthropic SDK usage is prohibited. Use `createMessage` from `@/lib/ai/client` instead. See ADDENDUM_00H §5.",
        }],
        patterns: [{
          group: [
            "@stitch-money/*",
            "ozow-sdk",
            "snapscan*",
            "@absa/banking-api",
            "@standard-bank/payment-api",
          ],
          message:
            "Payment-initiation APIs violate the sovereign-trust-account invariant. " +
            "See brief/legal/TRUST_ACCOUNT_POSITIONING.md. " +
            "Write a spec addendum explaining why before opening a PR.",
        }],
      }],
    },
  },
  {
    // Public surfaces must not import the POPIA domain-data modules directly.
    // Use MARKETING_FACTS from @/lib/marketing/facts for counts and summaries.
    // Exempted: lib/legal/** (domain modules themselves), lib/marketing/** (aggregator),
    // and the legal register/privacy pages which need the full enumeration.
    // See ADDENDUM_00J §4.2, D-MKT-16.
    files: ["**/*.ts", "**/*.tsx"],
    ignores: [
      "lib/legal/**",
      "lib/marketing/**",
      "app/(public)/popia-register/**",
      "app/(public)/privacy/**",
    ],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          {
            name: "@/lib/legal/popia-purposes",
            message:
              "Import MARKETING_FACTS from `@/lib/marketing/facts` instead of the raw domain module. " +
              "See ADDENDUM_00J §4.2.",
          },
          {
            name: "@/lib/legal/operators",
            message:
              "Import MARKETING_FACTS from `@/lib/marketing/facts` instead of the raw domain module. " +
              "See ADDENDUM_00J §4.2.",
          },
          {
            name: "@/lib/legal/retention-categories",
            message:
              "Import MARKETING_FACTS from `@/lib/marketing/facts` instead of the raw domain module. " +
              "See ADDENDUM_00J §4.2.",
          },
        ],
      }],
    },
  },
  {
    // C-4 (ADDENDUM_CRON_RELIABILITY): a cron handler MUST await its async work. A floating email send is
    // silently lost when the serverless instance freezes after the response (this is how C-1 spread — `void`
    // was silencing the rule). Disallow the void-escape here (ignoreVoid:false); genuine best-effort pings
    // (HEARTBEAT_*) stay exempt because they use `.catch()` (a handled promise). Type-aware + scoped to crons
    // only, so the rest of the lint stays fast.
    files: ["app/api/cron/**/*.ts"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: false }],
      // Turning on type-awareness (for the rule above) also wakes this type-aware SonarJS rule, which
      // false-positives on every cron's `req.headers.get(...) !== process.env.CRON_SECRET` (string|null vs
      // string|undefined CAN be equal, so the comparison is not "always true"). Off here; it was dormant
      // everywhere else anyway (no type info → never ran).
      "sonarjs/different-types-comparison": "off",
    },
  },
  {
    // OG/metadata image routes render through next/og (Satori), which supports ONLY raw <img> — next/image is
    // unavailable. Turn the rule off here so it's deterministic across envs (it fires locally but not in CI, so
    // any inline disable reads as "unused" on one side). No directive needed → clean on both.
    files: ["**/opengraph-image.tsx", "**/twitter-image.tsx", "**/icon.tsx", "**/apple-icon.tsx"],
    rules: { "@next/next/no-img-element": "off" },
  },
  {
    // ── `scripts/**` RULE SELECTION (CD ruling, 2026-08-22) ───────────────────────────────────────
    // Mirrors the `.claude/hooks/**` block above, deliberately and for the same reason: the security
    // and correctness rules stay ON, the maintainability opinions go OFF, because the repo runs
    // `--max-warnings 0` and a gate that arrives with a 176-item cleanup backlog gets reverted.
    //
    // ON (not restated here — they apply by inheritance): every `pleks/*` rule, and
    // `sonarjs/super-linear-regex`. Those are the two families with an incident behind them.
    //
    // `sonarjs/no-os-command-from-path` — OFF, and this is the reason, at the site rather than in a
    // commit message so it is in the diff when someone revisits it:
    //   All 36 sites pass a hardcoded command literal (`git` ×17, `node` ×7, `sh` ×7, `npx` ×3,
    //   `gh` ×2); none takes the command name from input, and `lint.mjs`'s `shell: true` is the
    //   Windows `.cmd`-shim workaround, not an injection surface. The rule's class is PATH
    //   hijacking — but every one of these runs UNDER `npm run check`, invoked by npm and node
    //   resolved through that same PATH. A hostile PATH has already won before `git` is spawned.
    //   The rule guards one link in a chain whose earlier links are unguarded.
    // The seven `node` sites were nonetheless changed to `process.execPath` in the same commit, for
    // a DIFFERENT reason — a bare `node` can start an interpreter other than the one running the
    // script, which is a real bug class in a repo pinned to Node 22. Silencing seven findings was
    // the side effect, not the motive, and no equivalent exists for git/sh/npx/gh.
    files: ["scripts/**"],
    rules: {
      "sonarjs/no-os-command-from-path": "off",
      // The maintainability set. Refactor opinions about gate scripts whose value is that they are
      // stable; none names a defect class this repo has been bitten by.
      "sonarjs/cognitive-complexity": "off",
      "sonarjs/no-nested-conditional": "off",
      // The unused family, all three spellings — `@typescript-eslint` for the TS scripts, the two
      // SonarJS twins for the `.mjs` ones. Named individually rather than by prefix, so adding a
      // fourth spelling is a decision someone makes rather than one that arrives.
      "@typescript-eslint/no-unused-vars": "off",
      "sonarjs/no-unused-vars": "off",
      "sonarjs/unused-import": "off",
      "sonarjs/no-dead-store": "off",

      // ── the cosmetic regex-shape family ──────────────────────────────────────────────────────
      // OFF, not baselined, and the distinction is the whole reason these four are listed rather
      // than left in `eslint-suppressions.json`. Every live site is `[a-zA-Z_]` under an `/i` flag
      // in check-migration-forward-refs.mjs — a redundant range, behaviourally identical, in a
      // regex that parses `CREATE TABLE` and `REFERENCES` out of migration files. Rewriting a
      // working gate regex to satisfy a cosmetic rule is precisely the `\s`→`s` scar: a pattern
      // corrupted in the edit, producing a plausible-but-wrong artefact that reported 328, then 29,
      // then 21 unpaired policies across three rebuilds.
      //
      // That argument says these should NEVER be fixed, which makes them exemptions. Baselining a
      // permanent exemption files correctness as a backlog — the exact error the `scripts/**`
      // ruling avoided at the directory level, reproduced one level down inside the baseline. It
      // also costs the baseline its only signal: a ratchet that cannot reach zero cannot tell
      // "burned down as far as it goes" from "stalled".
      "sonarjs/duplicates-in-character-class": "off",
      "sonarjs/concise-regex": "off",
      "sonarjs/regex-complexity": "off",
      "sonarjs/single-char-in-character-classes": "off",
      // Same call, different family: `(tables[x] ??= []).push(y)` is a deliberate idiom, not a
      // nested assignment someone will one day untangle.
      "sonarjs/no-nested-assignment": "off",
    },
  },
  {
    // `.cjs` is a CommonJS file by its own extension — `require` is its calling convention, not a
    // style choice. Identical to the `@typescript-eslint/no-require-imports: off` in the hooks block
    // above, and for the identical reason. Two files: generate-import-template.cjs, parse-sonar.cjs.
    files: ["**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);

// ── `eslint-suppressions.json` — every entry is in `scripts/` ────────────────────────────────────
// ESLint's bulk-suppressions baseline (v9.24+). Every entry is DEBT with a reachable zero, recorded
// so `scripts/**` could be un-ignored today rather than after a cleanup sweep. Same discipline as
// every other baseline here: entries only SHRINK (`--prune-suppressions`), a NEW violation past the
// recorded count fails immediately, and it is never widened to make CI green.
//
// NO COUNTS BELOW, deliberately. §8 forbids this file carrying observations about the tree, and the
// first `--prune-suppressions` run would make every number wrong while leaving the comment looking
// reviewed — precision reads as verification. Which rule, which class, which reason is durable; how
// many is a stat the JSON already holds.
//
// Two things this list is NOT. It is not where exemptions live — those are inline
// `eslint-disable-next-line … -- <why>` at the site, because a config-level exemption list rots
// invisibly while a directive appears in the diff whenever the file is touched. And it is not where
// real defects are TRACKED: a baseline has no owner, no priority and no blast tag. The defects and
// the designed fixes are in `docs/MECHANISABLE.md`; the entries here only stop them multiplying.
//
//   super-linear-regex             parsers over the repo's OWN tracked files and its own tool
//                                  output. The sites reading AGENT-WRITTEN artefacts were FIXED
//                                  instead (check-handoff-contract.mjs) — that input is the one an
//                                  agent composes freely, and "repo-tracked input is trusted" is the
//                                  premise that already failed twice here.
//   no-unenclosed-multiline-block  almost all one hand-rolled `const ok = (c,l) => { if (!c)
//                                  failed++; console.log(…) }` probe helper, copied per suite, where
//                                  the unconditional second statement IS the intent. Whether to
//                                  extract it is a named open decision → M-087.
//   prefer-single-boolean-return   style, reachable zero.
//   no-redundant-jump              style, reachable zero.
//
//   pleks/no-raw-process-env       ⚠ A TRAP, not ordinary debt — the rule pushes toward the change
//                                  that breaks these scripts. Sketch and probe → M-085.
//   require-supabase-error-check   REAL defects, one of them on the PII retrofit's verification
//   no-adhoc-dates                 path. Enumerated with blast tags → M-086.
//   no-all-duplicated-branches     REAL. → M-086.
//   no-duplicated-branches         REAL. → M-086.

export default eslintConfig;
