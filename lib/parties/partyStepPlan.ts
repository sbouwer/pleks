/**
 * lib/parties/partyStepPlan.ts — the ordered wizard steps per role/entity (multi-step add/edit flow)
 *
 * Notes:  Splits the old 3-step flow into focused side-steps so each screen is short (no long scroll).
 *         Each step validates only its own section. Re-grouping is a one-line change here — the bodies
 *         (partySteps PartyStepBody) and usePartyFlow are driven by these ids.
 */
import { type PartyEntity, type PartyRole, type PartyRoleConfig } from "./partyConfig"
import {
  type PartyFormState, type PartyErrors,
  validateIdentityCore, validatePeopleStep, validateAddressStep, validateSpecialitiesStep, validateConsentStep,
} from "./partyValidation"

export type PartyStepId =
  | "identity" | "people" | "specialities" | "rates" | "banking" | "address" | "consent" | "welcome" | "confirm"

export interface PartyStepDef {
  id: PartyStepId
  label: string
  /** Validate this step's section; empty map = valid. Omitted = no gate. */
  validate?: (entity: PartyEntity, f: PartyFormState) => PartyErrors
}

export function buildPartySteps(
  role: PartyRole, entity: PartyEntity, cfg: PartyRoleConfig, hideWelcomePack: boolean,
): PartyStepDef[] {
  const company = entity === "company"
  const identity: PartyStepDef = { id: "identity", label: "Identity", validate: (e, f) => validateIdentityCore(e, f) }
  const people: PartyStepDef = { id: "people", label: "People", validate: (_e, f) => validatePeopleStep(f, cfg.fullFica) }
  const addressRequired: PartyStepDef = { id: "address", label: "Address", validate: (_e, f) => validateAddressStep(f, true) }
  const confirm: PartyStepDef = { id: "confirm", label: "Confirm" }

  if (role === "supplier") {
    return [
      identity,
      ...(company ? [people] : []),
      { id: "specialities", label: "Specialities", validate: (_e, f) => validateSpecialitiesStep(f) },
      { id: "rates", label: "Rates & status" },
      { id: "banking", label: "Banking" },
      { id: "address", label: "Address", validate: (_e, f) => validateAddressStep(f, false) },
      confirm,
    ]
  }
  if (role === "landlord") {
    return [
      identity,
      ...(company ? [people, addressRequired] : []),
      { id: "banking", label: "Banking" },
      ...(hideWelcomePack ? [] : [{ id: "welcome", label: "Welcome pack" } as PartyStepDef]),
      confirm,
    ]
  }
  // tenant
  return [
    identity,
    ...(company ? [people, addressRequired] : []),
    { id: "consent", label: "Consent", validate: (_e, f) => validateConsentStep(f) },
    confirm,
  ]
}
