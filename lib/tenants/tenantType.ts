/**
 * lib/tenants/tenantType.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
interface TenantInfo {
  tenant_type: "individual" | "company"
}

interface LeaseInfo {
  lease_type: "residential" | "commercial"
}

export function getTenantRules(tenant: TenantInfo, lease: LeaseInfo) {
  const isJuristic = tenant.tenant_type === "company"

  return {
    rhaProtected: !isJuristic,
    cpaProtected: !isJuristic,
    depositReturnTimeline: isJuristic ? ("contractual" as const) : ("statutory_7_14_21" as const),
    inspectionStatutory: !isJuristic && lease.lease_type === "residential",
    popiaSensitive: !isJuristic,
    portalAvailable: true,
  }
}
