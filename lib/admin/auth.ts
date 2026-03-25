import { cookies } from "next/headers"
import { redirect } from "next/navigation"

/**
 * Call at the top of every admin server component.
 * Redirects to /admin/login if not authenticated.
 * Double-layer with middleware — belt and braces.
 */
export async function requireAdminAuth(): Promise<void> {
  const cookieStore = await cookies()
  const token = cookieStore.get("pleks_admin_token")?.value
  const secret = process.env.ADMIN_SECRET

  if (!secret) {
    throw new Error("ADMIN_SECRET is not configured")
  }
  if (!token || token !== secret) {
    redirect("/admin/login")
  }
}
