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
    // Dev-only utility scripts — not production code
    "scripts/**",
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
]);

export default eslintConfig;
