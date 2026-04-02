# FINAL SIGN-OFF AMENDMENTS + Seed Instruction

**Status:** ✅ APPROVED with three minor amendments below. Ready to seed.

**Legal review verdict:** "The draft is legally robust for the South African context." Clauses will stand up in Rental Housing Tribunal, Magistrate's Court, and CPA scrutiny.

---

## Amendment 1: Pets clause — add fumigation upon exit

In the pets `body_template`, after the sub-clause about "clean, hygienic and sanitary condition", add to the end of that sub-clause:

**Before:**
```
...shall be responsible for flea and tick treatment and any associated pest control at his/its own cost;
```

**After:**
```
...shall be responsible for flea and tick treatment and any associated pest control at his/its own cost. Upon the termination of this agreement, the lessee shall arrange for professional fumigation of the leased premises at his/its own cost where pets were kept during the currency of the agreement, and shall provide proof of such fumigation to the lessor prior to the handover of the leased premises;
```

**Reason:** Common point of friction in deposit deductions. Making it an explicit obligation prevents disputes.

---

## Amendment 2: Utilities clause — battery discharge guidance

In the utilities_alternative `body_template`, in the routine maintenance list (sub-clause 4), after "monitoring inverter and battery status indicators and reporting faults;" add:

**Add line:**
```
ensuring battery storage systems are not discharged below the minimum level specified in the manufacturer's operating instructions or, where no level is specified, below 20% (twenty percent) of total capacity;
```

**Reason:** Battery over-discharge causes premature degradation. This establishes a clear standard without requiring the tenant to be an electrician.

---

## Amendment 3: Annexure D definition consistency

This is a system-level check, not a clause change. Ensure that every reference to "Annexure D" across the entire lease clause library uses the exact same designation: **"Annexure D: Special Agreements"**. No variations (not "Annexure D", not "Schedule D", not "Addendum D").

**Check in the existing clause library:** The `early_termination` clause and the existing seed data may use "Addendum D" — search and replace to ensure consistency.

**Action for Claude Code:** Search all `body_template` values in `lease_clause_library` for any reference to "Addendum D" or "Schedule D" and normalize to "Annexure D: Special Agreements".

---

## Technical note: electricity dependency enforcement

The `utilities_alternative` clause has `depends_on: '{"electricity"}'`. The `ClauseConfigurator` component already handles this — when a dependent clause is enabled, its dependencies are auto-enabled with a toast notification. No additional work needed.

**Verify:** In `ClauseConfigurator.tsx`, the `toggleClause` function checks `clause.depends_on` and auto-enables missing dependencies. This already works for the existing clause library. Confirm it works with the new `utilities_alternative → electricity` dependency after seeding.

---

## Claude Code instruction — seed the clauses

> **Read `brief/legal/FINAL_v3_OPTIONAL_CLAUSES.md` for the full clause body text, then apply the three amendments from `brief/legal/FINAL_SIGNOFF_AMENDMENTS.md`.**
> 
> **Step 1 — Create migration.** Create `supabase/migrations/011_optional_clauses_seed.sql`. Copy the full SQL block from the bottom of `FINAL_v3_OPTIONAL_CLAUSES.md` (section 6 "Seed migration"). Before pasting, apply amendments 1 and 2 to the clause body text:
> - In the `pets` body: after "flea and tick treatment and any associated pest control at his/its own cost" add the fumigation-upon-exit sentence from Amendment 1
> - In the `utilities_alternative` body: in the routine maintenance bullet list, after "monitoring inverter and battery status indicators and reporting faults;" add the battery discharge line from Amendment 2
> - The `UPDATE` statement for the `general` clause (Annexure D hierarchy) stays as-is
> 
> **Step 2 — Annexure D consistency.** Search all existing `body_template` values in `006_seed.sql` for "Addendum D" or "Schedule D". If found, add a migration statement to `011_optional_clauses_seed.sql` that normalises them to "Annexure D: Special Agreements". The new clauses already use the correct form.
> 
> **Step 3 — Update feature map.** In `lib/leases/featureClauseMap.ts`, move the four TODO mappings from comments into the active `FEATURE_CLAUSE_MAP`:
> ```ts
> "Pet-friendly":            ["pets"],
> "Solar":                   ["utilities_alternative"],
> "Borehole":                ["utilities_alternative"],
> "Garage":                  ["parking"],
> "Carport":                 ["parking"],
> "Fibre":                   ["telecommunications"],
> "DSTV":                    ["telecommunications"],
> ```
> Remove the TODO comments — these clauses now exist in the library.
> 
> **Step 4 — Verify dependency.** Check that `ClauseConfigurator.tsx`'s `toggleClause` function correctly auto-enables `electricity` when `utilities_alternative` is toggled on. This should already work via the `depends_on` array — just verify the path.

---

## Sign-off record (updated)

| Version | Date | Reviewed by | Status |
|---------|------|-------------|--------|
| v1 | 2026-04-02 | AI draft (Sonnet 4.6) | Superseded |
| v2 | 2026-04-02 | Preliminary legal review | Superseded |
| v3 | 2026-04-02 | Targeted legal review | Superseded |
| v3 + amendments | 2026-04-02 | Final legal review | ✅ **APPROVED** |
