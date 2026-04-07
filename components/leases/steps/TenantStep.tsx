"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { useOrg } from "@/hooks/useOrg"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle2, UserRound } from "lucide-react"
import Link from "next/link"
import type { WizardData } from "../LeaseWizard"

interface Tenant {
  id: string
  contact: {
    first_name: string
    last_name: string
    primary_phone: string | null
    primary_email: string | null
  } | null
}

function tenantDisplayName(t: Tenant) {
  if (!t.contact) return t.id
  return `${t.contact.first_name} ${t.contact.last_name}`.trim()
}

interface Props {
  data: WizardData
  onBack: () => void
  onNext: (updates: Partial<WizardData>) => void
}

export function TenantStep({ data, onBack, onNext }: Readonly<Props>) {
  const { orgId } = useOrg()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [tenantId, setTenantId] = useState(data.tenantId)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [isPreFilled, setIsPreFilled] = useState(!!data.tenantId && !!data.tenantName)

  useEffect(() => {
    if (!orgId) return
    const supabase = createClient()
    supabase
      .from("tenants")
      .select("id, contact:contacts(first_name, last_name, primary_phone, primary_email)")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .order("contacts(last_name)")
      .then(({ data: rows }) => {
        setTenants((rows as unknown as Tenant[]) ?? [])
        setLoading(false)
      })
  }, [orgId])

  function handleNext() {
    if (!tenantId) { setError("Please select a tenant"); return }
    setError("")
    const tenant = tenants.find((t) => t.id === tenantId)
    onNext({
      tenantId,
      tenantName: tenant ? tenantDisplayName(tenant) : "",
    })
  }

  const selectedTenant = tenants.find((t) => t.id === tenantId)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-xl mb-1">Tenant</h2>
        <p className="text-sm text-muted-foreground">Who is moving in?</p>
      </div>

      {isPreFilled && data.tenantName ? (
        <Card className="border-brand/30 bg-brand/5">
          <CardContent className="pt-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="size-5 text-brand mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm">{data.tenantName}</p>
                  <p className="text-xs text-muted-foreground">Tenant</p>
                </div>
              </div>
              <button
                type="button"
                className="text-xs text-brand hover:underline flex-shrink-0"
                onClick={() => setIsPreFilled(false)}
              >
                Change
              </button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="tenant-select">Tenant *</Label>
          {loading ? (
            <div className="h-9 rounded-lg bg-muted animate-pulse" />
          ) : (
            <Select value={tenantId} onValueChange={(v) => { setTenantId(v ?? ""); setIsPreFilled(false) }}>
              <SelectTrigger id="tenant-select">
                <SelectValue placeholder="Search tenants…">
                  {selectedTenant ? (
                    <span className="flex items-center gap-2">
                      <UserRound className="size-4 text-muted-foreground" />
                      {tenantDisplayName(selectedTenant)}
                    </span>
                  ) : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {tenants.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="font-medium">{tenantDisplayName(t)}</span>
                    {t.contact?.primary_phone && (
                      <span className="text-muted-foreground ml-1 text-xs">· {t.contact.primary_phone}</span>
                    )}
                  </SelectItem>
                ))}
                {tenants.length === 0 && (
                  <SelectItem value="_none" disabled>No tenants found</SelectItem>
                )}
              </SelectContent>
            </Select>
          )}
          <p className="text-xs text-muted-foreground">
            Tenant not listed?{" "}
            <Link
              href={`/tenants/new?returnTo=${encodeURIComponent("/leases/new")}`}
              className="text-brand hover:underline"
            >
              Add new tenant
            </Link>
          </p>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>← Back</Button>
        <Button onClick={handleNext}>Continue →</Button>
      </div>
    </div>
  )
}
