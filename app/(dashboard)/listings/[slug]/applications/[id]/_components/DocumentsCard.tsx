/**
 * app/(dashboard)/listings/[slug]/applications/[id]/_components/DocumentsCard.tsx
 * Documents the applicant uploaded — fetched from the application-docs bucket, grouped + LABELLED by upload
 * category (deriveDocCategories/categoryForFilename), with short-lived signed-URL view links.
 *
 * Auth:   gatewaySSR (org-scoped service client). The ID-document category is reveal-gated (canViewId) like the
 *         ID number — other docs are viewable by the processing agent.
 * Data:   application-docs storage (prefix applications/{orgId}/{applicationId}).
 * Notes:  Raw filenames are never shown (they can carry an embedded ID number) — only the category label + View.
 *         Presence only; contents are verified in the Step-2 deep scan.
 *         Every signed-URL mint writes an audit row — who, which paths (DECISIONS 2026-10-03: a document view is
 *         evidence). Only the links actually rendered are minted: a reveal-gated ID gets no URL at all.
 */
import { gatewaySSR } from "@/lib/supabase/gateway"
import { DetailCard } from "@/components/detail/DetailCard"
import { deriveDocCategories, categoryForFilename } from "@/lib/applications/docCategories"
import { recordAudit } from "@/lib/audit/recordAudit"

const SIGNED_URL_SECONDS = 3600

export async function DocumentsCard({ applicationId, incomeKeys, employmentType, canViewId }: Readonly<{
  applicationId: string; incomeKeys: string[]; employmentType: string; canViewId: boolean
}>) {
  const gw = await gatewaySSR()
  if (!gw) return null
  const { db, orgId, userId } = gw
  const cats = deriveDocCategories(new Set(incomeKeys), employmentType)
  const prefix = `applications/${orgId}/${applicationId}`

  const { data: files, error } = await db.storage.from("application-docs").list(prefix, { limit: 200 })
  if (error) console.error("DocumentsCard list failed:", error.message)
  const realFiles = (files ?? []).filter((f) => f.name.includes("."))   // skip co-applicant subfolders (no extension)

  const paths = realFiles
    .filter((f) => canViewId || categoryForFilename(f.name, cats) !== "id")
    .map((f) => `${prefix}/${f.name}`)
  const signedRes = paths.length > 0 ? await db.storage.from("application-docs").createSignedUrls(paths, SIGNED_URL_SECONDS) : { data: [] }
  const minted = (signedRes.data ?? []).filter((s) => s.signedUrl).map((s) => s.path as string)
  if (minted.length > 0) {
    await recordAudit(db, {
      orgId, actorId: userId, action: "NOTE", table: "applications", recordId: applicationId,
      after: { action: "application_documents_url_minted", paths: minted, expires_in_seconds: SIGNED_URL_SECONDS },
    })
  }
  const urlByPath = new Map((signedRes.data ?? []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl as string]))

  const groups = new Map<string, { label: string; urls: string[] }>()
  for (const f of realFiles) {
    const key = categoryForFilename(f.name, cats)
    const label = cats.find((c) => c.key === key)?.label ?? "Other documents"
    const url = urlByPath.get(`${prefix}/${f.name}`)
    const group = groups.get(key) ?? { label, urls: [] }
    if (url) group.urls.push(url)
    groups.set(key, group)
  }
  const items = [...groups.entries()]

  return (
    <DetailCard title="Documents" count={realFiles.length || undefined}>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents uploaded.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {items.map(([key, group]) => (
            <li key={key} className="flex items-center justify-between gap-3">
              <span className="text-foreground">{group.label}{group.urls.length > 1 && <span className="text-muted-foreground"> · {group.urls.length} files</span>}</span>
              {key === "id" && !canViewId
                ? <span className="text-xs text-muted-foreground">uploaded · reveal-gated</span>
                : (
                  <span className="flex gap-2">
                    {group.urls.map((u, i) => (
                      <a key={`${key}-${i}`} href={u} target="_blank" rel="noopener noreferrer" className="text-xs text-brand hover:underline">View{group.urls.length > 1 ? ` ${i + 1}` : ""}</a>
                    ))}
                  </span>
                )}
            </li>
          ))}
          <li className="pt-1.5 text-xs text-muted-foreground border-t border-border">Uploaded, unverified — contents are checked in the Step-2 deep scan.</li>
        </ul>
      )}
    </DetailCard>
  )
}
