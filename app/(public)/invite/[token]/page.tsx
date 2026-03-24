"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { toast } from "sonner"

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  property_manager: "Property Manager",
  agent: "Letting Agent",
  accountant: "Accountant",
  maintenance_manager: "Maintenance Manager",
  tenant: "Tenant",
  contractor: "Contractor",
}

interface Invite {
  id: string
  email: string
  role: string
  org_id: string
  accepted_at: string | null
  expires_at: string
  organisations: { name: string }
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const [invite, setInvite] = useState<Invite | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fullName, setFullName] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function loadInvite() {
      const supabase = createClient()
      const { data, error: fetchError } = await supabase
        .from("invites")
        .select("id, email, role, org_id, accepted_at, expires_at, organisations(name)")
        .eq("token", token)
        .single()

      if (fetchError || !data) {
        setError("This invitation link is invalid.")
        setLoading(false)
        return
      }

      const inv = data as unknown as Invite

      if (inv.accepted_at) {
        router.push("/login")
        return
      }

      if (new Date(inv.expires_at) < new Date()) {
        setError("This invitation has expired. Ask for a new one.")
        setLoading(false)
        return
      }

      setInvite(inv)
      setLoading(false)
    }
    loadInvite()
  }, [token, router])

  async function handleAccept(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!invite) return
    setSubmitting(true)

    const supabase = createClient()

    // Check if user already exists
    const { data: { user: existingUser } } = await supabase.auth.getUser()

    if (existingUser && existingUser.email === invite.email) {
      // Existing user — just accept
      await acceptInvite(supabase, invite, existingUser.id)
      return
    }

    // New user — sign up
    const { data: signupData, error: signupError } = await supabase.auth.signUp({
      email: invite.email,
      password,
      options: { data: { full_name: fullName } },
    })

    if (signupError || !signupData.user) {
      toast.error(signupError?.message || "Failed to create account")
      setSubmitting(false)
      return
    }

    await acceptInvite(supabase, invite, signupData.user.id)
  }

  async function acceptInvite(
    supabase: ReturnType<typeof createClient>,
    inv: Invite,
    userId: string
  ) {
    // Create user_orgs membership
    const { error: orgError } = await supabase.from("user_orgs").insert({
      user_id: userId,
      org_id: inv.org_id,
      role: inv.role,
    })

    if (orgError) {
      toast.error("Failed to join organisation")
      setSubmitting(false)
      return
    }

    // Mark invite accepted
    await supabase
      .from("invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", inv.id)

    toast.success("Invitation accepted!")

    // Redirect based on role
    if (inv.role === "tenant") {
      router.push("/portal")
    } else if (inv.role === "contractor") {
      router.push("/contractor")
    } else {
      router.push("/dashboard")
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading invitation...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle className="font-heading text-2xl">Invalid Invitation</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  if (!invite) return null

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="font-heading text-3xl text-brand">Pleks</CardTitle>
          <CardDescription>
            You&apos;ve been invited to <strong>{invite.organisations.name}</strong>{" "}
            as <strong>{ROLE_LABELS[invite.role] || invite.role}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAccept} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">Minimum 8 characters</p>
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Accepting..." : "Accept Invitation"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
