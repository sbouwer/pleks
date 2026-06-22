/**
 * app/(applicant)/apply/[slug]/preview/page.tsx — legacy redirect.
 *
 * Route:  /apply/[slug]/preview → /apply/[slug]
 * Notes:  The redesigned wizard was promoted from /preview to the live /apply/[slug]. This permanent redirect
 *         keeps already-sent resume/verify links (which carry ?app&token) working.
 */
import { redirect } from "next/navigation"

export default async function ApplyPreviewRedirect({
  params, searchParams,
}: Readonly<{ params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const { slug } = await params
  const sp = await searchParams
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string") qs.set(k, v)
  const query = qs.toString()
  redirect(`/apply/${slug}${query ? `?${query}` : ""}`)
}
