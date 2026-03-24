"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useOrg } from "@/hooks/useOrg"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Check, AlertTriangle } from "lucide-react"

const SCOPE_LABELS: Record<string, string> = {
  own_only: "Only my own properties",
  own_and_others: "My own + properties for others",
  others_only: "Only properties belonging to other people",
}

const PPRA_LABELS: Record<string, string> = {
  registered: "Registered",
  pending: "Registration in progress",
  not_registered: "Not registered",
  unknown: "Not specified",
}

interface OrgCompliance {
  management_scope: string | null
  property_types: string[]
  ppra_status: string | null
  ppra_ffc_number: string | null
  has_deposit_account: boolean | null
  deposit_account_type: string | null
  has_trust_account: boolean | null
  trust_account_confirmed_at: string | null
}

export default function CompliancePage() {
  const { orgId } = useOrg()
  const [org, setOrg] = useState<OrgCompliance | null>(null)

  useEffect(() => {
    if (!orgId) return
    const supabase = createClient()
    supabase
      .from("organisations")
      .select(
        "management_scope, property_types, ppra_status, ppra_ffc_number, has_deposit_account, deposit_account_type, has_trust_account, trust_account_confirmed_at"
      )
      .eq("id", orgId)
      .single()
      .then(({ data }) => setOrg(data as OrgCompliance | null))
  }, [orgId])

  if (!org) return null

  const isPractitioner = org.management_scope === "own_and_others" || org.management_scope === "others_only"

  return (
    <div>
      <h1 className="font-heading text-3xl mb-6">Compliance</h1>

      {/* Management scope */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-lg">Your Role</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            {org.management_scope ? SCOPE_LABELS[org.management_scope] : "Not specified"}
          </p>
        </CardContent>
      </Card>

      {/* Property types */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-lg">Property Types</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {(org.property_types || []).map((t) => (
              <span key={t} className="text-sm capitalize px-2 py-1 bg-surface-elevated rounded">
                {t}
              </span>
            ))}
            {(!org.property_types || org.property_types.length === 0) && (
              <span className="text-sm text-muted-foreground">Not specified</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* PPRA status (practitioners only) */}
      {isPractitioner && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">PPRA Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm">
              {org.ppra_status ? PPRA_LABELS[org.ppra_status] : "Unknown"}
            </p>
            {org.ppra_ffc_number && (
              <p className="text-xs text-muted-foreground">FFC: {org.ppra_ffc_number}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Deposit / Trust account */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-lg">
            {isPractitioner ? "Trust Account" : "Deposit Account"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(isPractitioner ? org.has_trust_account : org.has_deposit_account) ? (
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-success" />
              <span className="text-sm">Confirmed</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <span className="text-sm">Not configured — some features restricted</span>
            </div>
          )}
          <Button variant="outline" size="sm" className="mt-3">
            {(isPractitioner ? org.has_trust_account : org.has_deposit_account)
              ? "Update Account"
              : "Add Account"
            }
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
