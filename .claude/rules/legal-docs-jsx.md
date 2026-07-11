---
paths:
  - "app/(public)/**"
---

## LEGAL DOCS JSX DISCIPLINE

In every legal page under `app/(public)/` — terms, privacy, popia-register, credit-check-policy,
cookie-policy, paia-manual, definitions — bolded labels must use the explicit JSX space expression,
never a bare literal space:

```tsx
// Correct — survives line-wrap, formatters, and str_replace edits
<strong>Label.</strong>{" "}Following text here.

// Wrong — space can be silently stripped at JSX line boundaries
<strong>Label.</strong> Following text here.
```

The `{" "}` is semantically identical but immune to three failure modes:
1. JSX whitespace stripping when a formatter or str_replace wraps the line
2. Prettier/biome reformatting
3. Copy-paste artefacts when inserting bold labels via str_replace

**This applies to any element immediately followed by descriptive text** — including
`</strong>`, `</span>`, `</em>` — wherever a space is needed between an inline element
and adjacent prose at a potential line boundary.

Source: ADDENDUM_LEGAL_DOCS_SPACING_2026-05-27.

---

