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
