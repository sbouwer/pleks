/**
 * app/(dashboard)/settings/profile/page.tsx — User profile page showing account email and signature link
 *
 * Route:  /settings/profile
 * Auth:   getServerUser (Supabase auth)
 * Data:   getServerUser for email; gatewaySSR for org membership check
 */
import { redirect } from "next/navigation"
import { getServerUser } from "@/lib/auth/server"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { InlineLink } from "@/components/ui/actions"

export const metadata = { title: "My Profile" }

export default async function ProfilePage() {
  const user = await getServerUser()
  if (!user) redirect("/login")

  const gw = await gatewaySSR()

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-semibold">My Profile</h1>
        <p className="text-sm text-muted-foreground mt-1">Your personal account details.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
          <CardDescription>Contact support to change your email address.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">Email</Label>
            <p className="text-sm">{user.email}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Signature</CardTitle>
          <CardDescription>Used on lease documents and reports.</CardDescription>
        </CardHeader>
        <CardContent>
          <InlineLink href="/settings/profile/signature">Manage signature</InlineLink>
        </CardContent>
      </Card>

      {gw && (
        <p className="text-xs text-muted-foreground">
          To update your organisation&apos;s name, logo, and contact details, visit{" "}
          <InlineLink href="/settings/details">Settings → Details</InlineLink>.
        </p>
      )}
    </div>
  )
}
