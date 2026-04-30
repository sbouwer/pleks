/**
 * app/(dashboard)/billing/layout.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { BillingTabBar } from "@/components/billing/BillingTabBar"

export default function PaymentsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div>
      <h1 className="font-heading text-3xl mb-4">Billing</h1>
      <BillingTabBar />
      {children}
    </div>
  )
}
