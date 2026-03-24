"use client"

import { useSearchParams } from "next/navigation"
import { useTrustAccount } from "@/hooks/useTrustAccount"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Check, Circle, AlertTriangle } from "lucide-react"
import Link from "next/link"
import { useState, Suspense } from "react"

const CHECKLIST = [
  { key: "org", label: "Organisation created", done: true },
  { key: "property", label: "Add your first property", href: "/properties" },
  { key: "unit", label: "Add a unit", href: "/units" },
  { key: "tenant", label: "Add a tenant", href: "/tenants" },
  { key: "lease", label: "Create a lease", href: "/leases" },
  { key: "inspection", label: "Schedule a move-in inspection", href: "/inspections" },
]

function DashboardContent() {
  const searchParams = useSearchParams()
  const isNewUser = searchParams.get("onboarding") === "complete"
  const { trustAccountRequired, hasConfirmedTrustAccount } = useTrustAccount()
  const [dismissed, setDismissed] = useState(false)

  const showTrustBanner = trustAccountRequired && !hasConfirmedTrustAccount

  return (
    <div>
      <h1 className="font-heading text-3xl mb-6">Dashboard</h1>

      {showTrustBanner && (
        <Card className="mb-6 border-warning/30 bg-warning-bg">
          <CardContent className="flex items-center gap-3 pt-4">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Deposit management restricted</p>
              <p className="text-xs text-muted-foreground">
                Deposit receipts and reconciliation are restricted. Add your trust account to unlock full deposit management.
              </p>
            </div>
            <Button size="sm" variant="outline" render={<Link href="/settings" />}>
              Add Trust Account
            </Button>
          </CardContent>
        </Card>
      )}

      {(isNewUser || !dismissed) && (
        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Welcome to Pleks! Get started:</CardTitle>
            {!isNewUser && (
              <Button variant="ghost" size="sm" onClick={() => setDismissed(true)}>
                Dismiss
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {CHECKLIST.map((item) => (
                <li key={item.key} className="flex items-center gap-3">
                  {item.done ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                  {item.href ? (
                    <Link href={item.href} className="text-sm hover:text-brand transition-colors">
                      {item.label}
                    </Link>
                  ) : (
                    <span className="text-sm">{item.label}</span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Properties", value: "0" },
          { label: "Active Leases", value: "0" },
          { label: "Open Maintenance", value: "0" },
          { label: "Monthly Revenue", value: "R 0" },
        ].map((card) => (
          <Card key={card.label}>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <p className="font-heading text-2xl">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardContent />
    </Suspense>
  )
}
