"use server"

/**
 * lib/actions/reclassifyProperty.ts — changes a property's scenario type and rebuilds its profile
 *
 * Auth:   requireAgentWriteAccess("edit_property") + in-body isAdmin check (admin-only action)
 * Data:   reads/updates properties (scenario_type, property_profile) + audit_log; re-evaluates insurance checklist
 * Notes:  preserves prior universals + scenario answers when rebuilding via buildProfile; checklist
 *         re-evaluation is non-fatal (logged, not thrown)
 */

import { requireAgentWriteAccess } from "@/lib/auth/server"
import { revalidatePath } from "next/cache"
import { buildProfile, type UniversalAnswers } from "@/lib/properties/buildProfile"
import type { ScenarioType } from "@/lib/properties/scenarios"
import { reEvaluateChecklistApplicability } from "@/lib/insurance-checklist/reEvaluateApplicability"
import { recordAudit } from "@/lib/audit/recordAudit"

export interface ReclassifyResult {
  ok:    boolean
  error?: string
}

const VALID_SCENARIOS: ScenarioType[] = [
  "r1", "r2", "r3", "r4", "r5", "r6", "r7",
  "c1", "c2", "c3", "c4", "c5", "c6",
  "m1", "m2", "m3", "m4",
  "other",
]

export async function reclassifyProperty(
  propertyId: string,
  newScenarioType: ScenarioType,
): Promise<ReclassifyResult> {
  const gw = await requireAgentWriteAccess("edit_property")
  const { db, userId, orgId, isAdmin } = gw

  if (!isAdmin) return { ok: false, error: "Admin access required" }
  if (!VALID_SCENARIOS.includes(newScenarioType)) return { ok: false, error: "Invalid scenario type" }

  const { data: property, error: fetchErr } = await db
    .from("properties")
    .select(`
      id, scenario_type, managed_mode, property_profile,
      wifi_available, cell_signal_quality, backup_power, has_managing_scheme,
      operating_hours_preset, after_hours_access
    `)
    .eq("id", propertyId)
    .eq("org_id", orgId)
    .single()

  if (fetchErr || !property) return { ok: false, error: "Property not found" }

  const oldScenario = property.scenario_type as ScenarioType | null
  if (oldScenario === newScenarioType) return { ok: true }

  // Rebuild profile with new scenario but preserve prior answers + universals
  const previousProfile = (property.property_profile ?? {}) as Record<string, unknown>
  const prevUniversals = (previousProfile.universals ?? {}) as Record<string, unknown>
  const prevAnswers    = (previousProfile.scenario_answers ?? {}) as Record<string, unknown>

  const universals: UniversalAnswers = {
    wifiAvailable:     (prevUniversals.wifi_available as UniversalAnswers["wifiAvailable"])     ?? (property.wifi_available as UniversalAnswers["wifiAvailable"])      ?? "unknown",
    cellSignalQuality: (prevUniversals.cell_signal as UniversalAnswers["cellSignalQuality"])    ?? (property.cell_signal_quality as UniversalAnswers["cellSignalQuality"]) ?? "unknown",
    backupPower:       (prevUniversals.backup_power as UniversalAnswers["backupPower"])         ?? (property.backup_power as UniversalAnswers["backupPower"])          ?? "unknown",
    hasManagingScheme: (prevUniversals.has_managing_scheme as boolean | undefined)              ?? (property.has_managing_scheme as boolean | null) ?? false,
    schemeType:        (prevUniversals.scheme_type as string | null | undefined) ?? null,
    schemeName:        (prevUniversals.scheme_name as string | null | undefined) ?? null,
  }

  const newProfile = buildProfile({
    scenarioType:         newScenarioType,
    managedMode:          (property.managed_mode as "self_owned" | "managed_for_owner") ?? "self_owned",
    universals,
    scenarioAnswers:      prevAnswers,
    operatingHoursPreset: property.operating_hours_preset as string | null,
    afterHoursAccess:     property.after_hours_access as string | null,
  })

  const { error: updateErr } = await db
    .from("properties")
    .update({
      scenario_type:    newScenarioType,
      property_profile: newProfile,
    })
    .eq("id", propertyId)
    .eq("org_id", orgId)

  if (updateErr) {
    console.error("reclassifyProperty: update failed:", updateErr.message)
    return { ok: false, error: "Failed to update scenario" }
  }

  await recordAudit(db, { orgId: orgId, table: "properties", recordId: propertyId, action: "UPDATE", actorId: userId, after: {
      scenario_type_from: oldScenario,
      scenario_type_to:   newScenarioType,
    } })

  // Re-evaluate checklist applicability after scenario change (non-fatal)
  await reEvaluateChecklistApplicability(propertyId).catch((e) =>
    console.error("reclassifyProperty: checklist re-evaluation failed:", e)
  )

  revalidatePath(`/properties/${propertyId}`)
  return { ok: true }
}
