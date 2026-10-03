/**
 * lib/applications/applicationStoragePath.ts — bind a client-supplied storage path to the application it belongs to
 *
 * Auth:   data-only (pure). Used by the applicant document routes before any service-client storage.download().
 * Notes:  Every upload for an application lives under `applications/{orgId}/{applicationId}/…` (co-applicant docs
 *         sit in a `co_{id}/` subfolder beneath it). The applicant-token gate proves the caller owns THIS
 *         application id — but the storage PATH is a separate caller-supplied value. Without binding it to the
 *         owned folder, a token holder for their own application can pass `applications/{victimOrg}/{victimApp}/…`
 *         to the RLS-bypassing service client and read another org's bank statements / IDs / payslips.
 *         *** orgId MUST come from the DB (the application row), never from the path itself. ***
 *
 *         Two guards live here, for two different shapes of untrusted input:
 *         `pathBelongsToSubject` for the routes that receive a whole caller-supplied path, and
 *         `parseDocKey` for the upload routes, which receive a slot key and BUILD the path around it.
 *
 *         The binding is to the SUBJECT, not the application (DECISIONS 2026-10-03, scout R4): a co token reaches
 *         only its own `co_{id}/` folder and the lead token only the root. Binding to the application let any peer
 *         name another party's file and have the service client download it — and send it to the processor.
 */
import { allDocCategoryKeys } from "./docCategories"

/** Whose credential this is — the lead's application token, or one co-applicant's access token. */
export type ApplicantSubject = { kind: "lead" } | { kind: "co"; coId: string }

/** The storage-path prefix every file for an application must sit under. Trailing slash is load-bearing: it stops
 *  `applications/o/abc/` from matching a sibling app whose id starts with `abc` (e.g. `abcd`). */
export function applicationStoragePrefix(orgId: string, applicationId: string): string {
  return `applications/${orgId}/${applicationId}/`
}

/** The folder a subject's own files sit in: the root for the lead, `co_{id}/` beneath it for a co. */
function subjectStoragePrefix(orgId: string, applicationId: string, subject: ApplicantSubject): string {
  const root = applicationStoragePrefix(orgId, applicationId)
  return subject.kind === "lead" ? root : `${root}co_${subject.coId}/`
}

/** The characters a legitimate application storage key is built from — letters, digits, `_`, `-`, `.`, `/`.
 *  A CLOSED SET, deliberately: it contains no `%`, so no percent-encoding can appear at all and the guard
 *  never has to decide how many times to decode. See the note on `pathBelongsToSubject`. */
const SAFE_KEY_CHARS = /^[A-Za-z0-9._/-]+$/

/** True iff `path` is a file directly inside THIS SUBJECT's folder — rejects traversal, empty paths, any path
 *  pointing at another org/application, and any path in another party's folder (a lead path naming `co_x/…`, a
 *  co path naming the root or a sibling's `co_y/…`). `orgId` must be the DB-resolved org, not a segment of `path`.
 *
 *  ⚠ THE `..` SUBSTRING TEST THIS USED TO DO WAS NOT A TRAVERSAL GUARD. `storage-js` interpolates the key
 *  raw into `${url}/object/${path}` with no encoding, and the WHATWG URL parser treats `%2e%2e`, `%2E%2E`,
 *  `.%2e` and `%2e.` as double-dot segments — so `applications/{org}/{app}/%2e%2e/%2e%2e/%2e%2e/{other}/…`
 *  passed BOTH the substring test (no literal `..`) and the prefix test, and then resolved outside the
 *  prefix before fetch sent it. Measured: all three encodings resolve to `/orgB/appB/…`.
 *
 *  The fix is a closed character set, not a longer denylist of encodings. Decode-then-check would force a
 *  decode-depth choice (single decode loses to `%252e`; decode-to-fixpoint has its own failure modes) and
 *  Next's params, URLSearchParams and the storage SDK each decode differently, so a check at one layer can
 *  pass a string the next layer transforms. Forbidding `%` outright makes the question moot. */
export function pathBelongsToSubject(
  orgId: string,
  applicationId: string,
  subject: ApplicantSubject,
  path: string | null | undefined,
): boolean {
  if (!path || !SAFE_KEY_CHARS.test(path)) return false
  // Segment-wise, so a legitimate filename containing dots is unaffected while `a/../b` is not.
  if (path.split("/").some((seg) => seg === "." || seg === "..")) return false
  const prefix = subjectStoragePrefix(orgId, applicationId, subject)
  if (!path.startsWith(prefix)) return false
  // A file, directly in the folder: no deeper segment. This is what keeps the lead out of every `co_*/` folder,
  // which also sits under the lead's prefix.
  const rest = path.slice(prefix.length)
  return rest.length > 0 && !rest.includes("/")
}

/** The extensions an applicant upload may carry — the bucket's MIME allowlist (011 §22), as file extensions. */
const UPLOAD_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png"])

/** The storage path for a new applicant upload, built server-side from validated parts only — never from caller
 *  text. A single slot keeps the canonical key as its name (a re-upload replaces it); a multi slot gets a random
 *  suffix. Null when the slot key or the extension is not one the wizard can produce. */
export function subjectUploadPath(
  orgId: string,
  applicationId: string,
  subject: ApplicantSubject,
  rawDocKey: string | null | undefined,
  rawExt: string | null | undefined,
  single: boolean,
  randomSuffix: string,
): string | null {
  const key = parseDocKey(rawDocKey)
  const ext = typeof rawExt === "string" ? rawExt.toLowerCase() : ""
  if (!key || !UPLOAD_EXTENSIONS.has(ext) || !/^[a-f0-9]{8}$/.test(randomSuffix)) return null
  const name = single ? key.canonical : `${key.canonical}_${randomSuffix}`
  return `${subjectStoragePrefix(orgId, applicationId, subject)}${name}.${ext}`
}

/** A caller-supplied `docKey`, resolved against the closed set of slots the wizard can ask for.
 *  Returns the CANONICAL form built from the matched set member — callers must use `canonical` to build a
 *  storage path and must never re-use the raw input, so the untrusted string cannot reach the sink even if
 *  a decode is introduced somewhere in the chain later.
 *
 *  Shape: a base slug from `allDocCategoryKeys()`, optionally followed by `_<digits>` — the wizard indexes
 *  repeatable slots (`payslips_1`, `other_2`), so a bare set-membership test would reject them.
 *  Returns null for anything else, INCLUDING every traversal spelling: `%2e%2e%2f` is simply not in the set,
 *  whatever it would decode to. */
export interface ParsedDocKey {
  /** The matched set member — never caller-controlled text. */
  key: string
  /** The validated digit run, or null for an unindexed slot. */
  index: string | null
  /** What the caller must use to build the path. */
  canonical: string
}

export function parseDocKey(raw: string | null | undefined): ParsedDocKey | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 64) return null
  // Longest-first: a key that is a prefix of another must not claim the longer key's suffix.
  const keys = [...allDocCategoryKeys()].sort((a, b) => b.length - a.length)
  for (const key of keys) {
    if (raw === key) return { key, index: null, canonical: key }
    if (!raw.startsWith(`${key}_`)) continue
    const index = raw.slice(key.length + 1)
    // Digits only, and bounded — an index is a slot counter, not a free-form discriminator.
    if (!/^\d{1,3}$/.test(index)) continue
    return { key, index, canonical: `${key}_${index}` }
  }
  return null
}
