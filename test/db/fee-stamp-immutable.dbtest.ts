/**
 * test/db/fee-stamp-immutable.dbtest.ts — a quoted fee never moves: the two 14V stamp triggers, probed both ways (ADDENDUM_14V §3.5, §6)
 *
 * Auth:   raw psql vs LOCAL Supabase (npm run test:db)
 * Notes:  The REAL trigger functions (application_fee_immutable, screening_payment_fee_immutable) are attached to a
 *         session TEMP table carrying the same columns, so the function's logic is driven without seeding the
 *         foreign-key chain an applications row needs. That leaves one thing the temp table cannot show — that
 *         the trigger is actually attached to the real table — so each table gets its own attachment assertion.
 *
 *         Directions: an unstamped row takes a fee; a stamped row refuses a changed fee and every changed stamp
 *         column; a stamped row accepts the SAME values (an idempotent re-write is not a change) and any other
 *         column. For payments, paid_at alone also freezes the fee.
 *         §3.5a: an UNPAID stamp may be voided — all six columns NULL together, fee included, since the ITN reads the
 *         fee — and nothing less; a PAID stamp may not be voided at all.
 */
import { describe, expect, it } from "vitest"
import { psql } from "@/test/db/tier"

/** One psql session: a temp twin of the table's fee columns, with the real trigger function on it. */
function twin(fn: string, feeCol: string, extraCols: string, body: string): void {
  psql(`
    CREATE TEMP TABLE twin (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ${feeCol} integer, rate_effective_date date, pricing_policy_version text, cost_excl_vat_cents integer,
      note text${extraCols}
    );
    CREATE TRIGGER twin_fee_immutable BEFORE UPDATE ON twin FOR EACH ROW EXECUTE FUNCTION public.${fn}();
    ${body}
  `)
}

/** The trigger is on the table, enabled, AND calls the function the twin probes — a name alone could point anywhere. */
function attached(trigger: string, table: string, fn: string): void {
  psql(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = '${trigger}' AND tgrelid = 'public.${table}'::regclass
                   AND tgenabled <> 'D' AND tgfoid = 'public.${fn}()'::regprocedure) THEN
      RAISE EXCEPTION '${trigger} is not attached to ${table} calling ${fn}';
    END IF;
  END $$;`)
}

const STAMPED = `INSERT INTO twin (FEE, rate_effective_date, pricing_policy_version, cost_excl_vat_cents)
  VALUES (25000, '2026-10-01', 'v1', 20280);`

describe("applications — trg_application_fee_immutable", () => {
  const run = (body: string) =>
    twin("application_fee_immutable", "fee_amount_cents", ", fee_paid_at timestamptz, priced_party_count integer, priced_entity boolean",
      body.replaceAll("FEE", "fee_amount_cents"))
  const VOID_ALL = `UPDATE twin SET fee_amount_cents = NULL, rate_effective_date = NULL, pricing_policy_version = NULL,
    cost_excl_vat_cents = NULL, priced_party_count = NULL, priced_entity = NULL;`

  it("is attached to applications", () => {
    expect(() => attached("trg_application_fee_immutable", "applications", "application_fee_immutable")).not.toThrow()
  })

  it("KNOWN-GOOD: an unstamped row takes a fee and a stamp", () => {
    expect(() => run(`INSERT INTO twin (note) VALUES ('x');
      UPDATE twin SET fee_amount_cents = 25000, pricing_policy_version = 'v1', rate_effective_date = '2026-10-01', cost_excl_vat_cents = 20280;`)).not.toThrow()
  })

  for (const [col, value] of [
    ["fee_amount_cents", "26000"],
    ["rate_effective_date", "'2026-10-02'"],
    ["pricing_policy_version", "'v2'"],
    ["cost_excl_vat_cents", "1"],
    ["priced_party_count", "2"],
    ["priced_entity", "true"],
  ] as const) {
    it(`PLANTED: a stamped row refuses a changed ${col}`, () => {
      expect(() => run(`${STAMPED} UPDATE twin SET ${col} = ${value};`)).toThrow(/a quoted fee never moves/)
    })
  }

  it("KNOWN-GOOD: an UNPAID stamp is voided whole — all six columns at once (§3.5a)", () => {
    expect(() => run(`${STAMPED} ${VOID_ALL}`)).not.toThrow()
  })

  it("PLANTED: a partial void is refused — a fee left behind is a fee the ITN would still accept", () => {
    expect(() => run(`${STAMPED} UPDATE twin SET pricing_policy_version = NULL;`)).toThrow(/void the whole stamp or none of it/)
    expect(() => run(`${STAMPED} UPDATE twin SET pricing_policy_version = NULL, rate_effective_date = NULL, cost_excl_vat_cents = NULL;`))
      .toThrow(/void the whole stamp or none of it/)
  })

  it("PLANTED: a PAID stamp is never voided (§3.5a — paid lines frozen)", () => {
    expect(() => run(`${STAMPED} UPDATE twin SET fee_paid_at = now(); ${VOID_ALL}`)).toThrow(/never moves once paid/)
  })

  it("PLANTED: a PAID row refuses a changed fee even with no stamp (paid before 14V)", () => {
    expect(() => run(`INSERT INTO twin (fee_amount_cents, fee_paid_at) VALUES (25000, now()); UPDATE twin SET fee_amount_cents = 26000;`))
      .toThrow(/a quoted fee never moves/)
  })

  it("KNOWN-GOOD: a stamped row accepts the SAME values and any other column", () => {
    expect(() => run(`${STAMPED} UPDATE twin SET fee_amount_cents = 25000, pricing_policy_version = 'v1'; UPDATE twin SET note = 'y';`)).not.toThrow()
  })
})

describe("application_screening_payments — trg_screening_payment_fee_immutable", () => {
  const run = (body: string) =>
    twin("screening_payment_fee_immutable", "fee_cents", ", paid_at timestamptz", body.replaceAll("FEE", "fee_cents"))

  it("is attached to application_screening_payments", () => {
    expect(() => attached("trg_screening_payment_fee_immutable", "application_screening_payments", "screening_payment_fee_immutable")).not.toThrow()
  })

  it("PLANTED: a stamped payment refuses a changed fee", () => {
    expect(() => run(`${STAMPED} UPDATE twin SET fee_cents = 1;`)).toThrow(/a quoted or paid fee never moves/)
  })

  it("PLANTED: a PAID payment refuses a changed fee even with no stamp", () => {
    expect(() => run(`INSERT INTO twin (fee_cents, paid_at) VALUES (25000, now()); UPDATE twin SET fee_cents = 1;`)).toThrow(/a quoted or paid fee never moves/)
  })

  it("KNOWN-GOOD: an unpaid, unstamped payment takes a fee; a paid one accepts the same fee again", () => {
    expect(() => run(`INSERT INTO twin (note) VALUES ('x'); UPDATE twin SET fee_cents = 25000;`)).not.toThrow()
    expect(() => run(`INSERT INTO twin (fee_cents, paid_at) VALUES (25000, now()); UPDATE twin SET fee_cents = 25000, note = 'itn again';`)).not.toThrow()
  })
})
