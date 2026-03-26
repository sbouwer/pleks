import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  const { email } = await req.json()

  if (!email || typeof email !== "string") {
    return NextResponse.json({ exists: false })
  }

  const supabase = await createServiceClient()
  const { data } = await supabase.rpc("check_email_exists", {
    p_email: email.trim(),
  })

  return NextResponse.json({ exists: data === true })
}
