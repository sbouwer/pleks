"use server"

import { gateway } from "@/lib/supabase/gateway"
import { revalidatePath } from "next/cache"
import { buildProfile, type UniversalAnswers } from "@/lib/properties/buildProfile"
import { buildSkeletonUnits } from "@/lib/properties/skeletonUnits"
import type { ScenarioType } from "@/lib/properties/scenarios"
import { createPropertyInfoRequest } from "./propertyInfoRequests"

// ── Types ─────────────────────────────────────────────────────────────────────

type Db = Awaited<ReturnType<typeof gateway>> extends infer G
  ? G extends { db: infer D } ? D : never
  : never

export interface WizardSavePayload {
  scenarioType:    ScenarioType
  managedMode:     "self_owned" | "managed_for_owner"
  unitCount:       number
  address: {
    formatted:               string
    street_number:           string
    street_name:             string
    suburb:                  string
    city:                    string
    province:                string
    postal_code:             string
    country:                 string
    lat:                     number | null
    lng:                     number | null
    google_place_id:         string | null
    property_name:           string
    erf_number:              string | null
    sectional_title_number:  string | null
  } | null
  universals:      UniversalAnswers | null
  scenarioAnswers: Record<string, unknown>
  operatingHoursPreset:   string | null
  afterHoursAccess:       string | null
  afterHoursNoticeHours:  number | null
  afterHoursNotes:        string | null
  landlord: {
    option:        "existing" | "new" | "later"
    existing_id?:  string
    entity_type?:  "individual" | "company" | "trust"
    first_name?:   string
    last_name?:    string
    company_name?: string
    email?:        string
    phone?:        string
    later_track?:  "owner_email" | "self"
  } | null
  unitLabels: string[]
  insurance: {
    option:                   "now" | "ask_owner" | "later"
    insurer?:                 string
    policy_number?:           string
    renewal_date?:            string
    replacement_value_cents?: number
  } | null
}

export interface WizardSaveResult {
  ok:           boolean
  propertyId?:  string
  error?:       string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function infoRequestExpiry(days = 14): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

function deriveBuildingType(scenarioType: ScenarioType): string {
  if (["c1", "c2", "c4"].includes(scenarioType)) return "commercial"
  if (scenarioType === "c3") return "industrial"
  if (["m1", "m2"].includes(scenarioType)) return "mixed_use"
  return "residential"
}

function derivePropertyType(scenarioType: ScenarioType): "residential" | "commercial" | "mixed" {
  if (["c1", "c2", "c3", "c4"].includes(scenarioType)) return "commercial"
  if (["m1", "m2"].includes(scenarioType)) return "mixed"
  return "residential"
}

function sanitizeFilename(name: string): string {
  return name.replaceAll(/[^a-zA-Z0-9.-]/g, "_")
}

function initialCompletenessPct(payload: WizardSavePayload, hasDocuments: boolean): number {
  let pct = 0
  if (payload.address) pct += 15
  if (payload.scenarioType) pct += 15

  const ownerLinked =
    payload.managedMode === "self_owned" ||
    payload.landlord?.option === "existing" ||
    payload.landlord?.option === "new"
  if (ownerLinked) pct += 15

  if (payload.insurance?.option === "now" && payload.insurance.insurer && payload.insurance.policy_number) pct += 15
  if (hasDocuments) pct += 10
  if (payload.unitLabels.length > 0) pct += 15

  return Math.min(pct, 100)
}

// ── Sub-step: resolve landlord (existing / new / later → null) ──────────────

interface ResolveLandlordResult {
  ok:           boolean
  landlordId?:  string | null
  error?:       string
}

async function resolveLandlord(
  db: Db,
  orgId: string,
  userId: string,
  payload: WizardSavePayload,
): Promise<ResolveLandlordResult> {
  if (payload.managedMode !== "managed_for_owner" || !payload.landlord) {
    return { ok: true, landlordId: null }
  }

  const l = payload.landlord
  if (l.option === "existing" && l.existing_id) {
    return { ok: true, landlordId: l.existing_id }
  }

  if (l.option !== "new") {
    return { ok: true, landlordId: null }   // "later" path
  }

  const isCompany = l.entity_type === "company" || l.entity_type === "trust"
  const { data: contact, error: contactErr } = await db.from("contacts").insert({
    org_id:        orgId,
    entity_type:   isCompany ? "organisation" : "individual",
    primary_role:  "landlord",
    first_name:    l.first_name?.trim() || null,
    last_name:     l.last_name?.trim() || null,
    company_name:  l.company_name?.trim() || null,
    primary_email: l.email?.trim() || null,
    primary_phone: l.phone?.trim() || null,
    created_by:    userId,
  }).select("id").single()

  if (contactErr || !contact) {
    console.error("createPropertyFromWizard: contact insert failed:", contactErr?.message)
    return { ok: false, error: "Failed to create owner contact" }
  }

  const { data: landlord, error: landlordErr } = await db.from("landlords").insert({
    org_id:     orgId,
    contact_id: contact.id,
    created_by: userId,
  }).select("id").single()

  if (landlordErr || !landlord) {
    console.error("createPropertyFromWizard: landlord insert failed:", landlordErr?.message)
    return { ok: false, error: "Failed to create owner record" }
  }

  return { ok: true, landlordId: landlord.id as string }
}

// ── Sub-step: build property insert row ────────────────────────────────────

function buildPropertyInsertRow(
  payload: WizardSavePayload,
  universals: UniversalAnswers,
  profile: ReturnType<typeof buildProfile>,
  orgId: string,
  landlordId: string | null,
) {
  const addr = payload.address!
  const insuranceNow = payload.insurance?.option === "now" ? payload.insurance : null
  const ownerEmailLater =
    payload.landlord?.option === "later" && payload.landlord?.later_track === "owner_email"
      ? payload.landlord.email || null
      : null

  return {
    org_id:                 orgId,
    name:                   addr.property_name,
    type:                   derivePropertyType(payload.scenarioType),
    address_line1:          [addr.street_number, addr.street_name].filter(Boolean).join(" ") || addr.formatted,
    suburb:                 addr.suburb || null,
    city:                   addr.city,
    province:               addr.province || "Western Cape",
    postal_code:            addr.postal_code || null,
    erf_number:             addr.erf_number || null,
    sectional_title_number: addr.sectional_title_number || null,
    google_place_id:        addr.google_place_id || null,
    gps_lat:                addr.lat,
    gps_lng:                addr.lng,
    landlord_id:            landlordId,
    owner_email:            ownerEmailLater,
    scenario_type:          payload.scenarioType,
    scenario_pick_at:       new Date().toISOString(),
    managed_mode:           payload.managedMode,
    property_profile:       profile,
    onboarding_completed_pct: 0,
    wifi_available:         universals.wifiAvailable,
    cell_signal_quality:    universals.cellSignalQuality,
    backup_power:           universals.backupPower,
    operating_hours_preset: payload.operatingHoursPreset,
    after_hours_access:     payload.afterHoursAccess,
    after_hours_notice_hours: payload.afterHoursNoticeHours,
    after_hours_notes:      payload.afterHoursNotes,
    has_managing_scheme:    universals.hasManagingScheme,
    insurance_provider:                insuranceNow?.insurer ?? null,
    insurance_policy_number:           insuranceNow?.policy_number ?? null,
    insurance_policy_type:             profile.defaults.insurance_type,
    insurance_renewal_date:            insuranceNow?.renewal_date ?? null,
    insurance_replacement_value_cents: insuranceNow?.replacement_value_cents ?? null,
  }
}

// ── Sub-step: build skeleton unit rows ─────────────────────────────────────

function buildUnitRows(
  payload: WizardSavePayload,
  orgId: string,
  propertyId: string,
  buildingId: string,
) {
  const skeletonUnits = buildSkeletonUnits({
    scenarioType:    payload.scenarioType,
    propertyName:    payload.address!.property_name,
    scenarioAnswers: payload.scenarioAnswers,
    unitCount:       payload.unitCount,
  })

  return skeletonUnits.map((u, i) => ({
    org_id:                 orgId,
    property_id:            propertyId,
    building_id:            buildingId,
    unit_number:            payload.unitLabels[i] ?? u.unit_number,
    unit_type:              u.unit_type,
    bedrooms:               u.bedrooms,
    bathrooms:              u.bathrooms,
    parking_bays:           u.parking_bays ?? 0,
    floor:                  u.floor,
    size_m2:                u.size_m2,
    furnishing_status:      u.furnishing_status,
    is_lettable:            u.is_lettable,
    status:                 u.status,
    business_use_permitted: u.business_use_permitted,
    roller_door_count:      u.roller_door_count,
    loading_bay_type:       u.loading_bay_type,
    three_phase_power:      u.three_phase_power,
    floor_loading:          u.floor_loading,
    clear_height_category:  u.clear_height_category,
    office_component_pct:   u.office_component_pct,
    has_crane:              u.has_crane,
    hazmat_approved:        u.hazmat_approved,
    rail_siding:            u.rail_siding,
  }))
}

// ── Sub-step: upload one document ──────────────────────────────────────────

interface DocUploadContext {
  db:          Db
  orgId:       string
  userId:      string
  propertyId:  string
  buildingId:  string
}

async function uploadOneDocument(
  ctx:    DocUploadContext,
  index:  number,
  file:   File,
  docType: string,
  expires: string | null,
): Promise<boolean> {
  const safeName = sanitizeFilename(file.name)
  const storagePath = `${ctx.orgId}/${ctx.propertyId}/${docType}/${Date.now()}-${index}-${safeName}`

  const { error: uploadErr } = await ctx.db.storage
    .from("property-documents")
    .upload(storagePath, file, { cacheControl: "3600", upsert: false })

  if (uploadErr) {
    console.error(`createPropertyFromWizard: file upload failed for ${file.name}:`, uploadErr.message)
    return false
  }

  const { error: docInsertErr } = await ctx.db.from("property_documents").insert({
    org_id:        ctx.orgId,
    property_id:   ctx.propertyId,
    building_id:   ctx.buildingId,
    name:          file.name,
    document_type: docType,
    storage_path:  storagePath,
    file_size:     file.size,
    mime_type:     file.type || null,
    expiry_date:   expires,
    uploaded_by:   ctx.userId,
  })

  if (docInsertErr) {
    console.error("createPropertyFromWizard: document row insert failed:", docInsertErr.message)
    await ctx.db.storage.from("property-documents").remove([storagePath])
    return false
  }
  return true
}

// ── Sub-step: upload all wizard documents ──────────────────────────────────

async function uploadWizardDocuments(
  ctx:      DocUploadContext,
  formData: FormData,
): Promise<number> {
  const docCount = Number.parseInt((formData.get("document_count") as string) ?? "0", 10) || 0
  let uploaded = 0

  for (let i = 0; i < docCount; i++) {
    const file = formData.get(`document_${i}`) as File | null
    if (!file || !(file instanceof File) || file.size === 0) continue

    const docType = (formData.get(`document_${i}_type`) as string | null) ?? "other"
    const expires = (formData.get(`document_${i}_expires`) as string | null) || null

    if (await uploadOneDocument(ctx, i, file, docType, expires)) uploaded++
  }
  return uploaded
}

// ── Sub-step: schedule info requests for ask_owner / later paths ───────────

async function scheduleInfoRequests(
  payload:    WizardSavePayload,
  orgId:      string,
  userId:     string,
  propertyId: string,
  landlordId: string | null,
): Promise<void> {
  const expiresAt = infoRequestExpiry(14)

  if (payload.insurance?.option === "ask_owner" && (landlordId || payload.landlord?.email)) {
    await createPropertyInfoRequest({
      propertyId,
      topic:          "insurance",
      missingFields:  ["insurance_provider", "insurance_policy_number", "insurance_renewal_date", "insurance_replacement_value_cents"],
      recipientType:  "owner",
      recipientEmail: payload.landlord?.email ?? null,
      requestedBy:    userId,
      orgId,
      expiresAt,
    })
  }

  if (payload.managedMode === "managed_for_owner" && payload.landlord?.option === "later") {
    const sendByEmail = payload.landlord.later_track === "owner_email" && !!payload.landlord.email
    await createPropertyInfoRequest({
      propertyId,
      topic:          "landlord",
      missingFields:  ["entity_type", "first_name", "last_name", "company_name", "email", "phone"],
      recipientType:  sendByEmail ? "owner" : "self",
      recipientEmail: sendByEmail ? payload.landlord.email ?? null : null,
      requestedBy:    userId,
      orgId,
      expiresAt,
    })
  }
}

// ── Validation ─────────────────────────────────────────────────────────────

function validatePayload(payload: WizardSavePayload): string | null {
  if (!payload.scenarioType)                return "Scenario type required"
  if (!payload.address)                     return "Address required"
  if (!payload.address.property_name)       return "Property name required"
  if (payload.unitLabels.length === 0)      return "At least one unit required"
  return null
}

// ── Main action ───────────────────────────────────────────────────────────────

export async function createPropertyFromWizard(formData: FormData): Promise<WizardSaveResult> {
  const gw = await gateway()
  if (!gw) return { ok: false, error: "Not authenticated" }
  const { db, userId, orgId } = gw

  const payloadRaw = formData.get("payload") as string | null
  if (!payloadRaw) return { ok: false, error: "Missing payload" }

  let payload: WizardSavePayload
  try {
    payload = JSON.parse(payloadRaw) as WizardSavePayload
  } catch {
    return { ok: false, error: "Invalid payload JSON" }
  }

  const validationError = validatePayload(payload)
  if (validationError) return { ok: false, error: validationError }

  const universals: UniversalAnswers = payload.universals ?? {
    wifiAvailable:     "unknown",
    cellSignalQuality: "unknown",
    backupPower:       "unknown",
    hasManagingScheme: false,
    schemeType:        null,
    schemeName:        null,
  }

  const profile = buildProfile({
    scenarioType:         payload.scenarioType,
    managedMode:          payload.managedMode,
    universals,
    scenarioAnswers:      payload.scenarioAnswers,
    operatingHoursPreset: payload.operatingHoursPreset,
    afterHoursAccess:     payload.afterHoursAccess,
  })

  const landlordResult = await resolveLandlord(db, orgId, userId, payload)
  if (!landlordResult.ok) return { ok: false, error: landlordResult.error }
  const landlordId = landlordResult.landlordId ?? null

  // Insert property
  const propertyRow = buildPropertyInsertRow(payload, universals, profile, orgId, landlordId)
  const { data: property, error: propErr } = await db.from("properties")
    .insert(propertyRow).select("id").single()

  if (propErr || !property) {
    console.error("createPropertyFromWizard: property insert failed:", propErr?.message)
    return { ok: false, error: propErr?.message ?? "Failed to create property" }
  }

  const propertyId = property.id as string

  // Default building
  const { data: building, error: bldgErr } = await db.from("buildings").insert({
    org_id:           orgId,
    property_id:      propertyId,
    name:             payload.address!.property_name,
    building_type:    deriveBuildingType(payload.scenarioType),
    is_primary:       true,
    is_visible_in_ui: false,
    created_by:       userId,
  }).select("id").single()

  if (bldgErr || !building) {
    console.error("createPropertyFromWizard: building insert failed:", bldgErr?.message)
    return { ok: false, error: "Failed to create building" }
  }

  // Skeleton units
  const unitsToInsert = buildUnitRows(payload, orgId, propertyId, building.id as string)
  const { error: unitsErr } = await db.from("units").insert(unitsToInsert)
  if (unitsErr) {
    console.error("createPropertyFromWizard: units insert failed:", unitsErr.message)
    return { ok: false, error: "Failed to create units" }
  }

  // Document uploads
  const uploadedDocCount = await uploadWizardDocuments(
    { db, orgId, userId, propertyId, buildingId: building.id as string },
    formData,
  )

  // Info requests
  await scheduleInfoRequests(payload, orgId, userId, propertyId, landlordId)

  // Update onboarding pct + audit
  const initialPct = initialCompletenessPct(payload, uploadedDocCount > 0)
  await db.from("properties")
    .update({ onboarding_completed_pct: initialPct })
    .eq("id", propertyId)
    .eq("org_id", orgId)

  await db.from("audit_log").insert({
    org_id:      orgId,
    table_name:  "properties",
    record_id:   propertyId,
    action:      "INSERT",
    changed_by:  userId,
    new_values:  {
      name:           payload.address!.property_name,
      scenario_type:  payload.scenarioType,
      managed_mode:   payload.managedMode,
      unit_count:     payload.unitCount,
      uploaded_docs:  uploadedDocCount,
    },
  })

  revalidatePath("/properties")
  return { ok: true, propertyId }
}
