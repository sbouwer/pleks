/**
 * lib/external-links.ts — registry of every external URL referenced across the public site
 *
 * Auth:   public (imported by legal pages and the daily link-check cron)
 * Notes:  All external links in legal documents MUST be referenced via this registry.
 *         The daily cron at /api/cron/daily HEAD-checks every URL here and emails
 *         ADMIN_EMAIL when any are unreachable. To fix a dead link: update the URL
 *         here — all pages that reference it update automatically.
 */

export const EXTERNAL_LINKS = {
  // Regulatory bodies
  informationRegulator: "https://inforegulator.org.za",
  sahrc:                "https://www.sahrc.org.za",

  // Browser cookie management guides (used in cookie-policy §05)
  chromeCookieHelp:  "https://support.google.com/chrome/answer/95647",
  firefoxCookieHelp: "https://support.mozilla.org/kb/clear-cookies-and-site-data-firefox",
  safariCookieHelp:  "https://support.apple.com/guide/safari/manage-cookies-sfri11471",
  edgeCookieHelp:    "https://support.microsoft.com/en-us/microsoft-edge/delete-cookies-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09",

  // Third-party service policies
  payfastPrivacy: "https://payfast.io/privacy-policy/",

  // Pleks infrastructure
  statusPage: "https://status.pleks.co.za",
} as const

export type ExternalLinkKey = keyof typeof EXTERNAL_LINKS
