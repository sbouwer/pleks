/**
 * lib/navigation.ts — the one sanctioned full-document navigation in the app
 *
 * Notes:  Client-only. Every caller is crossing an auth boundary or following a route
 *         handler's server redirect, where router.push() is WRONG — see below. Anything
 *         that is merely moving between pages must use useRouter().push() instead.
 */

/**
 * Navigate by replacing the document, deliberately bypassing the Next.js client router.
 *
 * `@next/next/no-location-assign-relative-destination` flags raw `location.href = "/x"`
 * and is right to: for ordinary page-to-page movement a soft push is faster and keeps
 * client state. This helper is the narrow exception, and exists so the exception is
 * NAMED at every call site rather than repeated as sixteen inline eslint pragmas.
 *
 * Two situations genuinely require a new document:
 *
 * 1. AN AUTH BOUNDARY WAS JUST CROSSED — sign-in, sign-out, an ownership/role change.
 *    The App Router caches RSC payloads per segment, so a soft push after clearing a
 *    session can re-render the previously authenticated shell from cache. The bug is
 *    intermittent and cache-dependent, which makes it far worse than a full reload:
 *    it shows a signed-out user their old page. Replacing the document guarantees the
 *    server re-renders everything with the new cookie state.
 *
 * 2. THE TARGET IS A ROUTE HANDLER THAT RETURNS A REDIRECT — notably /auth/resolver.
 *    Client RSC navigation cannot follow a server redirect out of a route handler
 *    cleanly and loops (ERR_TOO_MANY_REDIRECTS). The browser has to follow it.
 *
 * If you are reaching for this for any other reason, you probably want
 * `useRouter().push()`.
 */
export function hardNavigate(url: string): void {
  globalThis.location.href = url
}
