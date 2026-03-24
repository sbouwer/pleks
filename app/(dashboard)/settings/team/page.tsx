"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useOrg } from "@/hooks/useOrg"
import { useTier } from "@/hooks/useTier"
import { TIER_LIMITS } from "@/lib/constants"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { toast } from "sonner"
import { Plus } from "lucide-react"

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  property_manager: "Property Manager",
  agent: "Letting Agent",
  accountant: "Accountant",
  maintenance_manager: "Maintenance Manager",
}

const INVITABLE_ROLES = [
  { value: "property_manager", label: "Property Manager" },
  { value: "agent", label: "Letting Agent" },
  { value: "accountant", label: "Accountant" },
  { value: "maintenance_manager", label: "Maintenance Manager" },
]

interface Member {
  id: string
  user_id: string
  role: string
  user_profiles: { full_name: string | null } | null
}

interface PendingInvite {
  id: string
  email: string
  role: string
  expires_at: string
}

export default function TeamPage() {
  const { orgId } = useOrg()
  const { tier } = useTier()
  const [members, setMembers] = useState<Member[]>([])
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("")
  const [loading, setLoading] = useState(false)

  const usersLimit = TIER_LIMITS[tier].users
  const atLimit = usersLimit !== null && members.length >= usersLimit

  useEffect(() => {
    if (!orgId) return
    const supabase = createClient()

    supabase
      .from("user_orgs")
      .select("id, user_id, role, user_profiles(full_name)")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .then(({ data }) => setMembers((data as unknown as Member[]) || []))

    supabase
      .from("invites")
      .select("id, email, role, expires_at")
      .eq("org_id", orgId)
      .is("accepted_at", null)
      .then(({ data }) => setPendingInvites((data as unknown as PendingInvite[]) || []))
  }, [orgId])

  async function handleInvite() {
    if (!inviteEmail || !inviteRole || !orgId) return
    if (atLimit) {
      toast.error("User limit reached. Upgrade your plan to add more team members.")
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { error } = await supabase.from("invites").insert({
      org_id: orgId,
      email: inviteEmail.trim(),
      role: inviteRole,
      invited_by: user?.id,
    })

    if (error) {
      toast.error("Failed to send invite")
    } else {
      toast.success(`Invite sent to ${inviteEmail}`)
      setInviteEmail("")
      setInviteRole("")
      // Refresh pending
      const { data } = await supabase
        .from("invites")
        .select("id, email, role, expires_at")
        .eq("org_id", orgId)
        .is("accepted_at", null)
      setPendingInvites((data as unknown as PendingInvite[]) || [])
    }
    setLoading(false)
  }

  return (
    <div>
      <h1 className="font-heading text-3xl mb-6">Team</h1>

      {/* Current members */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">
            Members ({members.length}{usersLimit ? `/${usersLimit}` : ""})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {m.user_profiles?.full_name || "Unnamed"}
                  </p>
                </div>
                <StatusBadge status="active" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Pending invites */}
      {pendingInvites.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Pending Invites</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingInvites.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_LABELS[inv.role] || inv.role}
                    </p>
                  </div>
                  <StatusBadge status="pending" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invite form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Invite team member</CardTitle>
        </CardHeader>
        <CardContent>
          {atLimit ? (
            <p className="text-sm text-muted-foreground">
              You&apos;ve reached the user limit for your plan.{" "}
              <a href="/settings/billing" className="text-brand hover:underline">
                Upgrade
              </a>{" "}
              to add more.
            </p>
          ) : (
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="Email address"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1"
              />
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v ?? "")}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  {INVITABLE_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleInvite} disabled={loading || !inviteEmail || !inviteRole}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
