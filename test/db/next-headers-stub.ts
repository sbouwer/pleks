/**
 * test/db/next-headers-stub.ts — vitest alias target for `next/headers` in DB tests
 *
 * Notes:  DB-integration tests import server code (e.g. lib/supabase/server → createServiceClient)
 *         that statically imports `next/headers`. That module has no meaning outside the Next.js
 *         request runtime. The DB path (createServiceClient) never calls cookies()/headers(), so we
 *         alias the module to these throwing stubs — importing is safe, calling would be a test bug.
 */
export function cookies(): never {
  throw new Error("next/headers cookies() is not available in DB-integration tests")
}
export function headers(): never {
  throw new Error("next/headers headers() is not available in DB-integration tests")
}
export function draftMode(): never {
  throw new Error("next/headers draftMode() is not available in DB-integration tests")
}
