"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

function getTierSuggestion(units: number): string {
  if (units <= 1) return "Owner tier (free) is perfect for you"
  if (units <= 10) return "Steward tier (R 599/mo) suits you well"
  if (units <= 30) return "Portfolio tier (R 999/mo) is built for your scale"
  return "Firm tier (R 2,499/mo) gives you everything"
}

export default function ReceivablesPage() {
  const [receivables, setReceivables] = useState("")
  const [units, setUnits] = useState("")
  const [propertyTypes, setPropertyTypes] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  function togglePropertyType(type: string) {
    setPropertyTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (propertyTypes.length === 0) {
      toast.error("Select at least one property type")
      return
    }
    setLoading(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: membership } = await supabase
      .from("user_orgs")
      .select("org_id")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .single()

    if (!membership) return

    const amountCents = Math.round(parseFloat(receivables.replace(/[^\d.]/g, "")) * 100) || 0

    await supabase
      .from("organisations")
      .update({
        monthly_receivables_cents: amountCents,
        property_types: propertyTypes,
      })
      .eq("id", membership.org_id)

    router.push("/onboarding/trust")
  }

  const unitCount = parseInt(units) || 0

  return (
    <div>
      <h2 className="font-heading text-2xl mb-1">What&apos;s your rental portfolio?</h2>
      <p className="text-muted-foreground text-sm mb-6">
        This helps us recommend the right plan for you.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="receivables">Total monthly rental income (ZAR) *</Label>
          <Input
            id="receivables"
            value={receivables}
            onChange={(e) => setReceivables(e.target.value)}
            placeholder="e.g. R 85,000"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="units">Approximate number of units you manage</Label>
          <Input
            id="units"
            type="number"
            min="1"
            value={units}
            onChange={(e) => setUnits(e.target.value)}
          />
          {unitCount > 0 && (
            <p className="text-sm text-brand">{getTierSuggestion(unitCount)}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Property types *</Label>
          <p className="text-xs text-muted-foreground">
            This determines which legal compliance framework applies to your leases.
          </p>
          <div className="space-y-2 mt-2">
            {[
              { value: "residential", label: "Residential", desc: "Houses, flats, townhouses, apartments" },
              { value: "commercial", label: "Commercial", desc: "Offices, retail, industrial, warehouses" },
              { value: "mixed", label: "Mixed-use", desc: "Properties with both residential and commercial tenants" },
            ].map((type) => (
              <label
                key={type.value}
                className="flex items-start gap-3 p-3 rounded-lg border border-border hover:border-brand/50 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  name="property_types"
                  value={type.value}
                  checked={propertyTypes.includes(type.value)}
                  onChange={() => togglePropertyType(type.value)}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium">{type.label}</p>
                  <p className="text-xs text-muted-foreground">{type.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Saving..." : "Continue"}
        </Button>
      </form>
    </div>
  )
}
