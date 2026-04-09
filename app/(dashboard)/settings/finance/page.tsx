"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useOrg } from "@/hooks/useOrg"
import { DepositInterestConfig } from "@/components/deposits/DepositInterestConfig"

interface Property {
  id: string
  name: string
}

export default function FinanceSettingsPage() {
  const { orgId } = useOrg()
  const [currentPrime, setCurrentPrime] = useState<number | null>(null)
  const [properties, setProperties] = useState<Property[]>([])

  useEffect(() => {
    if (!orgId) return
    const supabase = createClient()

    // Fetch latest prime rate
    supabase
      .from("prime_rates")
      .select("rate_percent")
      .order("effective_date", { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) setCurrentPrime(data.rate_percent)
      })

    // Fetch properties that have overrides
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
        Configure deposit interest rates. The org default applies to all properties unless overridden per property.
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
    </div>
  )
}
