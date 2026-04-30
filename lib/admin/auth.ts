/**
 * lib/admin/auth.ts — Admin session gate helpers
 *
 * Auth:   pleks_admin_token cookie verified via HMAC (verifyAdminToken)
 * Notes:  Cookie holds a signed token from signAdminToken — NOT the raw ADMIN_SECRET.
 *         requireAdminAuth() for server components (redirects); isAdminAuthenticated() for API routes.
 */
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { verifyAdminToken } from "@/lib/auth/admin-token"

/** Server-component gate — redirects to /admin/login if the session is invalid or expired. */
export async function requireAdminAuth(): Promise<void> {
  const cookieStore = await cookies()
  const token = cookieStore.get("pleks_admin_token")?.value
  const valid = await verifyAdminToken(token, process.env.ADMIN_SECRET)
  if (!valid) redirect("/admin/login")
}

/** API-route gate — returns true if the admin session cookie is valid. */
export async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get("pleks_admin_token")?.value
  return verifyAdminToken(token, process.env.ADMIN_SECRET)
}
