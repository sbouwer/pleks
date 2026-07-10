/**
 * lib/comms/platform-org.ts — the Pleks system org that owns platform-level email
 *
 * Data:   organisations row where is_platform = true (seeded in 010_platform_features.sql §50)
 * Notes:  communication_log.org_id is NOT NULL, so platform mail (security alerts, cron digests, the
 *         contact form) had no org to log against — which is why those handlers bypassed sendEmail and
 *         posted straight to Resend, shipping unbranded, unlogged, and invisible to the delivery webhook.
 *         This org gives that mail a valid org_id and a branding identity: "Pleks", the operator and
 *         POPIA Responsible Party per /privacy — NOT "Yoros", which builds the product but sends no mail.
 *
 *         ⚠ ZERO PRIVILEGE. The org has no members and must never gain any. Admin power lives in
 *         user_orgs.is_admin and the HMAC gate on admin.pleks.co.za. Hanging a permission off membership
 *         in this org would turn org membership into an escalation path.
 *
 *         ⚠ It is NOT a customer. Every "for each org" query must exclude it — see excludePlatformOrg.
 *         The subscription-lifecycle crons would otherwise treat a subscription-less org as a dormant
 *         agency and write dormancy/dunning state against it.
 */

/** Fixed UUID — ...0000/...0001/...0003 are reserved sentinels; do not reuse one. */
export const PLATFORM_ORG_ID = "00000000-0000-0000-0000-000000000002"

/**
 * Filter the platform system org out of an all-org query.
 *
 * Use on every iterator over `organisations` that treats rows as customers. Prefer this over comparing
 * PLATFORM_ORG_ID inline: a named flag is greppable and survives a UUID change, a scattered magic
 * constant rots.
 *
 *   const { data } = await excludePlatformOrg(db.from("organisations").select("id, name"))
 */
export function excludePlatformOrg<T extends { eq(col: string, val: boolean): T }>(query: T): T {
  return query.eq("is_platform", false)
}

/**
 * Render a plain-text ops report as an HTML fragment for sendEmail({ contentHtml }).
 *
 * sendEmail has no `text` channel — the ops crons used to pass Resend a `text:` body directly. Their
 * reports are column-aligned (cron names, HTTP statuses, URLs), so they need a monospace <pre>, not <p>.
 * Escapes first: a broken link's URL can contain `&` or `<`, and these bodies are interpolated, not
 * literal.
 */
export function preformatted(text: string): string {
  const escaped = text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
  return `<pre style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-word;margin:0">${escaped}</pre>`
}
