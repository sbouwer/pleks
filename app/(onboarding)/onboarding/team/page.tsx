"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Check, Plus, X } from "lucide-react"
import { type Tier } from "@/lib/constants"
import { toast } from "sonner"

const TIERS: { value: Tier; label: string; price: string; features: string[] }[] = [
  {
    value: "owner",
    label: "Owner",
    price: "Free",
    features: ["1 unit", "1 user", "Basic lease & inspections"],
  },
  {
    value: "steward",
    label: "Steward",
    price: "R 599/mo",
    features: ["10 units", "2 users", "Bank recon", "Owner statements", "Reports"],
  },
  {
    value: "portfolio",
    label: "Portfolio",
    price: "R 999/mo",
    features: ["30 units", "5 users", "DebiCheck", "Arrears automation", "Full reporting"],
  },
  {
    value: "firm",
    label: "Firm",
    price: "R 2,499/mo",
    features: ["Unlimited", "HOA module", "Contractor portal", "AI legal docs"],
  },
]

const ROLES = [
  { value: "property_manager", label: "Property Manager" },
  { value: "agent", label: "Letting Agent" },
  { value: "accountant", label: "Accountant" },
  { value: "maintenance_manager", label: "Maintenance Manager" },
]

interface InviteRow {
  email: string
  role: string
}

export default function TeamPage() {
  const router = useRouter()
  const [selectedTier, setSelectedTier] = useState<Tier>("owner")
  const [tierConfirmed, setTierConfirmed] = useState(false)
  const [invites, setInvites] = useState<InviteRow[]>([{ email: "", role: "" }])
  const [loading, setLoading] = useState(false)

  function addInviteRow() {
    setInvites([...invites, { email: "", role: "" }])
  }

  function removeInviteRow(index: number) {
    setInvites(invites.filter((_, i) => i !== index))
  }

  function updateInvite(index: number, field: keyof InviteRow, value: string) {
    const updated = [...invites]
    updated[index] = { ...updated[index], [field]: value }
    setInvites(updated)
  }

  async function handleTierSelect() {
    if (selectedTier === "owner") {
      // Free tier — activate immediately
      setTierConfirmed(true)
      return
    }

    // Paid tier — redirect to PayFast
    // For now, show placeholder (PayFast sandbox needs merchant credentials)
    toast.info("PayFast integration — configure PAYFAST_MERCHANT_ID in .env.local to enable")
    setTierConfirmed(true)
  }

  async function handleFinish() {
    setLoading(true)

    const validInvites = invites.filter((i) => i.email.trim() && i.role)

    if (validInvites.length > 0) {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: membership } = await supabase
        .from("user_orgs")
        .select("org_id")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .single()

      if (membership) {
        for (const invite of validInvites) {
          await supabase.from("invites").insert({
            org_id: membership.org_id,
            email: invite.email.trim(),
            role: invite.role,
            invited_by: user.id,
          })
        }
        toast.success(`${validInvites.length} invite(s) sent`)
      }
    }

    router.push("/dashboard?onboarding=complete")
  }

  if (!tierConfirmed) {
    return (
      <div>
        <h2 className="font-heading text-2xl mb-1">Choose your plan</h2>
        <p className="text-muted-foreground text-sm mb-6">
          You can upgrade or downgrade at any time.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          {TIERS.map((tier) => (
            <button
              key={tier.value}
              type="button"
              onClick={() => setSelectedTier(tier.value)}
              className={`text-left p-4 rounded-lg border transition-colors ${
                selectedTier === tier.value
                  ? "border-brand bg-brand-dim"
                  : "border-border hover:border-brand/50"
              }`}
            >
              <p className="font-medium">{tier.label}</p>
              <p className="font-heading text-xl">{tier.price}</p>
              <ul className="mt-2 space-y-1">
                {tier.features.map((f) => (
                  <li key={f} className="text-xs text-muted-foreground flex items-center gap-1">
                    <Check className="h-3 w-3 text-success" />
                    {f}
                  </li>
                ))}
              </ul>
            </button>
          ))}
        </div>
        <Button className="w-full" onClick={handleTierSelect}>
          {selectedTier === "owner" ? "Start for free" : "Continue to payment"}
        </Button>
      </div>
    )
  }

  return (
    <div>
      <h2 className="font-heading text-2xl mb-1">Invite your team</h2>
      <p className="text-muted-foreground text-sm mb-6">
        Add team members now or skip and invite later from Settings.
      </p>

      <div className="space-y-3 mb-6">
        {invites.map((invite, i) => (
          <div key={i} className="flex gap-2">
            <Input
              type="email"
              placeholder="Email address"
              value={invite.email}
              onChange={(e) => updateInvite(i, "email", e.target.value)}
              className="flex-1"
            />
            <Select value={invite.role} onValueChange={(v) => updateInvite(i, "role", v ?? "")}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {invites.length > 1 && (
              <Button variant="ghost" size="icon" onClick={() => removeInviteRow(i)}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addInviteRow}
          className="text-sm text-brand hover:underline flex items-center gap-1"
        >
          <Plus className="h-3 w-3" /> Add another
        </button>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={() => router.push("/dashboard?onboarding=complete")}>
          Skip for now
        </Button>
        <Button className="flex-1" onClick={handleFinish} disabled={loading}>
          {loading ? "Sending..." : "Send invites & go to dashboard"}
        </Button>
      </div>
    </div>
  )
}
