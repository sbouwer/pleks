import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import sonarjs from "eslint-plugin-sonarjs";

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
  ]),
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
    // Direct @anthropic-ai/sdk usage is prohibited — all AI calls must go through
    // lib/ai/client.ts, which handles logging, cost attribution, and org tracking.
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["lib/ai/client.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{
          name: "@anthropic-ai/sdk",
          message: "Direct Anthropic SDK usage is prohibited. Use `createMessage` from `@/lib/ai/client` instead. See ADDENDUM_00H §5.",
        }],
      }],
    },
  },
]);

export default eslintConfig;
