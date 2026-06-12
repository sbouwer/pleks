"use server"

/**
 * lib/actions/orgBanking.ts — the organisation's own bank accounts (Organisation › Details → Banking)
 *
 * Auth:   getOrgBanking → gateway (read); saveOrgBusinessAccount → requireAgentWriteAccess + audited.
 * Data:   bank_accounts (org-scoped). The BUSINESS (operating) account is where management fees are
 *         received — distinct from the TRUST account. Trust / PPRA / deposit-holding rows are governed by
 *         the Trust account settings and are NEVER written here (the upsert is scoped to type='business').
 * Notes:  account_number is masked before display by the caller + sanitised in the audit row.
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
