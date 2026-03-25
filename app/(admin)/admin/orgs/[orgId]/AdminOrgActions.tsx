"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { startTrial } from "@/lib/trial/startTrial"

async function activateFoundingAgent(orgId: string) {
  "use server"

  const { createServiceClient } = await import("@/lib/supabase/server")
  const supabase = await createServiceClient()

  const now = new Date()
  const expiresAt = new Date(now)
  expiresAt.setMonth(expiresAt.getMonth() + 24)

  const { error } = await supabase
    .from("subscriptions")
    .update({
      founding_agent: true,
      founding_agent_since: now.toISOString(),
      founding_agent_expires_at: expiresAt.toISOString(),
      founding_agent_price_cents: 29900,
    })
    .eq("org_id", orgId)

  if (error) return { success: false, error: error.message }

  await supabase.from("organisations").update({ founding_agent: true }).eq("id", orgId)

  await supabase.from("audit_log").insert({
    org_id: orgId,
    table_name: "subscriptions",
    record_id: orgId,
    action: "UPDATE",
    new_values: { action: "founding_agent_activated" },
  })

  return { success: true }
}

async function changeTier(orgId: string, newTier: string) {
  "use server"

  const { createServiceClient } = await import("@/lib/supabase/server")
  const supabase = await createServiceClient()

  const { error } = await supabase
    .from("subscriptions")
    .update({ tier: newTier })
    .eq("org_id", orgId)

  if (error) return { success: false, error: error.message }

  await supabase.from("audit_log").insert({
    org_id: orgId,
    table_name: "subscriptions",
    record_id: orgId,
    action: "UPDATE",
    new_values: { action: "tier_changed", tier: newTier },
  })

  return { success: true }
}

export function AdminOrgActions({
  orgId,
  currentTier,
  currentStatus,
  isFoundingAgent,
  trialEndsAt,
}: {
  orgId: string
  currentTier: string
  currentStatus: string
  isFoundingAgent: boolean
  trialEndsAt: string | null
}) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [newTier, setNewTier] = useState(currentTier)

  const canStartTrial =
    currentTier === "owner" && currentStatus === "active" && trialEndsAt === null

  async function handleActivateFoundingAgent() {
    setLoading("founding")
    try {
      const result = await activateFoundingAgent(orgId)
      if (result.success) {
        toast.success("Founding agent activated")
        router.refresh()
      } else {
        toast.error(result.error ?? "Failed to activate founding agent")
      }
    } catch {
      toast.error("Failed to activate founding agent")
    } finally {
      setLoading(null)
    }
  }

  async function handleStartTrial() {
    setLoading("trial")
    try {
      const result = await startTrial(orgId, "steward")
      if (result.success) {
        toast.success(`14-day trial started (ends ${result.trialEndsAt})`)
        router.refresh()
      } else {
        toast.error(result.error ?? "Failed to start trial")
      }
    } catch {
      toast.error("Failed to start trial")
    } finally {
      setLoading(null)
    }
  }

  async function handleChangeTier() {
    if (newTier === currentTier) {
      toast.error("Select a different tier")
      return
    }
    setLoading("tier")
    try {
      const result = await changeTier(orgId, newTier)
      if (result.success) {
        toast.success(`Tier changed to ${newTier}`)
        router.refresh()
      } else {
        toast.error(result.error ?? "Failed to change tier")
      }
    } catch {
      toast.error("Failed to change tier")
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-4">
      {!isFoundingAgent && (
        <Button
          variant="outline"
          disabled={loading === "founding"}
          onClick={handleActivateFoundingAgent}
        >
          {loading === "founding" ? "Activating..." : "Activate founding agent"}
        </Button>
      )}

      {canStartTrial && (
        <Button
          variant="outline"
          disabled={loading === "trial"}
          onClick={handleStartTrial}
        >
          {loading === "trial" ? "Starting..." : "Start 14-day trial"}
        </Button>
      )}

      <div className="flex items-end gap-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Change tier</label>
          <Select value={newTier} onValueChange={(v) => setNewTier(v ?? "owner")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="owner">Owner</SelectItem>
              <SelectItem value="steward">Steward</SelectItem>
              <SelectItem value="portfolio">Portfolio</SelectItem>
              <SelectItem value="firm">Firm</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          disabled={loading === "tier" || newTier === currentTier}
          onClick={handleChangeTier}
        >
          {loading === "tier" ? "Updating..." : "Update"}
        </Button>
      </div>
    </div>
  )
}
