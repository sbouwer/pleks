/**
 * app/api/legal/archive/route.ts — Legal HTML snapshot archiver
 *
 * Route:  POST /api/legal/archive
 * Auth:   x-deploy-secret header matching ARCHIVE_DEPLOY_SECRET env var
 * Data:   legal-archive Storage bucket (service client); fetches /terms and /privacy HTML
 * Notes:  Run manually after shipping a new legal version (see brief/build/CURRENT.md for curl command).
 *         Idempotent per version — skips upload if the versioned file already exists.
 *         Stores HTML at terms/v3.4.0.html and privacy/v4.5.0.html for evidentiary retrieval.
 *         The archived file is the source of truth for /terms/[version] route.
 */
import { timingSafeEqual } from "node:crypto"
import { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { LEGAL_VERSIONS } from "@/lib/legal-versions"

// Legal pages (/terms, /privacy) live on pleks.co.za (apex), not app.pleks.co.za
const LEGAL_SITE_URL = process.env.LEGAL_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

type SupabaseStorageClient = Awaited<ReturnType<typeof createServiceClient>>

async function archiveDoc(
  supabase: SupabaseStorageClient,
  doc: string,
  version: string,
  path: string,
): Promise<[string, string]> {
  const { data: existing } = await supabase.storage
    .from("legal-archive")
    .list(doc, { search: `${version}.html` })

  if (existing?.length) return [doc, `skipped (${version} already archived)`]

  let html: string
  try {
    const res = await fetch(`${LEGAL_SITE_URL}${path}`, {
      headers: { "User-Agent": "pleks-legal-archiver/1.0" },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    html = await res.text()
  } catch (err) {
    return [doc, `fetch failed: ${err instanceof Error ? err.message : String(err)}`]
  }

  const { error: uploadErr } = await supabase.storage
    .from("legal-archive")
    .upload(`${doc}/${version}.html`, new Blob([html], { type: "text/html; charset=utf-8" }), {
      contentType: "text/html; charset=utf-8",
      upsert: false,
    })

  return [doc, uploadErr ? `upload failed: ${uploadErr.message}` : `archived ${version}`]
}

export async function POST(req: NextRequest) {
  const secret = process.env.ARCHIVE_DEPLOY_SECRET
  const provided = req.headers.get("x-deploy-secret") ?? ""

  if (!secret || !provided) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const secBuf = Buffer.from(secret, "utf8")
  const provBuf = Buffer.from(provided, "utf8")
  const valid = secBuf.length === provBuf.length && timingSafeEqual(secBuf, provBuf)
  if (!valid) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const entries = [
    ["terms",   LEGAL_VERSIONS.terms,   "/terms"],
    ["privacy", LEGAL_VERSIONS.privacy, "/privacy"],
  ] as const

  const results = Object.fromEntries(
    await Promise.all(entries.map(([doc, version, path]) => archiveDoc(supabase, doc, version, path))),
  )

  return Response.json({ ok: true, results })
}
