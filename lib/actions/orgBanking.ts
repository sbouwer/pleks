"use server"

/**
 * lib/actions/orgBanking.ts — the organisation's own bank accounts (Organisation › Details → Banking)
 *
 * Auth:   getOrgBanking → gateway (read).
 *         createOrgBankAccount → requireAgentWriteAccess + an owner/property_manager role check + audited.
 *         saveOrgBusinessAccount → requireAgentWriteAccess ONLY. It has NO role check and NO audit write,
 *         and it edits the account management fees are paid into. `save_org_business_account` is also absent
 *         from ACTION_CAPABILITY, so `reqCap` is undefined and the RBAC arm short-circuits — the
 *         `AgentWriteAction | string` parameter type hides that from the compiler. Any member of the org can
 *         therefore rewrite the payout account, which RLS `bank_accounts_org_update` would refuse.
 *         Pre-existing, NOT introduced by BUILD_71 D8; recorded here rather than closed inside a fix for a
 *         different bug. Tracked as M-104.
 * Data:   bank_accounts (org-scoped). The BUSINESS (operating) account is where management fees are
 *         received — distinct from the TRUST account. saveOrgBusinessAccount is scoped to type='business';
 *         createOrgBankAccount is the audited path for the trust / PPRA / deposit-holding rows.
 * Notes:  account_number is masked before display by the caller + sanitised in the audit row.
 *
 *         ⚠ account_number on THIS table is PLAINTEXT. `tenant_bank_accounts` carries
 *         `account_number_enc` + `account_number_hash` (004_leases_financials.sql); `bank_accounts` has
 *         neither column, so `lib/crypto/bankAccount.ts` cannot be applied here without a migration and a
 *         backfill. CLAUDE.md §4 currently states bank account numbers are encrypted at rest — for this
 *         table that is NOT true. Tracked as BUILD_71 D8; do not "fix" it with a helper call that has no
 *         column to write into.
 */
import { gateway } from "@/lib/supabase/gateway"
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { recordAudit } from "@/lib/audit/recordAudit"

const TRUST_TYPES = ["trust", "ppra_trust", "deposit_holding"]

export interface OrgBusinessAccount {
  id: string | null
  bank_name: string | null
  account_holder: string | null
  account_number: string | null
  branch_code: string | null
  account_type: string | null
}

export interface OrgTrustAccountSummary {
  id: string
  type: string
  bank_name: string | null
  account_number: string | null
}

/** Read the org's business (operating) account + a read-only summary of its trust-type accounts. */
export async function getOrgBanking(): Promise<{ business: OrgBusinessAccount | null; trust: OrgTrustAccountSummary[] }> {
  const gw = await gateway()
  if (!gw) return { business: null, trust: [] }
  const { db, orgId } = gw
  const { data, error } = await db
    .from("bank_accounts")
    .select("id, type, bank_name, account_holder, account_number, branch_code, account_type")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true })
  if (error) { console.error("getOrgBanking:", error.message); return { business: null, trust: [] } }
  const rows = (data ?? []) as Array<{
    id: string; type: string; bank_name: string | null; account_holder: string | null
    account_number: string | null; branch_code: string | null; account_type: string | null
  }>
  const biz = rows.find((r) => r.type === "business") ?? null
  return {
    business: biz
      ? { id: biz.id, bank_name: biz.bank_name, account_holder: biz.account_holder, account_number: biz.account_number, branch_code: biz.branch_code, account_type: biz.account_type }
      : null,
    trust: rows
      .filter((r) => TRUST_TYPES.includes(r.type))
      .map((r) => ({ id: r.id, type: r.type, bank_name: r.bank_name, account_number: r.account_number })),
  }
}

export interface SaveBusinessAccountInput {
  bank_name: string
  account_holder: string
  account_number?: string | null
  branch_code?: string | null
  account_type?: string | null
}

/** Upsert the org's BUSINESS (operating) account — never touches trust/PPRA/deposit-holding rows. Audited. */
export async function saveOrgBusinessAccount(input: SaveBusinessAccountInput): Promise<{ ok: true } | { error: string }> {
  if (!input.bank_name?.trim() || !input.account_holder?.trim()) {
    return { error: "Bank name and account holder are required." }
  }
  const gw = await requireAgentWriteAccess("save_org_business_account")
  const { db, orgId, userId } = gw

  const { data: existing, error: readErr } = await db
    .from("bank_accounts").select("id").eq("org_id", orgId).eq("type", "business").limit(1).maybeSingle()
  if (readErr) return { error: readErr.message }

  const row = {
    org_id: orgId,
    type: "business" as const,
    bank_name: input.bank_name.trim(),
    account_holder: input.account_holder.trim(),
    account_number: input.account_number?.trim() || null,
    branch_code: input.branch_code?.trim() || null,
    account_type: input.account_type || null,
  }

  if (existing?.id) {
    const { error } = await db.from("bank_accounts").update(row).eq("id", existing.id).eq("org_id", orgId).eq("type", "business")
    if (error) return { error: error.message }
    await recordAudit(db, {
      orgId, actorId: userId, action: "UPDATE", table: "bank_accounts", recordId: existing.id,
      after: { action: "business_bank_account_changed", bank_name: row.bank_name, account_number: row.account_number },
    })
  } else {
    const { data: inserted, error } = await db.from("bank_accounts").insert(row).select("id").single()
    if (error) return { error: error.message }
    await recordAudit(db, {
      orgId, actorId: userId, action: "INSERT", table: "bank_accounts", recordId: (inserted as { id: string }).id,
      after: { action: "business_bank_account_added", bank_name: row.bank_name, account_number: row.account_number },
    })
  }
  return { ok: true }
}

/** The account types `bank_accounts.type` accepts — mirrors the CHECK constraint in 001_foundation.sql. */
const BANK_ACCOUNT_TYPES = ["trust", "business", "deposit_holding", "ppra_trust"] as const
/** `bank_accounts.account_type` CHECK — NOTE it differs from tenant_bank_accounts' ('current' vs 'cheque'). */
const BANK_SUB_TYPES = ["cheque", "savings", "transmission"] as const

export interface CreateOrgBankAccountInput {
  type: string
  bank_name: string
  account_holder: string
  account_number?: string | null
  branch_code?: string | null
  account_type?: string | null
}

export interface CreatedOrgBankAccount {
  id: string
  type: string
  bank_name: string
  account_holder: string
  account_number: string | null
  branch_code: string | null
  account_type: string | null
}

/**
 * Create one of the org's bank accounts — including the TRUST / PPRA / deposit-holding rows that
 * `saveOrgBusinessAccount` deliberately never touches. Audited.
 *
 * ⚠ WHY THIS EXISTS: the compliance settings UI used to insert straight into `bank_accounts` from the
 * BROWSER (`createClient().from("bank_accounts").insert({ ...form, org_id: orgId })`), so creating a
 * trust account left NO who/when. That is the F1 payout-banking scar exactly — and `bank_accounts` was
 * the one bank-account table absent from `require-audit-on-sensitive-mutation`'s T1 set, so no control
 * reported it. Both halves are closed together: the table is now T1, and this is the audited path.
 *
 * ⚠ THE ROLE CHECK IS NOT DECORATION — it REPLACES a control that moving server-side removes. The
 * browser path ran through the anon client, so RLS `bank_accounts_org_insert` (001_foundation.sql:483)
 * bounded it to `owner`/`property_manager`. `requireAgentWriteAccess` returns the SERVICE client, which
 * bypasses RLS entirely, so without this check the migration would have silently WIDENED who can create
 * a trust account. Same gate family as `saveOrgBusinessAccount` for consistency with its sibling.
 */
export async function createOrgBankAccount(
  input: CreateOrgBankAccountInput,
): Promise<{ account: CreatedOrgBankAccount } | { error: string }> {
  if (!input.bank_name?.trim() || !input.account_holder?.trim()) {
    return { error: "Bank name and account holder are required." }
  }
  if (!(BANK_ACCOUNT_TYPES as readonly string[]).includes(input.type)) {
    return { error: "Unknown account type." }
  }
  const subType = input.account_type?.trim() || null
  if (subType && !(BANK_SUB_TYPES as readonly string[]).includes(subType)) {
    return { error: "Unknown account sub-type." }
  }

  const gw = await requireAgentWriteAccess("create_org_bank_account")
  const { db, orgId, userId, role } = gw
  if (role !== "owner" && role !== "property_manager") {
    return { error: "Only an owner or property manager can add a bank account." }
  }

  // Field-by-field, never a spread of caller input — the column set is the allowlist.
  const row = {
    org_id: orgId,
    type: input.type,
    bank_name: input.bank_name.trim(),
    account_holder: input.account_holder.trim(),
    account_number: input.account_number?.trim() || null,
    branch_code: input.branch_code?.trim() || null,
    account_type: subType,
  }

  const { data: inserted, error } = await db
    .from("bank_accounts")
    .insert(row)
    .select("id, type, bank_name, account_holder, account_number, branch_code, account_type")
    .single()
  if (error) return { error: error.message }

  const account = inserted as CreatedOrgBankAccount
  await recordAudit(db, {
    orgId, actorId: userId, action: "INSERT", table: "bank_accounts", recordId: account.id,
    after: { action: "org_bank_account_added", type: row.type, bank_name: row.bank_name, account_number: row.account_number },
  })
  return { account }
}
