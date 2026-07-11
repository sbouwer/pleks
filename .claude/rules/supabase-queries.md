---
paths:
  - "lib/**/*.ts"
  - "app/**/*.ts"
  - "app/**/*.tsx"
---

## SUPABASE QUERY ERROR HANDLING — MANDATORY

**Never use `(data ?? [])` without checking `error` first.**

The Supabase JS client returns `{ data: null, error: { code, message } }` on any query failure — including a missing column (Postgres error 42703). The `?? []` fallback silently converts this to an empty array, making it look like the table is empty when the query is actually crashing.

```ts
// ❌ WRONG — masks query failures silently
const { data } = await supabase.from("units").select("id, access_instructions")
return data ?? []

// ✅ CORRECT — surface errors explicitly
const { data, error } = await supabase.from("units").select("id, access_instructions")
if (error) {
  console.error("fetchUnits failed:", error.message)
  return []
}
return data ?? []
```

This applies everywhere: server pages, server actions, client queries, route handlers. A missing column, wrong RLS policy, or typo in a column name will return `data: null` — not an error you can see without checking.

**Real incident:** The maintenance page showed no units for weeks because `access_instructions` was selected but never migrated. Every query returned `{ data: null, error: { code: "42703" } }`. The `?? []` fallback made it look like an empty list.

---

