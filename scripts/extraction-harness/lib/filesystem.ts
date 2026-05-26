/**
 * scripts/extraction-harness/lib/filesystem.ts — Load test folders from brief/build/_TEST/
 *
 * Maps folder names to ApplicationArchetype values.
 * residential_single_* (with numeric suffix) all map to "residential-single".
 *
 * Spec: ADDENDUM_14L §4.2
 */
import { readdirSync, readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import type { ApplicationArchetype, Document } from "../../../lib/extraction/types"

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEST_DIR  = join(__dirname, "../../../brief/build/_TEST")

const EXACT_FOLDER_MAP: Record<string, ApplicationArchetype> = {
  residential_single_destressed: "residential-single-destressed",
  residential_single_family:     "residential-single-family",
  residential_single_guarantee:  "residential-single-guarantee",
  residential_multi:             "residential-multi",
  commercial_company_director:   "commercial-single-director",
  commercial_company_directors:  "commercial-multi-director",
}

function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? ""
  if (ext === "pdf")  return "application/pdf"
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg"
  if (ext === "png")  return "image/png"
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  if (ext === "odt")  return "application/vnd.oasis.opendocument.text"
  if (ext === "psd")  return "image/vnd.adobe.photoshop"
  return "application/octet-stream"
}

export interface ApplicationFolder {
  folderName: string
  archetype: ApplicationArchetype | null
  documents: Document[]
}

export function loadTestFolders(): ApplicationFolder[] {
  const entries = readdirSync(TEST_DIR, { withFileTypes: true })
  const folders = entries
    .filter(e => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))

  return folders.map(folder => {
    const folderPath = join(TEST_DIR, folder.name)
    const files = readdirSync(folderPath).filter(f => !f.startsWith("."))

    // Exact match first, then prefix match for residential_single_N variants
    const archetype: ApplicationArchetype | null =
      EXACT_FOLDER_MAP[folder.name] ??
      (folder.name.startsWith("residential_single") ? "residential-single" : null)

    const documents: Document[] = files.map(filename => {
      const filePath = join(folderPath, filename)
      const bytes = new Uint8Array(readFileSync(filePath))
      return {
        path:     `${folder.name}/${filename}`,
        filename,
        bytes,
        mimeType: getMimeType(filename),
      }
    })

    return { folderName: folder.name, archetype, documents }
  })
}
