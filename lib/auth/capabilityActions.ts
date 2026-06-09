"use server"

/**
 * lib/auth/capabilityActions.ts — client-callable capability hydration (ADDENDUM_RBAC Phase 4)
 *
 * Notes:  Thin server-action wrapper so the client CapabilitiesProvider can hydrate from getMyCapabilities
 *         (which lives in the React.cache'd, non-"use server" can.ts). Affordance hydration only — the
 *         server can()/RLS remain the boundary.
 */
import { getMyCapabilities } from "./can"

export async function fetchMyCapabilities(): Promise<string[]> {
  return getMyCapabilities()
}
