import { createProperty } from "@/lib/actions/properties"
import { getServerOrgMembership } from "@/lib/auth/server"
import { getOrgTier } from "@/lib/tier/getOrgTier"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { PropertyForm } from "../PropertyForm"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft, Lock } from "lucide-react"

export default async function NewPropertyPage() {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  const { org_id: orgId } = membership
  const supabase = await createClient()

  const [tier, countRes] = await Promise.all([
    getOrgTier(orgId),
    supabase.from("properties").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("deleted_at", null),
  ])

  if (tier === "owner") {
    if ((countRes.count ?? 0) >= 1) {
      return (
        <div className="max-w-md mx-auto mt-12">
          <div className="rounded-xl border border-border/60 bg-surface-elevated px-6 py-6 text-center space-y-4">
            <div className="flex justify-center">
              <div className="size-10 rounded-full bg-muted flex items-center justify-center">
                <Lock className="size-5 text-muted-foreground" />
              </div>
            </div>
            <div className="space-y-1">
              <h2 className="font-semibold text-lg">Your plan includes 1 property</h2>
              <p className="text-sm text-muted-foreground">
                Upgrade to Steward to manage up to 20 units across multiple properties.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-1">
              <Button variant="outline" size="sm" render={<Link href="/properties" />}>
                <ArrowLeft className="size-3.5 mr-1.5" /> Go back
              </Button>
              <Button size="sm" render={<Link href="/settings/billing" />}>
                Compare plans
              </Button>
            </div>
          </div>
        </div>
      )
    }
  }

  return (
    <div>
      <h1 className="font-heading text-3xl mb-6">Add Property</h1>
      <PropertyForm action={createProperty} />
    </div>
  )
}
