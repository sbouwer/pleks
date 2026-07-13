# The fixture museum

**Every real agency file that ever breaks the importer in production gets anonymised and lands here, forever.**

The taxonomy in `test/import/corrupt.ts` covers what we could *imagine*: a negative rent, a swapped date, a
formula in a name, a title row above the headers. It is a good list, and it has already found real bugs.

But it is bounded by imagination, and reality is not. The museum is the other half — it accumulates what nobody
thought to write down. It costs nothing to add to, and it compounds forever: every case here is a bug that
happened once and can never happen again silently.

The importer has never run in production, so the museum is **empty today**. That is honest, not a gap — an empty
museum with a working loader is a museum. The first real breakage fills it.

---

## Adding a case

1. **Get the file.** From the agency, with their consent, or from the failed `import_sessions` row.
2. **Anonymise it.** This is not optional and it is not a formality — a real book is a POPIA payload:
   - real names → generated names (keep the SHAPE: a juristic name stays juristic, a double-barrel stays double)
   - real ID numbers → regenerate with `makeSAId()` from `test/import/book.ts` (valid checksum, unless the
     broken checksum *is* the bug)
   - real emails / phones → `@example.co.za`, `082…`
   - **keep the amounts, the dates, the headers, the encoding, the line endings, the whitespace, and the exact
     byte that broke it.** Those are the evidence. Anonymise the people, never the defect.
3. **Name it for the failure, not the agency:** `002-comma-in-quoted-property-name.csv`, not `acme-export.csv`.
4. **Write the case file** — `<name>.json`, next to it:

```json
{
  "what": "one line: what the file did to us",
  "why": "why it broke — the mechanism, not the symptom",
  "expect": {
    "leasesCreated": 4,
    "mustReport": ["unit_number"],
    "mustNotBeSilent": true
  }
}
```

5. **Run `npm run test:db`.** `museum.dbtest.ts` picks it up automatically — there is no list to update, because a
   list is a thing someone forgets.

---

## The rule

A file in the museum is a **regression test with a real provenance**. It never gets deleted, it never gets
"cleaned up", and when it starts failing, something has been broken by someone who did not know it existed —
which is exactly the point.
