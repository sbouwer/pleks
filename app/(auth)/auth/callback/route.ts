import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next")

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Explicit redirect requested (invite links, etc.) — honour it
      if (next) {
        return NextResponse.redirect(`${origin}${next}`)
      }

      // Role-based routing — same logic as login page
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        return NextResponse.redirect(`${origin}/dashboard`)
      }

      const { data: membership } = await supabase
        .from("user_orgs")
        .select("role")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .limit(1)
        .single()

      if (!membership) {
        return NextResponse.redirect(`${origin}/onboarding`)
      }

      if (membership.role === "tenant") {
        return NextResponse.redirect(`${origin}/portal`)
      }

      if (membership.role === "contractor") {
        return NextResponse.redirect(`${origin}/contractor`)
      }

      return NextResponse.redirect(`${origin}/dashboard`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
