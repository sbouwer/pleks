/**
 * lib/screening/loadApplicationDocuments.ts — the documents a pre-screen pass may read, downloaded with their subject
 *
 * Auth:   none of its own — the caller (app/api/applications/[id]/screen) has bound the token to the application and
 *         checked the lead's stage-1 consent. This module decides which CO-APPLICANTS' files that consent does not cover.
 * Data:   application_documents (via getApplicationDocumentSubjects), application_co_applicants (consent + declined),
 *         Storage bucket application-docs under applications/{org}/{app}/.
 * Notes:  Moved out of the route 2026-10-03 so the co-consent withholding (14W F3) has a test (walker F2, 14w-s0d) — a
 *         Next route file cannot export a non-handler name.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { slotTypeForFilename } from "@/lib/extraction/slotType"
import { getApplicationDocumentSubjects } from "@/lib/applications/documentRegistry"
import type { Document } from "@/lib/extraction/types"
import { logQueryError } from "@/lib/supabase/logQueryError"

const BUCKET = "application-docs"

function mimeFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase()
  if (ext === "pdf") return "application/pdf"
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg"
  if (ext === "png") return "image/png"
  return "application/octet-stream"
}

/** The co_{id} subjects whose documents may be read: live (not declined) AND their own stage-1 consent given. The
 *  application's stage1_consent_given is the LEAD's consent and covers no one else's bank statements (14W F3), so a
 *  co-applicant's files are left unread until that party consents, and never read once they have declined. A failed
 *  read yields the empty set, so every co file is withheld — fail closed. */
async function readableCoSubjects(db: SupabaseClient, appId: string): Promise<Set<string>> {
  const { data, error } = await db
    .from("application_co_applicants")
    .select("id")
    .eq("primary_application_id", appId)
    .eq("stage1_consent_given", true)
    .is("declined_at", null)
  logQueryError("screen co consent", error)
  return new Set((data ?? []).map((c: { id: string }) => `co_${c.id}`))
}

/** The plain files (no dotfiles, no nested folders) directly inside one storage folder. */
async function listFolderFiles(db: SupabaseClient, folder: string): Promise<string[]> {
  const { data, error } = await db.storage.from(BUCKET).list(folder)
  logQueryError("screen storage.list (co subfolder)", error)
  return (data ?? []).filter((f) => f.name && !f.name.startsWith(".") && f.id !== null).map((f) => f.name)
}

/** Enumerate + download every uploaded doc for the application — REGISTRY-DRIVEN (14P 0b.5): each registered doc
 *  is downloaded wherever it lives (root for the primary, co_{id}/ subfolder for a director — subfolders isolate a
 *  co's bank_main from the primary's, fixing the flat-path collision) with its registry subjectRef. A storage-
 *  complete fallback also loads any ROOT file NOT in the registry as 'primary' (legacy/unregistered). Drift (a
 *  registry row whose object is missing, or an unregistered file) is logged, never silently skipped (§3). */
export async function loadDocuments(db: SupabaseClient, orgId: string, appId: string): Promise<Document[]> {
  const prefix = `applications/${orgId}/${appId}`
  const subjects = await getApplicationDocumentSubjects(db, appId) // storage_path → subject_ref (authoritative)
  const readableCos = await readableCoSubjects(db, appId)
  const docs: Document[] = []
  const seen = new Set<string>()
  let missing = 0
  let withheld = 0
  // 1. Registered docs (root OR co_{id}/ subfolder) — registry attribution.
  for (const [path, subjectRef] of subjects) {
    if (subjectRef.startsWith("co_") && !readableCos.has(subjectRef)) { seen.add(path); withheld++; continue }
    const { data: blob, error: dlErr } = await db.storage.from(BUCKET).download(path)
    if (dlErr || !blob) { missing++; continue }
    const filename = path.split("/").pop() ?? path
    docs.push({ path, filename, bytes: new Uint8Array(await blob.arrayBuffer()), mimeType: mimeFromName(filename), slotType: slotTypeForFilename(filename), subjectRef })
    seen.add(path)
  }
  // 2. Storage-complete fallback for UNregistered files (registration failed) — never silently dropped (§3). A root
  //    file → 'primary'; a file inside a co_{id}/ subfolder → that subject (path-derived), so a registration-failed
  //    co-doc is still analysed + attributed correctly, and counted as drift.
  const { data: files, error } = await db.storage.from(BUCKET).list(prefix)
  logQueryError("screen storage.list", error)
  let unregistered = 0
  const addUnregistered = async (path: string, filename: string, subjectRef: string) => {
    if (seen.has(path)) return
    const { data: blob, error: dlErr } = await db.storage.from(BUCKET).download(path)
    if (dlErr || !blob) { logQueryError("screen storage.download", dlErr); return }
    docs.push({ path, filename, bytes: new Uint8Array(await blob.arrayBuffer()), mimeType: mimeFromName(filename), slotType: slotTypeForFilename(filename), subjectRef })
    unregistered++
  }
  for (const f of files ?? []) {
    if (!f.name || f.name.startsWith(".")) continue
    if (f.id === null) {
      // A subject subfolder (co_{id}/) — list it; any file not in the registry is attributed by the folder name.
      if (!f.name.startsWith("co_")) continue
      if (!readableCos.has(f.name)) { withheld++; continue } // no consent from this party, or declined — not listed
      for (const name of await listFolderFiles(db, `${prefix}/${f.name}`)) {
        await addUnregistered(`${prefix}/${f.name}/${name}`, name, f.name)
      }
      continue
    }
    await addUnregistered(`${prefix}/${f.name}`, f.name, "primary")
  }
  if (withheld > 0) console.info(`[screen] ${appId}: ${withheld} co-applicant document(s)/folder(s) withheld — no stage-1 consent from that party, or declined.`)
  if (missing > 0 || unregistered > 0) console.warn(`[screen] ${appId}: ${missing} registry row(s) with a missing object, ${unregistered} unregistered file(s) loaded by path-derived subject (14P §3 drift).`)
  return docs
}
