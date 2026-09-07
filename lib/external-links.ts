/**
 * lib/external-links.ts — registry of every external URL referenced across the public site
 *
 * Auth:   public (imported by the legal pages that render these links)
 * Notes:  All external links in legal documents MUST be referenced via this registry — it is what
 *         the PAGES render. It is NOT what the link-check cron reads.
 *
 *         ⚠ TWO COPIES, ONE PAIR OF EYES. /api/cron/check-links reads the `external_links` TABLE
 *         (seeded from 010 §20, admin-editable at /admin/external-links) — never this file. So a
 *         URL fixed only here still shows green while the pages link somewhere else, and a URL
 *         fixed only in the DB leaves the pages pointing at the dead one. Fixing a link means all
 *         THREE: this constant, the 010 §20 seed (so a fresh replay is right), and the live row
 *         (010 §53 is the pattern — a guarded UPDATE that no-ops if an admin already changed it).
 *
 *         ⚠ ORDER: CODE FIRST, DB LAST. When two copies must agree and cannot move atomically,
 *         move the MONITORED copy last. The cron watches the table, so DB-first means it checks
 *         the corrected URL while users are still served the stale one — green, and the green has
 *         stopped meaning anything. Code-first means users get the new URL while the cron still
 *         checks the old one, so it goes red only if the old one has genuinely broken. Prefer a
 *         false alarm over a false all-clear. Scope: VALUE corrections follow the code; SCHEMA
 *         additions precede it, because additive DDL unblocks code rather than contradicting it.
 *
 *         Prefer the CANONICAL url — the one that answers 200 with no redirect. Every hop is a
 *         host or slug that can rot independently: `www.sahrc.org.za` 301'd to the apex and it was
 *         the www host that returned the 500s behind the 2026-08-31 alert (2026-09-07 sweep).
 */

export const EXTERNAL_LINKS = {
  // Regulatory bodies
  informationRegulator: "https://inforegulator.org.za",
  sahrc:                "https://sahrc.org.za",

  // Browser cookie management guides (used in cookie-policy §05)
  chromeCookieHelp:  "https://support.google.com/chrome/answer/95647",
  firefoxCookieHelp: "https://support.mozilla.org/kb/clear-cookies-and-site-data-firefox",
  safariCookieHelp:  "https://support.apple.com/guide/safari/manage-cookies-sfri11471/mac",
  edgeCookieHelp:    "https://support.microsoft.com/en-us/edge/manage-cookies-in-microsoft-edge-view-allow-block-delete-and-use",

  // Third-party service policies
  payfastPrivacy: "https://payfast.io/privacy-policy/",

  // Pleks infrastructure
  statusPage: "https://status.pleks.co.za",
} as const
