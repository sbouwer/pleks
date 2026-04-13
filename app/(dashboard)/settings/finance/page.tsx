"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useOrg } from "@/hooks/useOrg"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DepositInterestConfig } from "@/components/deposits/DepositInterestConfig"
import { BankFeedSection } from "@/components/finance/BankFeedSection"

interface Property {
  id: string
  name: string
}

export default function FinanceSettingsPage() {
  const { orgId, org } = useOrg()
  const [currentPrime, setCurrentPrime] = useState<number | null>(null)
  const [properties, setProperties] = useState<Property[]>([])

  const tier = (org as Record<string, unknown> | null)?.tier as string | null | undefined

  useEffect(() => {
    if (!orgId) return
    const supabase = createClient()

    supabase
      .from("prime_rates")
      .select("rate_percent")
      .order("effective_date", { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) setCurrentPrime(data.rate_percent)
      })

    supabase
      .from("properties")
      .select("id, name")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .order("name")
      .then(({ data }) => {
        if (data) setProperties(data)
      })
  }, [orgId])

  return (
    <div>
      <h1 className="font-heading text-3xl mb-2">Finance</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Configure deposit interest rates and live bank feeds.
      </p>

      <DepositInterestConfig
        currentPrime={currentPrime}
        title="Deposit interest — Organisation default"
      />

      {properties.length > 0 && (
        <div className="mt-6">
          <h2 className="font-heading text-lg mb-3">Property overrides</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Set a property-specific rate if the deposit account for that property earns a different rate.
          </p>
          <div className="space-y-3">
            {properties.map((p) => (
              <DepositInterestConfig
                key={p.id}
                propertyId={p.id}
                currentPrime={currentPrime}
                title={`${p.name}`}
              />
            ))}
          </div>
        </div>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">Bank Feeds</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Connect your trust or business account for automatic daily transaction sync. Transactions are matched automatically using the reconciliation engine.
          </p>
          <BankFeedSection tier={tier ?? null} />
        </CardContent>
      </Card>
    </div>
  )
}
