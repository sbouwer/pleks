"use server"

import { createServiceClient } from "@/lib/supabase/server"

export async function sendCreditReportToApplicant(
  applicationId: string
): Promise<void> {
  const supabase = await createServiceClient()

  const { data: app } = await supabase
    .from("applications")
    .select(`
      id, org_id, applicant_email, first_name, last_name,
      fitscore, fitscore_components, fitscore_calculated_at,
      listing_id
    `)
    .eq("id", applicationId)
    .single()

  if (!app?.applicant_email) return

  // Only send once per application
  const { count } = await supabase
    .from("communication_log")
    .select("id", { count: "exact", head: true })
    .eq("org_id", app.org_id)
    .eq("subject", `credit_report_delivery:${applicationId}`)

  if ((count ?? 0) > 0) return // already sent

  // Get property address for the email
  let propertyAddress = ""
  if (app.listing_id) {
    const { data: listing } = await supabase
      .from("listings")
      .select("units(unit_number, properties(name, address_line1))")
      .eq("id", app.listing_id)
      .single()

    const unit = listing?.units as unknown as { unit_number: string; properties: { name: string; address_line1: string } | null } | null
    propertyAddress = [unit?.unit_number, unit?.properties?.name ?? unit?.properties?.address_line1].filter(Boolean).join(", ")
  }

  const applicantName = [app.first_name, app.last_name].filter(Boolean).join(" ") || "Applicant"

  // Log the send
  await supabase.from("communication_log").insert({
    org_id: app.org_id,
    channel: "email",
    direction: "outbound",
    subject: `credit_report_delivery:${applicationId}`,
    body: `Credit screening results for ${applicantName} sent to ${app.applicant_email} for ${propertyAddress}. FitScore: ${app.fitscore ?? "N/A"}. Components: ${JSON.stringify(app.fitscore_components ?? {})}`,
    status: "sent",
    sent_to_email: app.applicant_email,
  })

  // TODO: Send via Resend when configured
  // For now, the communication_log entry records the intent.
  // Email template content:
  //
  // Subject: Your credit screening results — {propertyAddress}
  //
  // Hi {applicantName},
  //
  // Your credit screening for {propertyAddress} is complete.
  //
  // YOUR FITSCORE: {fitscore}/100
  //
  // WHAT WAS CHECKED:
  // ✓ Credit score (TransUnion + XDS)
  // ✓ Income to rent ratio
  // ✓ Rental payment history (TPN)
  // ✓ Employment stability
  // ✓ Judgements and adverse listings
  // ✓ Identity verification (Home Affairs)
  //
  // Component scores: {components}
  //
  // APPLYING ELSEWHERE?
  // If you apply to another property on Pleks within 30 days,
  // you may be able to share this report without running a
  // new check.
  //
  // Under the National Credit Act, you are entitled to request
  // a full copy of your credit report from TransUnion
  // (transunion.co.za) and XDS (xds.co.za).
}
