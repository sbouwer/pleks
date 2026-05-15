/**
 * app/(public)/privacy/versions/[version]/page.tsx — Specific privacy policy version view
 *
 * Route:  /privacy/versions/:version
 * Auth:   public
 * Data:   privacy_policy_versions WHERE version = :version (public SELECT)
 * Notes:  D-POPIA-08: immutable versioned policy. Used when consent_log references a
 *         specific policy version. body_html rendered directly (pre-compiled at publish time).
 */
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { createServiceClient } from "@/lib/supabase/server"
import { Lock, ArrowLeft } from "lucide-react"

interface PolicyVersion {
  version: string
  title: string
  body_html: string
  change_type: string
  change_summary: string | null
  effective_from: string
  superseded_at: string | null
  is_current: boolean
}

export async function generateMetadata({
  params,
}: Readonly<{ params: Promise<{ version: string }> }>): Promise<Metadata> {
  const { version } = await params
  return {
    title: `Privacy policy v${version} — Pleks`,
    description: `Archived version ${version} of the Pleks Privacy Notice.`,
  }
}

export default async function PrivacyVersionPage({
  params,
}: Readonly<{ params: Promise<{ version: string }> }>) {
  const { version } = await params

  const db = createServiceClient()
  const { data, error } = await (await db)
    .from("privacy_policy_versions")
    .select("version, title, body_html, change_type, change_summary, effective_from, superseded_at, is_current")
    .eq("version", version)
    .single()

  if (error || !data) notFound()

  const v = data as PolicyVersion

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 space-y-6">
      <Link
        href="/privacy/versions"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Version history
      </Link>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            POPIA · Privacy notice · Version {v.version}
          </p>
          {v.is_current && (
            <span className="text-xs bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-medium">
              Current
            </span>
          )}
        </div>
        <h1 className="text-3xl font-heading font-semibold">{v.title}</h1>

        <div className="mt-3 space-y-1 text-sm text-muted-foreground">
          <p>Effective: {new Date(v.effective_from).toLocaleDateString("en-ZA")}</p>
          {v.superseded_at && (
            <p>Superseded: {new Date(v.superseded_at).toLocaleDateString("en-ZA")}</p>
          )}
          {v.change_summary && (
            <p>
              {v.change_type === "material" && (
                <span className="text-amber-700 font-medium">Material change — </span>
              )}
              {v.change_summary}
            </p>
          )}
        </div>
      </div>

      {!v.is_current && (
        <div className="p-3 border border-amber-200 bg-amber-50 rounded-md text-xs text-amber-900">
          This is an archived version of the Pleks Privacy Notice. The current version is at{" "}
          <Link href="/privacy" className="underline font-medium">pleks.co.za/privacy</Link>.
        </div>
      )}

      {/* Pre-compiled HTML from publish time — safe to render directly */}
      <div
        className="prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: v.body_html }}
      />

      <div className="flex items-center gap-2 text-xs text-muted-foreground p-3 border rounded-md">
        <Lock className="size-3.5 shrink-0" />
        <span>
          This policy text is immutable. Version {v.version} was published on{" "}
          {new Date(v.effective_from).toLocaleDateString("en-ZA")} and cannot be changed.
        </span>
      </div>
    </div>
  )
}
