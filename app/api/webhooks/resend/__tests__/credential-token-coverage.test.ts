/**
 * app/api/webhooks/resend/__tests__/credential-token-coverage.test.ts — every credential token
 * is either bounce-revocable or explicitly out of scope with a reason
 *
 * Notes:  ADDENDUM_62F §17.1, and specifically the §5.1 CORRECTION to its own spec.
 *
 *         The spec's first version said "assert every credential-token table has
 *         communication_log_id", driven from CREDENTIAL_TOKEN_TABLES. That is SELF-SATISFYING:
 *         that list is what the handler loops, so every member has the column by construction. It
 *         asserts a tautology and reports coverage it is not providing — the non-empty-assertion
 *         failure one level up, and the third time this arc has produced a check that passes
 *         without checking.
 *
 *         The risk is THE NEXT TOKEN TABLE SOMEONE ADDS. So this enumerates by SHAPE, from the
 *         migrations: a table with a `token`-ish column carrying UNIQUE. Each must be either wired
 *         into the bounce handler or listed OUT_OF_SCOPE **with a written reason**. A bare
 *         allowlist would reintroduce exactly the problem — an entry nobody has to justify.
 */
import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { CREDENTIAL_TOKEN_TABLES } from "../route"

const MIGRATIONS = join(process.cwd(), "supabase", "migrations")

/**
 * Token tables that are deliberately NOT bounce-revocable. A reason string is mandatory — an entry
 * without one fails the test rather than passing quietly.
 */
const OUT_OF_SCOPE: Record<string, string> = {
  // ── EMAILED CREDENTIALS, NOT YET WIRED ──────────────────────────────────────────────────────
  // The shape scan found these; §5.1 anticipated only delivery_notice_tokens. Each is a token
  // delivered by email, so each CAN bounce and leave a live credential with no recipient — the
  // same defect §17.1 closes for tenant_portal_tokens. They are genuine framework members, not
  // exclusions, and they are listed here rather than omitted precisely so the hole is visible.
  // Logged, not chased (process rule 2): each needs its own communication_log_id + DDL, none
  // blocks the current queue. This map is the backlog, and it should shrink to the two entries
  // below it.
  application_tokens:
    "EMAILED CREDENTIAL — can bounce. Needs its own communication_log_id + DDL. Logged, not chased.",
  invites:
    "EMAILED CREDENTIAL — can bounce. Needs its own communication_log_id + DDL. Logged, not chased.",
  ownership_transfers:
    "EMAILED CREDENTIAL — can bounce. Needs its own communication_log_id + DDL. Logged, not chased.",
  property_info_requests:
    "EMAILED CREDENTIAL — can bounce. Needs its own communication_log_id + DDL. Logged, not chased.",
  delivery_notice_tokens:
    // ⚠ CORRECTED 2026-08-17: this reason previously said the communication_log_id column was pending.
    // It is not — 011_documents_messaging.sql:905 has carried it NOT NULL since the table was created.
    // The real blocker is the other half of the pattern: the handler revokes via
    // .update({ revoked: true }).eq("revoked", false), and this table has no revoked column at all —
    // only acknowledged_at, which is a different lifecycle (anonymous notice viewing, not credential
    // revocation). A wrong reason is worse than a terse one: it sends the next person to add a column
    // that already exists and to conclude the table is then wired, when it still would not be.
    "EMAILED CREDENTIAL — can bounce. HAS communication_log_id (011:905, NOT NULL) but has NO revoked " +
    "column; acknowledged_at is acknowledgement, not revocation. Needs its own revocation semantics " +
    "before it can join CREDENTIAL_TOKEN_TABLES. Logged, not chased.",
  passkey_challenges:
    "Not a delivered credential — a WebAuthn ceremony nonce that never leaves the request/response " +
    "cycle. Nothing emails it, so it cannot bounce.",
  device_enrolment_tokens:
    "Not yet built (62F §2.2). Displayed on-screen as a QR/short code with a 90s TTL, never emailed, " +
    "so bounce revocation does not apply.",
}

/** Tables whose token column is UNIQUE — the shape of a credential lookup key. */
function tokenTablesFromMigrations(): string[] {
  const found = new Set<string>()
  for (const file of readdirSync(MIGRATIONS).filter(f => f.endsWith(".sql"))) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8")
    // Split rather than regex the body: a lazy [\s\S]*? across a 4,000-line migration backtracks
    // super-linearly (sonarjs/super-linear-regex), and a test that takes seconds gets skipped.
    for (const chunk of sql.split("CREATE TABLE IF NOT EXISTS ").slice(1)) {
      const table = /^(\w+)/.exec(chunk)?.[1]
      if (!table) continue
      const body = chunk.slice(0, chunk.indexOf("\n);"))
      // A token-ish column carrying UNIQUE on the same line. Line-by-line string ops rather than a
      // multiline regex — alternation plus `[^\n]*\bUNIQUE\b` backtracks super-linearly, and the
      // whole point of this scan is that it stays cheap enough to keep in `npm run check`.
      const TOKEN_COLUMNS = ["token", "raw_token", "code", "token_hash", "code_hash"]
      const hasUniqueToken = body.split("\n").some(line => {
        if (!line.includes("UNIQUE")) return false
        const first = line.trim().split(/\s+/)[0]
        return TOKEN_COLUMNS.includes(first)
      })
      if (hasUniqueToken) found.add(table)
    }
  }
  return [...found].sort()
}

describe("§17.1 — credential tokens are bounce-revocable or explicitly excused", () => {
  const tokenTables = tokenTablesFromMigrations()

  it("actually found token tables in the migrations (never let the scan pass vacuously)", () => {
    // Without this, a changed CREATE TABLE style or a moved migrations dir makes the assertion
    // below iterate nothing and report safety. §5.1 exists because the previous version of this
    // test did exactly that from the other direction.
    expect(tokenTables.length).toBeGreaterThan(0)
  })

  it("every token table is wired into the bounce handler or excused with a reason", () => {
    const unaccounted = tokenTables.filter(
      t => !(CREDENTIAL_TOKEN_TABLES as readonly string[]).includes(t) && !(t in OUT_OF_SCOPE),
    )

    expect(
      unaccounted,
      `Token table(s) neither bounce-revocable nor excused:\n  ${unaccounted.join("\n  ")}\n\n` +
        "A token that is emailed and then hard-bounces is a live credential with no recipient. Add " +
        "`communication_log_id` to the table and list it in CREDENTIAL_TOKEN_TABLES, or add it to " +
        "OUT_OF_SCOPE with a reason saying why it can never bounce. See ADDENDUM_62F §17.1 / §5.1.",
    ).toEqual([])
  })

  it("no OUT_OF_SCOPE entry has an empty or token reason", () => {
    // A bare allowlist is the failure mode this replaces — an entry nobody had to justify.
    for (const [table, reason] of Object.entries(OUT_OF_SCOPE)) {
      expect(reason.trim().length, `${table} needs a real reason`).toBeGreaterThan(40)
    }
  })

  it("a table cannot be both wired and excused", () => {
    const both = (CREDENTIAL_TOKEN_TABLES as readonly string[]).filter(t => t in OUT_OF_SCOPE)
    expect(both, `contradictory: ${both.join(", ")}`).toEqual([])
  })
})
