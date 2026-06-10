/**
 * app/(dashboard)/finance/trust-ledger/layout.tsx — RBAC P4 tier route guard (Steward+; hard-block)
 *
 * Auth:  Steward tier or higher (canonical; not exempt for owner/admin). The 'finance' capability is already
 *        enforced by the parent finance/layout.tsx — this adds the tier floor for the trust ledger.
 */
import { requireRouteTier } from "@/lib/auth/requireCapability"

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireRouteTier("/finance/trust-ledger")
  return children
}
