import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: applicationId } = await params
  const supabase = await createServiceClient()

  // Mark documents as submitted
  await supabase.from("applications").update({
    stage1_status: "extracting",
  }).eq("id", applicationId)

  // TODO: Trigger Sonnet bank statement extraction via Edge Function
  // For now, mark as pre_screen_complete after a stub delay
  // In production: supabase.functions.invoke('extract-bank-income', { body: { applicationId } })

  // Stub: immediately mark pre_screen_complete
  await supabase.from("applications").update({
    stage1_status: "pre_screen_complete",
    bank_statement_status: "extracted",
  }).eq("id", applicationId)

  return NextResponse.json({ ok: true, status: "extraction_triggered" })
}
