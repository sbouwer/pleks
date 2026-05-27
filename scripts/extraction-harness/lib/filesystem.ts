/**
 * scripts/extraction-harness/lib/filesystem.ts — Load test folders from brief/build/_TEST/
 *
 * Supplies unitType + applicantCount per folder — the two facts known before any
 * documents are uploaded and used to derive the archetype deterministically.
 *
 * Spec: ADDENDUM_14L §4.2
 */
import { readdirSync, readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import type { UnitType, Document } from "../../../lib/extraction/types"

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEST_DIR  = join(__dirname, "../../../brief/build/_TEST")

interface FolderMeta {
  unitType: UnitType
  applicantCount: number
}

// family, guarantee → residential-multi (2+ people; applicantCount > 1 → residential-multi)
// destressed → residential-single (1 applicant in financial difficulty)
const FOLDER_META: Record<string, FolderMeta> = {
  commercial_company_director:   { unitType: "commercial",   applicantCount: 1 },
  commercial_company_directors:  { unitType: "commercial",   applicantCount: 2 },
  residential_multi:             { unitType: "residential",  applicantCount: 3 },
  residential_single_destressed: { unitType: "residential",  applicantCount: 1 },
  residential_single_family:     { unitType: "residential",  applicantCount: 2 },
  residential_single_guarantee:  { unitType: "residential",  applicantCount: 2 },
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
  unitType: UnitType
  applicantCount: number
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

    // Exact match first; residential_single_N variants default to single
    const meta: FolderMeta = FOLDER_META[folder.name] ?? {
      unitType:       "residential",
      applicantCount: 1,
    }

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

    return { folderName: folder.name, ...meta, documents }
  })
}
