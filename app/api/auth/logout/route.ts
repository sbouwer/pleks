import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"

/**
 * POST /api/auth/logout
 *
 * Signs out the Supabase session and clears the custom org cookies
 * (pleks_org, pleks_has_org). These are httpOnly and cannot be deleted
 * from the browser, so all logout paths must call this endpoint.
 */
export async function POST() {
  const supabase = await createClient()
  await supabase.auth.signOut()

  const cookieStore = await cookies()
  cookieStore.delete("pleks_org")
  cookieStore.delete("pleks_has_org")

  return NextResponse.json({ ok: true })
}
