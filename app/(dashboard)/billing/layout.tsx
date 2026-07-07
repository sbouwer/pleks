/**
 * app/(dashboard)/billing/layout.tsx — Billing section shell: heading + tab bar wrapping all /billing pages
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
