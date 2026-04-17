import { createServiceClient } from "@/lib/supabase/server"
import {
  computePropertyCompleteness,
  shouldRenderCompletenessWidget,
  type CompletenessSnapshot,
  type CompletenessTopic,
} from "@/lib/properties/computeCompleteness"
import { CompletenessWidget } from "./CompletenessWidget"

interface Props {
  propertyId:           string
  orgId:                string
  isOwnerProBrokerVisible: boolean
}

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

// info_request topic strings → CompletenessTopic
const INFO_REQUEST_TOPIC_MAP: Record<string, CompletenessTopic> = {
  landlord:   "owner",
  insurance:  "insurance",
  broker:     "broker",
  scheme:     "scheme",
  banking:    "banking",
  documents:  "documents",
}

interface PropertyRow {
  id:                              string
  created_at:                      string | null
  scenario_type:                   string | null
  managed_mode:                    string | null
  has_managing_scheme:             boolean | null
  insurance_provider:              string | null
  insurance_policy_number:         string | null
  insurance_renewal_date:          string | null
  insurance_replacement_value_cents: number | null
  landlord_id:                     string | null
  owner_email:                     string | null
  managing_scheme_id:              string | null
  onboarding_completed_pct:        number | null
  onboarding_completed_at:         string | null
  onboarding_widget_dismissed_at:  string | null
}

// ── Data fetchers (kept small to keep cognitive complexity low) ───────────────

async function fetchPendingRequests(
  service: ServiceClient,
  propertyId: string,
): Promise<Partial<Record<CompletenessTopic, string>>> {
  const { data: rows } = await service
    .from("property_info_requests")
    .select("id, topic, status")
    .eq("property_id", propertyId)
    .in("status", ["pending", "sent"])

  const out: Partial<Record<CompletenessTopic, string>> = {}
  for (const row of rows ?? []) {
    const mapped = INFO_REQUEST_TOPIC_MAP[row.topic as string]
    if (mapped && !out[mapped]) out[mapped] = row.id as string
  }
  return out
}

async function fetchLandlordInfo(
  service: ServiceClient,
  landlordId: string | null,
  fallbackEmail: string | null,
): Promise<{ hasOwnerBanking: boolean; ownerEmail: string | null }> {
  if (!landlordId) return { hasOwnerBanking: false, ownerEmail: fallbackEmail }

  const { data: landlord } = await service
    .from("landlords")
    .select("bank_name, bank_account, contact_id")
    .eq("id", landlordId)
    .single()

  if (!landlord) return { hasOwnerBanking: false, ownerEmail: fallbackEmail }

  const hasOwnerBanking = !!(landlord.bank_name && landlord.bank_account)
  if (fallbackEmail || !landlord.contact_id) {
    return { hasOwnerBanking, ownerEmail: fallbackEmail }
  }

  const { data: contact } = await service
    .from("contacts")
    .select("primary_email")
    .eq("id", landlord.contact_id)
    .single()

  return { hasOwnerBanking, ownerEmail: (contact?.primary_email as string | null) ?? null }
}

async function fetchSchemeContact(
  service: ServiceClient,
  schemeId: string | null,
): Promise<boolean> {
  if (!schemeId) return false
  const { data: scheme } = await service
    .from("managing_schemes")
    .select("managing_agent_email, managing_agent_name")
    .eq("id", schemeId)
    .maybeSingle()
  return !!(scheme?.managing_agent_email || scheme?.managing_agent_name)
}

async function fetchUnitsBreakdown(
  service: ServiceClient,
  propertyId: string,
): Promise<{ total: number; detailed: number }> {
  const { data: units } = await service
    .from("units")
    .select("id, bedrooms, bathrooms, size_m2, unit_type")
    .eq("property_id", propertyId)
    .is("deleted_at", null)

  const total = units?.length ?? 0
  const detailed = (units ?? []).filter(unitHasFullDetails).length
  return { total, detailed }
}

function unitHasFullDetails(u: { unit_type: unknown; bedrooms: unknown; bathrooms: unknown; size_m2: unknown }): boolean {
  const isCommercial = typeof u.unit_type === "string" && u.unit_type.startsWith("commercial")
  return isCommercial
    ? u.size_m2 != null
    : u.bedrooms != null && u.bathrooms != null
}

function countInsuranceFields(p: PropertyRow): number {
  return (p.insurance_provider               ? 1 : 0)
       + (p.insurance_policy_number          ? 1 : 0)
       + (p.insurance_renewal_date           ? 1 : 0)
       + (p.insurance_replacement_value_cents ? 1 : 0)
}

// ── Main wrapper ──────────────────────────────────────────────────────────────

export async function CompletenessWidgetWrapper({ propertyId, orgId, isOwnerProBrokerVisible }: Readonly<Props>) {
  const service = await createServiceClient()

  const { data: property, error: propErr } = await service
    .from("properties")
    .select(`
      id, created_at, scenario_type, managed_mode, has_managing_scheme,
      insurance_provider, insurance_policy_number, insurance_renewal_date, insurance_replacement_value_cents,
      landlord_id, owner_email, managing_scheme_id,
      onboarding_completed_pct, onboarding_completed_at, onboarding_widget_dismissed_at
    `)
    .eq("id", propertyId)
    .eq("org_id", orgId)
    .single<PropertyRow>()

  if (propErr || !property) return null
  if (!property.scenario_type) return null    // legacy properties without wizard data

  const [pendingRequests, landlordInfo, hasSchemeContact, unitsBreakdown, brokerCountResult, docCountResult] = await Promise.all([
    fetchPendingRequests(service, propertyId),
    fetchLandlordInfo(service, property.landlord_id, property.owner_email),
    fetchSchemeContact(service, property.managing_scheme_id),
    fetchUnitsBreakdown(service, propertyId),
    service.from("property_brokers").select("id", { count: "exact", head: true }).eq("property_id", propertyId),
    service.from("property_documents").select("id", { count: "exact", head: true }).eq("property_id", propertyId),
  ])

  const snapshot: CompletenessSnapshot = {
    managedMode:           (property.managed_mode as "self_owned" | "managed_for_owner") ?? "self_owned",
    hasLandlord:           !!property.landlord_id,
    hasManagingScheme:     !!property.has_managing_scheme,
    hasSchemeContact,
    insuranceFieldsCount:  countInsuranceFields(property),
    brokerLinked:          (brokerCountResult.count ?? 0) > 0,
    isOwnerProBrokerVisible,
    documentsCount:        docCountResult.count ?? 0,
    unitsTotalCount:       unitsBreakdown.total,
    unitsWithDetailCount:  unitsBreakdown.detailed,
    hasOwnerBanking:       landlordInfo.hasOwnerBanking,
    pendingRequests,
  }

  const result = computePropertyCompleteness(snapshot)

  const shouldRender = shouldRenderCompletenessWidget({
    pct:                         result.pct,
    createdAt:                   property.created_at,
    onboardingCompletedAt:       property.onboarding_completed_at,
    onboardingWidgetDismissedAt: property.onboarding_widget_dismissed_at,
  })

  if (!shouldRender) return null

  return (
    <CompletenessWidget
      propertyId={propertyId}
      pct={result.pct}
      outstanding={result.outstanding}
      ownerEmail={landlordInfo.ownerEmail}
    />
  )
}
