"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { ArrowLeft, Loader2 } from "lucide-react"

interface Property {
  id: string
  name: string
  address_line1: string | null
  city: string | null
}

const ENTITY_TYPES = [
  { value: "body_corporate", label: "Body Corporate (Sectional Title)" },
  { value: "hoa", label: "HOA (Homeowners' Association)" },
  { value: "share_block", label: "Share Block Company" },
  { value: "poa", label: "POA (Property Owners' Association)" },
]

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

export function NewHOAForm({ properties }: Readonly<{ properties: Property[] }>) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    name: "",
    entity_type: "body_corporate",
    property_id: "",
    registration_number: "",
    csos_registration_number: "",
    financial_year_end_month: "2",
    managing_agent_name: "",
    trustees_count: "3",
    registered_address: "",
  })

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { toast.error("Name is required"); return }
    if (!form.property_id) { toast.error("Select a property"); return }

    setSaving(true)
    try {
      const res = await fetch("/api/hoa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          entity_type: form.entity_type,
          property_id: form.property_id,
          registration_number: form.registration_number || undefined,
          csos_registration_number: form.csos_registration_number || undefined,
          financial_year_end_month: parseInt(form.financial_year_end_month, 10),
          managing_agent_name: form.managing_agent_name || undefined,
          trustees_count: parseInt(form.trustees_count, 10) || 3,
          registered_address: form.registered_address || undefined,
        }),
      })
      const data = await res.json() as { id?: string; error?: string }
      if (!res.ok) {
        toast.error(data.error ?? "Failed to create")
        return
      }
      toast.success("HOA entity created")
      router.push(`/hoa/${data.id}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" render={<Link href="/hoa" />}>
          <ArrowLeft className="size-4 mr-1.5" />
          Back
        </Button>
        <div>
          <h1 className="font-heading text-2xl">New HOA / Body Corporate</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Register a community scheme for levy and AGM management.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Entity details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Entity type *</label>
              <select
                value={form.entity_type}
                onChange={(e) => set("entity_type", e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {ENTITY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Name *</label>
              <Input
                placeholder="e.g. Sunset Gardens Body Corporate"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Property *</label>
              <select
                value={form.property_id}
                onChange={(e) => set("property_id", e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— Select property —</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.city ? `, ${p.city}` : ""}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                Units within this property become the HOA&apos;s sections/units.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Registration &amp; compliance</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Registration number</label>
                <Input
                  placeholder="e.g. 2006/003421/08"
                  value={form.registration_number}
                  onChange={(e) => set("registration_number", e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">CSOS registration number</label>
                <Input
                  placeholder="e.g. CSOS/EC/0001234"
                  value={form.csos_registration_number}
                  onChange={(e) => set("csos_registration_number", e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Financial year end</label>
                <select
                  value={form.financial_year_end_month}
                  onChange={(e) => set("financial_year_end_month", e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {MONTHS.map((m, i) => (
                    <option key={i + 1} value={String(i + 1)}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Number of trustees</label>
                <Input
                  type="number"
                  min="1"
                  max="20"
                  value={form.trustees_count}
                  onChange={(e) => set("trustees_count", e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Registered address</label>
              <Input
                placeholder="Physical address for formal correspondence"
                value={form.registered_address}
                onChange={(e) => set("registered_address", e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Managing agent name</label>
              <Input
                placeholder="Leave blank if self-managed"
                value={form.managing_agent_name}
                onChange={(e) => set("managing_agent_name", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? <><Loader2 className="size-4 mr-1.5 animate-spin" />Creating…</> : "Create entity"}
          </Button>
          <Button type="button" variant="ghost" render={<Link href="/hoa" />}>Cancel</Button>
        </div>
      </form>
    </div>
  )
}
