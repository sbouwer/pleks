/**
 * eslint-rules/__tests__/no-hand-written-surety-filter.test.mjs — every shape the rule's header claims, planted
 *
 * Notes:  Its own suite (OWN_SUITE in all-rules-probed) because one planted case proved the rule ALIVE
 *         and said nothing about the shapes its header listed: the first version caught `.eq` and
 *         missed `.match({…})`, `.filter(c, op, v)`, `.not(c, op, v)`, `role.in.(…)` and a template
 *         column, all of which linted clean (walk F2, 2026-10-01). Each invalid case below is one of
 *         those; each valid case is a near-miss that must stay clean, on the same filename, so a pass
 *         is the rule discriminating and never the rule being switched off.
 */
import { RuleTester } from "eslint"
import { describe, it } from "vitest"
import rule from "../no-hand-written-surety-filter.mjs"

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: "module" } })
const file = "app/api/probe/surety/route.ts"
const q = (chain) => `export const q = (db) => db.from("application_co_applicants").select("id")${chain}\n`
const bad = (chain) => ({ code: q(chain), filename: file, errors: [{ messageId: "handWritten" }] })
const good = (chain) => ({ code: q(chain), filename: file })

tester.run("no-hand-written-surety-filter", rule, {
  valid: [
    good(`.or(SURETY_PARTY_OR_FILTER)`),
    good(`.eq("role", "co_applicant")`),
    good(`.match({ role: "co_applicant" })`),
    good(`.filter("role", "eq", "co_applicant")`),
    good(`.or("role.in.(co_applicant)")`),
    { code: `export const q = (db, o) => db.from("user_orgs").select("user_id").eq("org_id", o).eq("role", "agent")\n`, filename: file },
    { code: `export const w = (db, id) => db.from("application_co_applicants").update({ is_surety_director: true }).eq("id", id)\n`, filename: file },
    { code: `export const w = (db, id) => db.from("application_co_applicants").insert({ declared_director: false, primary_application_id: id })\n`, filename: file },
    // The SSOT file and tests are exempt — the predicate has to be spelled somewhere.
    { code: `export const SURETY_PARTY_OR_FILTER = "is_surety_director.eq.true,role.eq.guarantor"\n`, filename: "lib/applications/juristicParties.ts" },
  ],
  invalid: [
    bad(`.eq("is_surety_director", true)`),
    bad(".eq(`is_surety_director`, true)"),
    bad(`.eq("role", "guarantor")`),
    bad(`.in("role", ["guarantor", "co_applicant"])`),
    bad(`.match({ is_surety_director: true })`),
    bad(`.match({ role: "guarantor" })`),
    bad(`.filter("role", "eq", "guarantor")`),
    bad(`.not("role", "eq", "guarantor")`),
    bad(`.not("is_surety_director", "is", null)`),
    bad(`.or("role.in.(guarantor,co_applicant)")`),
    bad(`.or("is_surety_director.eq.true")`),
    // P1-R7a: the declared answer is a director marker too.
    bad(`.eq("declared_director", true)`),
    bad(`.match({ declared_director: true })`),
    bad(`.or("declared_director.eq.true")`),
  ],
})
