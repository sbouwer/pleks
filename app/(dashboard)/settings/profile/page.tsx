import { redirect } from "next/navigation"
import { getServerUser } from "@/lib/auth/server"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import Link from "next/link"

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
          <Link href="/settings/profile/signature" className="text-sm text-brand hover:underline">
            Manage signature →
          </Link>
        </CardContent>
      </Card>

      {gw && (
        <p className="text-xs text-muted-foreground">
          To update your organisation&apos;s name, logo, and contact details, visit{" "}
          <Link href="/settings/details" className="underline">Settings → Details</Link>.
        </p>
      )}
    </div>
  )
}
