"use client"

/**
 * hooks/useOrgCapabilities.ts — Client hook for org-type capability flags and copy keys
 *
 * Notes: Wraps useOrg() — returns null while org is loading (treat as loading state, not agency).
 *        Server-side equivalent: getCurrentOrgCapabilities() in lib/auth/server.ts.
 *        All capability-aware client components import from here, not lib/org/capabilities directly.
 */
import { useOrg } from "@/hooks/useOrg"
import { getOrgCapabilities, type OrgCapabilities } from "@/lib/org/capabilities"
import type { OrgType } from "@/lib/constants"

export function useOrgCapabilities(): OrgCapabilities | null {
  const { org } = useOrg()
  if (!org) return null
  const orgType = (org.type as OrgType) ?? "agency"
  const orgName = (org.name as string) ?? ""
  return getOrgCapabilities(orgType, orgName)
}
