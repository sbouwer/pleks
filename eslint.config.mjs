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
import requireIdNumberEncryption from "./eslint-rules/require-id-number-encryption.mjs";
import noDirectResendSend from "./eslint-rules/no-direct-resend-send.mjs";
import noRawCronSecret from "./eslint-rules/no-raw-cron-secret.mjs";
import noAdhocDates from "./eslint-rules/no-adhoc-dates.mjs";
import noRawProcessEnv from "./eslint-rules/no-raw-process-env.mjs";
import noRawContentHash from "./eslint-rules/no-raw-content-hash.mjs";
import noRerolledPhoneNormalise from "./eslint-rules/no-rerolled-phone-normalise.mjs";

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
    // Claude Code agent worktrees — not production code
    ".claude/**",
    // Design prototypes and build specs — not production code
    "brief/**",
    // Local ESLint rule implementations — not app code
    "eslint-rules/**",
  ]),
  {
    // Part 1 of ADDENDUM_SCHEMA_SELECT_GUARD: make a Supabase query that ignores `error`
    // a build failure, so column drift / RLS / timeout failures are loud, not silent.
    files: ["**/*.ts", "**/*.tsx"],
    plugins: { pleks: { rules: { "require-supabase-error-check": requireSupabaseErrorCheck, "no-popia-raw-delete": noPopiaRawDelete, "require-audit-on-sensitive-mutation": requireAuditOnSensitiveMutation, "require-scope-on-delete": requireScopeOnDelete, "settings-use-detail-tabs": settingsUseDetailTabs, "no-cookie-client-from": noCookieClientFrom, "require-org-scope-on-service-write": requireOrgScopeOnServiceWrite, "require-id-number-encryption": requireIdNumberEncryption, "no-direct-resend-send": noDirectResendSend, "no-raw-cron-secret": noRawCronSecret, "no-adhoc-dates": noAdhocDates, "no-raw-process-env": noRawProcessEnv, "no-raw-content-hash": noRawContentHash, "no-rerolled-phone-normalise": noRerolledPhoneNormalise } } },
    rules: { "pleks/require-supabase-error-check": "error", "pleks/no-popia-raw-delete": "error", "pleks/require-audit-on-sensitive-mutation": "error", "pleks/require-scope-on-delete": "error", "pleks/settings-use-detail-tabs": "error", "pleks/no-cookie-client-from": "error", "pleks/require-org-scope-on-service-write": "error", "pleks/require-id-number-encryption": "error", "pleks/no-direct-resend-send": "error", "pleks/no-raw-cron-secret": "error", "pleks/no-adhoc-dates": "error", "pleks/no-raw-process-env": "error", "pleks/no-raw-content-hash": "error", "pleks/no-rerolled-phone-normalise": "error" },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
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
