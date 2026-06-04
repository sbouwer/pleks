/**
 * lib/leases/bankDetails.ts — trust-account bank details for lease generation (DocuSeal Annexure A)
 *
 * Auth:   service client (server-only); org-scoped
 * Data:   bank_accounts WHERE type='trust' for the org; returns a not-configured fallback when absent
 * Notes:  maybeSingle (not single) — a trust account is optional, so 0 rows is normal, not an error.
 */
import { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"

export interface LessorBankDetails {
  bankName: string
  accountHolder: string
  accountNumber: string
  branchCode: string
  fullDetails: string
  configured: boolean
}

/**
 * Fetches the trust account bank details for lease generation.
 * Used in DocuSeal template variables (Annexure A rental calculation).
 */
export async function getLessorBankDetails(orgId: string): Promise<LessorBankDetails> {
  const supabase = await createServiceClient()

  const { data: trustAccount, error: trustAccountError } = await supabase
    .from("bank_accounts")
    .select("bank_name, account_holder, account_number, branch_code")
    .eq("org_id", orgId)
    .eq("type", "trust")
    .limit(1)
    .maybeSingle()
  logQueryError("getLessorBankDetails bank_accounts", trustAccountError)

  if (!trustAccount) {
    return {
      bankName: "[Lessor's banking institution — not configured]",
      accountHolder: "[Not configured]",
      accountNumber: "[Not configured]",
      branchCode: "[Not configured]",
      fullDetails: "[Banking details not configured]",
      configured: false,
    }
  }

  const fullDetails = [
    trustAccount.bank_name,
    trustAccount.account_holder,
    trustAccount.account_number ? `Acc: ${trustAccount.account_number}` : null,
    trustAccount.branch_code ? `Branch: ${trustAccount.branch_code}` : null,
  ].filter(Boolean).join(" | ")

  return {
    bankName: trustAccount.bank_name || "[Not configured]",
    accountHolder: trustAccount.account_holder || "[Not configured]",
    accountNumber: trustAccount.account_number || "[Not configured]",
    branchCode: trustAccount.branch_code || "[Not configured]",
    fullDetails,
    configured: true,
  }
}
