/**
 * app/api/legal/archive/route.ts — Legal HTML snapshot archiver (Vercel deploy hook)
 *
 * Route:  POST /api/legal/archive
 * Auth:   x-deploy-secret header matching ARCHIVE_DEPLOY_SECRET env var
 * Data:   legal-archive Storage bucket (service client); fetches /terms and /privacy HTML
 * Notes:  Called by a Vercel deploy hook after each successful production deploy.
 *         Idempotent per version — skips upload if the versioned file already exists.
 *         Stores HTML at terms/v3.4.0.html and privacy/v4.5.0.html for evidentiary retrieval.
 *         The archived file is the source of truth for /terms/[version] route.
 */
import { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { LEGAL_VERSIONS } from "@/lib/legal-versions"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://pleks.co.za"

export async function POST(req: NextRequest) {
  const secret = process.env.ARCHIVE_DEPLOY_SECRET
  if (!secret || req.headers.get("x-deploy-secret") !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const results: Record<string, string> = {}

  for (const [doc, version, path] of [
    ["terms",   LEGAL_VERSIONS.terms,   "/terms"],
    ["privacy", LEGAL_VERSIONS.privacy, "/privacy"],
  ] as const) {
    const storagePath = `${doc}/${version}.html`

    // Idempotent: skip if this version is already archived
    const { data: existing } = await supabase.storage
      .from("legal-archive")
      .list(doc, { search: `${version}.html` })

    if (existing?.length) {
      results[doc] = `skipped (${version} already archived)`
      continue
    }

    // Fetch rendered HTML from the deployed public page
    let html: string
    try {
      const res = await fetch(`${APP_URL}${path}`, {
        headers: { "User-Agent": "pleks-legal-archiver/1.0" },
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      html = await res.text()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      results[doc] = `fetch failed: ${msg}`
      continue
    }

    const { error: uploadErr } = await supabase.storage
      .from("legal-archive")
      .upload(storagePath, new Blob([html], { type: "text/html; charset=utf-8" }), {
        contentType: "text/html; charset=utf-8",
        upsert: false,
      })

    if (uploadErr) {
      results[doc] = `upload failed: ${uploadErr.message}`
    } else {
      results[doc] = `archived ${version}`
    }
  }

  return Response.json({ ok: true, results })
}
