/**
 * lib/applications/commercial-html.ts — Pure HTML builders for commercial director emails
 *
 * Auth:   n/a — pure functions, no DB access
 * Notes:  Kept separate from commercial.ts to avoid the "use server" constraint
 *         (all exports in a "use server" file must be async server actions).
 */

export function buildDirectorReminderHtml(params: {
  directorFirstName: string
  primaryContactName: string
  propertyLabel: string
  portalUrl: string
  daysRemaining: number
  stage: "t3" | "t7" | "t10"
  paidByPrimary: boolean
}): string {
  const urgencyNote = params.stage === "t10"
    ? `<p><strong>Final reminder — your portion expires in ${params.daysRemaining} days.</strong> After this, the application will be cancelled and any fees paid will need to be refunded.</p>`
    : `<p>The application is waiting on your portion. You have ${params.daysRemaining} days remaining.</p>`

  const payNote = params.paidByPrimary
    ? `<p>${params.primaryContactName} has already paid for your portion. You only need to give consent and upload your documents.</p>`
    : ""

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body { font-family: -apple-system, sans-serif; color: #111; background: #fff; max-width: 600px; margin: 0 auto; padding: 24px; }
.btn { display: inline-block; background: #111; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 16px 0; }
p { line-height: 1.6; }
</style></head><body>
<p>Hi ${params.directorFirstName},</p>
<p>This is a reminder that your portion of the application for <strong>${params.propertyLabel}</strong> is still outstanding.</p>
${urgencyNote}
${payNote}
<a class="btn" href="${params.portalUrl}">Complete my portion →</a>
<p style="color:#666;font-size:13px;">This link was sent to you by ${params.primaryContactName} via Pleks.</p>
</body></html>`
}
