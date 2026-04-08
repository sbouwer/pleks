import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { triageMaintenanceRequest } from "@/lib/ai/maintenanceTriage"

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { title, description } = await req.json() as { title: string; description: string }
  if (!title?.trim() || !description?.trim()) {
    return NextResponse.json({ error: "title and description required" }, { status: 400 })
  }

  const result = await triageMaintenanceRequest(title, description)
  return NextResponse.json(result)
}
