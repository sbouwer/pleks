/**
 * lib/audit/t1Registry.ts — the T1 (tier-1 sensitive mutation) registry (ADDENDUM_AUDIT_BEHAVIOURAL_COVERAGE)
 *
 * Auth:   server/script only — the behavioural entries import logic-layer mutation fns
 * Data:   none at module load; invoke() drives real mutations against the disposable test org
 * Notes:  Single source of truth for the T1 set (Phase F). It BOTH drives the Category-14 behavioural
 *         harness (scripts/security/cat14-behavioural.mts) AND documents the contract — complete-by-
 *         construction, mirroring lib/popia/anonymisePlan.ts. A new T1 mutation must be added here or the
 *         registry-completeness test (D-6) fails.
 *
 *         `behavioural`         — the audited logic is a plain fn (service, …); the harness invokes it
 *                                 directly past the gateway and asserts a fresh, PII-sanitised audit row.
 *         `behavioural_pending` — the audit lives inside a "use server" / route shell that does its own
 *                                 gateway(); not yet split into a testable core (D-5). Covered by Category-13
 *                                 integrity only — VISIBLE debt (WARNING), not a silent gap.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { addBankAccount, editBankAccount, removeBankAccount } from "@/lib/contacts/contactBankAccounts"
import { resolveSubject, executeIdentityAnonymise } from "@/lib/popia/anonymiseIdentity"

/** Everything a behavioural T1 needs to run against the disposable test org. */
export interface HarnessCtx {
  service: SupabaseClient
  orgId: string
  userId: string
  contactId: string
  tenantId: string
  subjectEmail: string
}

export interface T1Check {
  /** stable id, e.g. "bank.add" */
  id: string
  /** expected audit_log.table_name */
  table: string
  expectedAction: "INSERT" | "UPDATE" | "DELETE"
  status: "behavioural" | "behavioural_pending"
  /** for pending: why it can't be driven headless yet (shown as the WARNING reason) */
  reason?: string
  /** raw values seeded so the harness can prove recordAudit's sanitiser masked them */
  piiFixture?: Record<string, string>
  /** behavioural only: drive the LOGIC-layer fn; return the id the audit row should reference */
  invoke?: (ctx: HarnessCtx) => Promise<{ recordId: string }>
}

// Raw fixtures — these MUST NOT appear unmasked in the resulting audit_log row.
const RAW_ACCOUNT = "6011223344"
const RAW_ID_NUMBER = "9001015800086"

const bankInput = {
  bank_name: "Test Bank", account_number: RAW_ACCOUNT, branch_code: "250655",
  account_type: "cheque" as const, label: "Primary",
}

export const T1_REGISTRY: T1Check[] = [
  {
    id: "bank.add", table: "contact_bank_accounts", expectedAction: "INSERT",
    status: "behavioural", piiFixture: { account_number: RAW_ACCOUNT },
    async invoke(ctx) {
      const res = await addBankAccount(ctx.service, ctx.orgId, ctx.contactId, ctx.userId, { ...bankInput })
      return { recordId: (res.data?.id as string) ?? "" }
    },
  },
  {
    id: "bank.edit", table: "contact_bank_accounts", expectedAction: "UPDATE",
    status: "behavioural", piiFixture: { account_number: RAW_ACCOUNT },
    async invoke(ctx) {
      const add = await addBankAccount(ctx.service, ctx.orgId, ctx.contactId, ctx.userId, { ...bankInput })
      const id = (add.data?.id as string) ?? ""
      await editBankAccount(ctx.service, ctx.orgId, ctx.contactId, id, ctx.userId, { ...bankInput, bank_name: "Edited Bank" })
      return { recordId: id }
    },
  },
  {
    id: "bank.remove", table: "contact_bank_accounts", expectedAction: "DELETE",
    status: "behavioural",
    async invoke(ctx) {
      const add = await addBankAccount(ctx.service, ctx.orgId, ctx.contactId, ctx.userId, { ...bankInput })
      const id = (add.data?.id as string) ?? ""
      await removeBankAccount(ctx.service, ctx.orgId, ctx.contactId, id, ctx.userId)
      return { recordId: id }
    },
  },
  {
    // The marquee F0 case: prove the POPIA erasure trail actually fires a row.
    id: "erasure.identity", table: "contacts", expectedAction: "UPDATE",
    status: "behavioural", piiFixture: { id_number: RAW_ID_NUMBER },
    async invoke(ctx) {
      const resolved = await resolveSubject(ctx.service, { org_id: ctx.orgId, user_id: ctx.userId, email: ctx.subjectEmail })
      await executeIdentityAnonymise(ctx.service, resolved, "tenant", "cat14-test-request", ctx.userId)
      return { recordId: ctx.contactId }
    },
  },

  // ── behavioural_pending: audited logic is trapped in a server-action / route shell (D-5) ──
  { id: "payment.record", table: "payments", expectedAction: "INSERT", status: "behavioural_pending",
    reason: "recordPayment(formData) server action — needs gateway/core split to expose an audited core" },
  { id: "team.role_change", table: "user_orgs", expectedAction: "UPDATE", status: "behavioural_pending",
    reason: "audit inside app/api/team route handler — extract an audited core" },
  { id: "team.member_remove", table: "user_orgs", expectedAction: "DELETE", status: "behavioural_pending",
    reason: "audit inside app/api/team route handler — extract an audited core" },
  { id: "team.invite_revoke", table: "invites", expectedAction: "DELETE", status: "behavioural_pending",
    reason: "audit inside app/api/team/invite route handler — extract an audited core" },
  { id: "ownership.transfer", table: "user_orgs", expectedAction: "UPDATE", status: "behavioural_pending",
    reason: "audited (74cf3c59) but inside app/api/team/transfer-ownership route handler — core-split pending" },
  { id: "id.reveal", table: "tenants", expectedAction: "UPDATE", status: "behavioural_pending",
    reason: "id-number reveal server action — needs gateway/core split" },
  { id: "application.create", table: "applications", expectedAction: "INSERT", status: "behavioural_pending",
    reason: "createTenantFromApplication — server action shell; promote once shaped as a core fn" },
]

/**
 * The canonical T1 contract (the AUDIT_HARDENING §1 tier set, by operation). Every id here MUST have a
 * registry entry — the completeness test (D-6) fails otherwise, so a new T1 can't silently skip coverage.
 */
export const T1_CONTRACT_IDS = [
  "bank.add", "bank.edit", "bank.remove",
  "erasure.identity",
  "payment.record",
  "team.role_change", "team.member_remove", "team.invite_revoke",
  "ownership.transfer",
  "id.reveal",
  "application.create",
] as const
