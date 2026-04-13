import { PaymentsTabBar } from "@/components/payments/PaymentsTabBar"

export default function PaymentsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div>
      <h1 className="font-heading text-3xl mb-4">Billing</h1>
      <PaymentsTabBar />
      {children}
    </div>
  )
}
