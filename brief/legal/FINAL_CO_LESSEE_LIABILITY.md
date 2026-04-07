# FINAL: Co-Lessee Joint & Several Liability Clause

**Clause key:** `co_lessee_liability`
**Type:** Required (conditional)
**Condition:** `co_tenants_present` — auto-included when `lease_co_tenants.length > 0`
**Sort order:** After parties clause, before financial clauses (suggested sort: 250)
**Attorney reviewed:** Yes — incorporates all four refinements from legal review

---

## Body text

Where this Agreement is entered into by more than one Lessee, the Lessees shall be jointly and severally liable for all obligations arising from this Agreement. Each Lessee may be held individually responsible for the full amount of all obligations hereunder, and the Lessor shall be entitled to proceed against any one or more of the Lessees without first being required to proceed against the others. The Lessees hereby renounce the benefits of excussion and division.

The departure, absence or incapacity of one Lessee shall not release the remaining Lessee(s) from any obligation under this Agreement, unless otherwise agreed in writing by the Lessor, and this Agreement shall continue in full force against the remaining Lessee(s).

Where a Lessee who is a natural person elects to terminate this Agreement pursuant to section 14 of the Consumer Protection Act 68 of 2008, such termination shall be personal to that Lessee only and shall not affect or terminate the obligations of any remaining Lessee(s). The Agreement shall continue between the Lessor and the remaining Lessee(s), who shall remain liable for the full rental and all obligations under this Agreement.

Any deposit paid under this Agreement is held as security for all obligations of all Lessees jointly. No Lessee shall be entitled to a partial refund of the deposit on account of their departure. The deposit shall be dealt with in accordance with the provisions of the Rental Housing Act upon the final termination of this Agreement.

---

## Refinements applied (from legal review)

| # | Original | Refined | Reason |
|---|----------|---------|--------|
| 1 | Implied waiver of excussion/division | Added explicit: "The Lessees hereby renounce the benefits of excussion and division." | Belt-and-braces — removes interpretive argument in formal disputes |
| 2 | Departure doesn't release remaining lessees (unqualified) | Added: "unless otherwise agreed in writing by the Lessor" | Prevents informal substitutions; allows lessor to agree to release if appropriate |
| 3 | Agreement continues "on all the same terms" | Changed to: "who shall remain liable for the full rental and all obligations" | Closes the rental apportionment / affordability dispute gap |
| 4 | "refunded in accordance with the Rental Housing Act" | Changed to: "dealt with in accordance with the provisions of the Rental Housing Act" | Avoids argument that refund is automatic; incorporates inspection + lawful deductions |

---

## CPA s14 auto-detection logic (for BUILD_42 lease wizard)

```ts
// Determine CPA applicability based on primary tenant entity type + lease type
// Co-signers don't affect CPA status — it's personal to the natural person
const cpaApplies = leaseType === 'residential' && primaryTenant.entityType === 'individual'
```

CPA s14 notice is generated for and sent to the individual tenant. The co-signing company is CC'd as a courtesy but is not the legal recipient.

---

## Seed data for migration

```sql
INSERT INTO clauses (
  clause_key, title, body_template, sort_order, is_required,
  lease_type, description, condition
) VALUES (
  'co_lessee_liability',
  'Joint and Several Liability of Lessees',
  E'Where this Agreement is entered into by more than one Lessee, the Lessees shall be jointly and severally liable for all obligations arising from this Agreement. Each Lessee may be held individually responsible for the full amount of all obligations hereunder, and the Lessor shall be entitled to proceed against any one or more of the Lessees without first being required to proceed against the others. The Lessees hereby renounce the benefits of excussion and division.\n\nThe departure, absence or incapacity of one Lessee shall not release the remaining Lessee(s) from any obligation under this Agreement, unless otherwise agreed in writing by the Lessor, and this Agreement shall continue in full force against the remaining Lessee(s).\n\nWhere a Lessee who is a natural person elects to terminate this Agreement pursuant to section 14 of the Consumer Protection Act 68 of 2008, such termination shall be personal to that Lessee only and shall not affect or terminate the obligations of any remaining Lessee(s). The Agreement shall continue between the Lessor and the remaining Lessee(s), who shall remain liable for the full rental and all obligations under this Agreement.\n\nAny deposit paid under this Agreement is held as security for all obligations of all Lessees jointly. No Lessee shall be entitled to a partial refund of the deposit on account of their departure. The deposit shall be dealt with in accordance with the provisions of the Rental Housing Act upon the final termination of this Agreement.',
  250,
  true,
  'residential',
  'Joint and several liability for co-lessees. Auto-included when multiple lessees sign the agreement. Covers: liability, departure, CPA s14 personal termination, and deposit handling.',
  'co_tenants_present'
);
```

The `condition` field (`co_tenants_present`) is checked at lease generation time: if `lease_co_tenants` has any records, this clause is included. If the lease has a single lessee, the clause is omitted — it's irrelevant and would confuse the tenant.
