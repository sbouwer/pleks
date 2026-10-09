/**
 * app/(dashboard)/finance/trust-ledger/close/loading.tsx — deliberately paints nothing
 *
 * Route:  /finance/trust-ledger/close
 * Notes:  The page is client-only and fetches its reconciliation session in an effect, so the server paints a
 *         bare centred "Loading…" and nothing else — there is no header or card to mirror. Without this file the
 *         trust-ledger/loading.tsx skeleton (a different page) would flash first.
 */
export { NoSkeleton as default } from "@/components/ui/page-skeleton"
