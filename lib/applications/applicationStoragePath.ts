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
 */

/** The storage-path prefix every file for an application must sit under. Trailing slash is load-bearing: it stops
 *  `applications/o/abc/` from matching a sibling app whose id starts with `abc` (e.g. `abcd`). */
export function applicationStoragePrefix(orgId: string, applicationId: string): string {
  return `applications/${orgId}/${applicationId}/`
}

/** True iff `path` is a file inside this application's owned folder — rejects `..` traversal, empty paths, and any
 *  path pointing at another org/application. `orgId` must be the DB-resolved org, not a segment of `path`. */
export function pathBelongsToApplication(
  orgId: string,
  applicationId: string,
  path: string | null | undefined,
): boolean {
  if (!path || path.includes("..")) return false
  return path.startsWith(applicationStoragePrefix(orgId, applicationId))
}
