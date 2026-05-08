/**
 * app/(public)/terms/[version]/page.tsx — Archived ToS version viewer
 *
 * Route:  /terms/[version] (e.g. /terms/v3.4.0)
 * Auth:   public
 * Data:   legal-archive Storage bucket (service client — private bucket)
 * Notes:  Serves HTML snapshots of historical ToS versions. Not indexed (robots noindex).
 *         HTML is uploaded at deploy time via scripts/export-legal-versions.ts (or manually
 *         until that script exists). Returns 404 for unknown versions or missing archives.
 */
import { notFound } from "next/navigation"
import { createServiceClient } from "@/lib/supabase/server"
import type { Metadata } from "next"

interface Props {
  params: Promise<{ version: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { version } = await params
  return {
    title: `Terms of Service ${version} — Pleks (archived)`,
    robots: { index: false },
  }
}

export default async function ArchivedTermsPage({ params }: Props) {
  const { version } = await params

  if (!/^v\d+\.\d+\.\d+$/.test(version)) return notFound()

  const supabase = await createServiceClient()
  const { data, error } = await supabase.storage
    .from("legal-archive")
    .download(`terms/${version}.html`)

  if (error || !data) return notFound()

  const html = await data.text()

  return (
    <div
      dangerouslySetInnerHTML={{ __html: html }}
      style={{ maxWidth: 900, margin: "0 auto", padding: "2rem" }}
    />
  )
}
