"use server"

/**
 * Server-action wrappers for portfolio fetch functions.
 *
 * WHY: The browser Supabase client (PUBLISHABLE_DEFAULT_KEY) cannot propagate
 * auth.uid() into Postgres RLS context, so React Query re-fetches from the
 * browser return empty rows. These server actions use gateway() (service role)
 * and are used as queryFn in all useQuery() calls instead of browser fetches.
 */

import { gateway } from "@/lib/supabase/gateway"
import {
  fetchTenants,
  fetchLandlords,
  fetchContractors,
  fetchLeases,
  fetchInspections,
  fetchMaintenance,
  fetchApplications,
  fetchPayments,
} from "./portfolio"

export async function fetchLeasesAction(_orgId?: string) {
  const gw = await gateway()
  if (!gw) return []
  return fetchLeases(gw.db, gw.orgId)
}

export async function fetchTenantsAction(_orgId?: string) {
  const gw = await gateway()
  if (!gw) return []
  return fetchTenants(gw.db, gw.orgId)
}

export async function fetchLandlordsAction(_orgId?: string) {
  const gw = await gateway()
  if (!gw) return []
  return fetchLandlords(gw.db, gw.orgId)
}

export async function fetchContractorsAction(_orgId?: string) {
  const gw = await gateway()
  if (!gw) return []
  return fetchContractors(gw.db, gw.orgId)
}

export async function fetchInspectionsAction(_orgId?: string) {
  const gw = await gateway()
  if (!gw) return []
  return fetchInspections(gw.db)
}

export async function fetchMaintenanceAction(_orgId?: string) {
  const gw = await gateway()
  if (!gw) return []
  return fetchMaintenance(gw.db)
}

export async function fetchApplicationsAction(_orgId?: string) {
  const gw = await gateway()
  if (!gw) return []
  return fetchApplications(gw.db)
}

export async function fetchPaymentsAction(_orgId?: string) {
  const gw = await gateway()
  if (!gw) return []
  return fetchPayments(gw.db)
}
