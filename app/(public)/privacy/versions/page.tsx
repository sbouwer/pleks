/**
 * app/(public)/privacy/versions/page.tsx — Historical privacy policy versions index
 *
 * Route:  /privacy/versions
 * Auth:   public
 * Data:   privacy_policy_versions (public SELECT — RLS USING(true))
 * Notes:  D-POPIA-08: immutable versioned policy. Subjects can see the exact policy
 *         text in effect at the time of any prior consent.
 */
import type { Metadata } from "next"
import Link from "next/link"
import { createServiceClient } from "@/lib/supabase/server"
import { ChevronRight, Lock } from "lucide-react"

export const metadata: Metadata = {
  title: "Privacy policy versions — Pleks",
  description: "All historical versions of the Pleks Privacy Notice, preserved as required by POPIA.",
}

interface PolicyVersion {
  version: string
  title: string
  change_type: string
  change_summary: string | null
  effective_from: string
  superseded_at: string | null
  is_current: boolean
}

export default async function PrivacyVersionsPage() {
  const db = createServiceClient()
  const { data: versions, error } = await (await db)
    .from("privacy_policy_versions")
    .select("version, title, change_type, change_summary, effective_from, superseded_at, is_current")
    .order("effective_from", { ascending: false })

  if (error) console.error("privacy versions:", error.message)
  const rows = (versions ?? []) as PolicyVersion[]

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 space-y-8">
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
          POPIA · Privacy notice history
        </p>
        <h1 className="text-3xl font-heading font-semibold mb-3">Privacy policy versions</h1>
        <p className="text-muted-foreground text-sm">
          Every version of the Pleks Privacy Notice is preserved. You can view the exact policy
          text that was in effect at the time of any consent you gave.
        </p>
      </div>

      <div className="space-y-2">
        {rows.map((v) => (
          <Link
            key={v.version}
            href={`/privacy/versions/${v.version}`}
            className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{v.title}</span>
                {v.is_current && (
                  <span className="text-xs bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-medium">
                    Current
                  </span>
                )}
                {v.change_type === "material" && (
                  <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-medium">
                    Material change
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Version {v.version} · Effective {new Date(v.effective_from).toLocaleDateString("en-ZA")}
                {v.superseded_at && ` · Superseded ${new Date(v.superseded_at).toLocaleDateString("en-ZA")}`}
              </p>
              {v.change_summary && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{v.change_summary}</p>
              )}
            </div>
            <ChevronRight className="size-4 text-muted-foreground ml-3 shrink-0" />
          </Link>
        ))}

        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No policy versions published yet.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground p-3 border rounded-md">
        <Lock className="size-3.5 shrink-0" />
        <span>
          Policy versions are immutable — the text of a published version can never be changed.
          Each update creates a new version with a new effective date.
        </span>
      </div>

      <Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground underline">
        ← Current privacy policy
      </Link>
    </div>
  )
}
