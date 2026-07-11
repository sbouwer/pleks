---
paths:
  - "eslint-rules/**"
  - "eslint.config.*"
---

## LINT RULE PLUMBING — TRAPS THAT SILENTLY DISABLE ENFORCEMENT

The lint rule is the deliverable — a grep counts what you point it at; a lint rule counts what exists. But the plumbing has two failure modes that turn a rule into decoration, both hit in this repo:

1. **A mis-derived `relPath` silently DISABLES the rule.** If the rule computes a file's repo-relative path wrongly (drive-letter casing, backslashes, cwd assumptions), baseline lookups miss and the rule either flags everything or nothing. After touching path derivation, RE-PROBE: confirm the rule fires on a known violation AND stays quiet on a baselined file.
2. **A single-spelling pattern measures a false zero.** `.slice(0,10)` and `.split("T")[0]` are the same operation; a pattern that knows one spelling reports the other as "clean". Before claiming a zero baseline, enumerate synonyms of the operation and extend the pattern to all of them — then prove the pattern fires on a planted positive.

Baseline discipline:
- A baseline entry means "read and classified", never "exempt". Every entry carries (or points to) its classification.
- Baselines only SHRINK. A new violation outside the baseline fails immediately; removing entries as they're fixed is part of the fix's acceptance.
- Never widen a baseline to make CI green — that's deleting the finding, not resolving it.

When adding a new rule: ship it WITH its baseline in the same commit, state the count in the commit message, and note the spellings the pattern covers.
