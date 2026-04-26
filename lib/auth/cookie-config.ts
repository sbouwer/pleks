/**
 * Shared cookie options for all Pleks auth/session cookies.
 *
 * No `domain` attribute — cookies are host-scoped to app.pleks.co.za in
 * production and localhost in dev. The marketing apex never sees auth cookies.
 */
export const AUTH_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
} as const
