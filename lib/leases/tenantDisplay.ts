interface PersonInput {
  id: string
  firstName?: string | null
  lastName?: string | null
  companyName?: string | null
  entityType?: string | null
}

export interface TenantInfo {
  tenantId: string
  name: string
  initials: string
}

export interface LeaseTenantsDisplay {
  primary: TenantInfo
  coTenants: TenantInfo[]
  displayText: string // "Sarah Mbeki", "Sarah Mbeki & David Nkosi", "Sarah Mbeki +2"
}

function resolveName(p: PersonInput): string {
  if (p.entityType === "organisation" && p.companyName) return p.companyName
  return `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() || "Unknown"
}

export function getInitials(p: PersonInput): string {
  if (p.entityType === "organisation" && p.companyName) {
    return p.companyName.slice(0, 2).toUpperCase()
  }
  const first = p.firstName?.[0] ?? ""
  const last = p.lastName?.[0] ?? ""
  return (first + last).toUpperCase() || "?"
}

export function buildTenantDisplay(
  primary: PersonInput,
  coTenants: PersonInput[],
): LeaseTenantsDisplay {
  const primaryName = resolveName(primary)
  const primaryInfo: TenantInfo = {
    tenantId: primary.id,
    name: primaryName,
    initials: getInitials(primary),
  }

  const coTenantInfos: TenantInfo[] = coTenants.map((ct) => ({
    tenantId: ct.id,
    name: resolveName(ct),
    initials: getInitials(ct),
  }))

  let displayText = primaryName
  if (coTenantInfos.length === 1) {
    displayText = `${primaryName} & ${coTenantInfos[0].name}`
  } else if (coTenantInfos.length > 1) {
    displayText = `${primaryName} +${coTenantInfos.length}`
  }

  return { primary: primaryInfo, coTenants: coTenantInfos, displayText }
}
