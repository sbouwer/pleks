-- 024_clause_condition.sql
-- Add conditional-inclusion support to the clause library.
-- condition: when non-null, the clause is only included in the document if
-- the named condition evaluates to true at generation time.
-- Currently supported conditions:
--   co_tenants_present — lease has at least one record in lease_co_tenants

ALTER TABLE lease_clause_library
  ADD COLUMN IF NOT EXISTS condition text;

-- Insert the attorney-reviewed co-lessee joint and several liability clause
INSERT INTO lease_clause_library
  (clause_key, title, body_template, lease_type,
   is_required, is_enabled_by_default, sort_order,
   description, toggle_label, condition)
VALUES (
  'co_lessee_liability',
  'Joint and Several Liability of Lessees',
  $$Where this Agreement is entered into by more than one Lessee, the Lessees shall be jointly and severally liable for all obligations arising from this Agreement. Each Lessee may be held individually responsible for the full amount of all obligations hereunder, and the Lessor shall be entitled to proceed against any one or more of the Lessees without first being required to proceed against the others. The Lessees hereby renounce the benefits of excussion and division.

The departure, absence or incapacity of one Lessee shall not release the remaining Lessee(s) from any obligation under this Agreement, unless otherwise agreed in writing by the Lessor, and this Agreement shall continue in full force against the remaining Lessee(s).

Where a Lessee who is a natural person elects to terminate this Agreement pursuant to section 14 of the Consumer Protection Act 68 of 2008, such termination shall be personal to that Lessee only and shall not affect or terminate the obligations of any remaining Lessee(s). The Agreement shall continue between the Lessor and the remaining Lessee(s), who shall remain liable for the full rental and all obligations under this Agreement.

Any deposit paid under this Agreement is held as security for all obligations of all Lessees jointly. No Lessee shall be entitled to a partial refund of the deposit on account of their departure. The deposit shall be dealt with in accordance with the provisions of the Rental Housing Act upon the final termination of this Agreement.$$,
  'both',
  true,   -- is_required (when condition is met)
  false,  -- is_enabled_by_default (condition gates inclusion; default irrelevant)
  250,
  'Joint and several liability for co-lessees. Auto-included when multiple lessees sign the agreement. Covers liability, departure, CPA s14 personal termination, and deposit handling.',
  'Co-lessees — joint and several liability',
  'co_tenants_present'
)
ON CONFLICT (clause_key) DO UPDATE
  SET title            = EXCLUDED.title,
      body_template    = EXCLUDED.body_template,
      sort_order       = EXCLUDED.sort_order,
      description      = EXCLUDED.description,
      condition        = EXCLUDED.condition;
