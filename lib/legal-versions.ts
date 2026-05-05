/**
 * lib/legal-versions.ts — single source of truth for published legal document versions
 *
 * Auth:   public (imported by public legal pages and LegalPageLayout)
 * Notes:  Bump the relevant constant here when publishing a new version of any legal
 *         document. The document header, endstamp, and sidebar version labels all derive
 *         from these values — one change keeps everything in sync.
 */

export const LEGAL_VERSIONS = {
  cookiePolicy:      "v1.2.0",
  creditCheckPolicy: "v1.4.0",
  paiaManual:        "v1.1.0",
  popiaRegister:     "v1.9.0",
  privacy:           "v4.1.0",
  terms:             "v3.2.0",
} as const
