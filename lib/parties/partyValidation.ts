/**
 * lib/parties/partyValidation.ts — SA ID validation + step validators for the add-party flow
 *
 * Data:   pure functions over PartyFormState; no I/O
 * Notes:  validateSAId does the Luhn checksum + derives DOB / gender / citizenship (shown inline).
 *         Identity/details validators return a { field: message } map (empty = valid). Kept here
 *         (not in the component) so the same rules drive both the modal UI and any future API guard.
 */
import type { PartyRole, PartyEntity } from "./partyConfig"

/** Payload from the modal to a create action. */
export interface AddPartyInput {
  role: PartyRole
  entity: PartyEntity
  form: PartyFormState
}

/** Result back to the modal (name drives the success view; id enables the success action). */
export interface AddPartyResult {
  ok: boolean
  error?: string
  name?: string
  /** id of the created role record (landlord/tenant/contractor) */
  id?: string
}

export interface PartyFormState {
  // individual
  title?: string             // salutation (Mr, Mrs, Ms, Dr, Prof, Adv…)
  initials?: string
  firstName?: string
  middleNames?: string       // any names between first and last
  lastName?: string
  suffix?: string            // Jr, Sr, II…
  designation?: string       // professional / honorific (Adv., Dr, CA(SA)…)
  gender?: string            // male | female | other | prefer_not_to_say
  preferredChannel?: string  // email | sms | whatsapp | phone | post
  idType?: string
  idNumber?: string
  email?: string
  phone?: string
  // company
  companyName?: string
  companyReg?: string
  vatNumber?: string
  addrLine1?: string
  addrSuburb?: string
  addrCity?: string
  addrProvince?: string
  addrPostal?: string
  // mandated signatory (fullFica) / primary contact (supplier)
  dirFirstName?: string
  dirLastName?: string
  dirIdType?: string
  dirIdNumber?: string
  dirPhone?: string
  dirEmail?: string
  // supplier details
  specialities?: string[]
  isActive?: boolean
  notes?: string
  // tenant details
  popiaConsent?: boolean
  employer?: string
  occupation?: string
  // landlord details
  bankName?: string
  accountNumber?: string
  branchCode?: string
  sendWelcomePack?: boolean
}

export type PartyErrors = Partial<Record<keyof PartyFormState, string>>

export interface SAIdResult {
  valid: boolean
  dob: Date | null
  gender: "Female" | "Male"
  citizenship: "SA Citizen" | "Permanent Resident"
}

/** Luhn checksum + DOB/gender/citizenship extraction for a 13-digit SA ID. null if not 13 digits. */
export function validateSAId(raw: string | undefined): SAIdResult | null {
  const s = (raw || "").replace(/\D/g, "")
  if (s.length !== 13) return null

  let odd = 0
  for (let i = 0; i < 12; i += 2) odd += +s[i]
  let evenStr = ""
  for (let i = 1; i < 12; i += 2) evenStr += s[i]
  const evenSum = String(+evenStr * 2).split("").reduce((a, d) => a + +d, 0)
  const check = (10 - ((odd + evenSum) % 10)) % 10
  const valid = check === +s[12]

  const yy = +s.slice(0, 2), mm = +s.slice(2, 4), dd = +s.slice(4, 6)
  const nowYY = new Date().getFullYear() % 100
  const year = yy <= nowYY ? 2000 + yy : 1900 + yy
  const dob = mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 ? new Date(year, mm - 1, dd) : null
  const gender: SAIdResult["gender"] = +s.slice(6, 10) < 5000 ? "Female" : "Male"
  const citizenship: SAIdResult["citizenship"] = s[10] === "0" ? "SA Citizen" : "Permanent Resident"
  return { valid, dob, gender, citizenship }
}

/** Flag an invalid SA ID (only when the type is sa_id and a number was entered). */
function checkSaId(f: PartyFormState, typeKey: keyof PartyFormState, numKey: keyof PartyFormState, e: PartyErrors) {
  if (((f[typeKey] as string) || "sa_id") !== "sa_id") return
  const num = f[numKey] as string
  if (!num) return
  const v = validateSAId(num)
  if (v && !v.valid) e[numKey] = "Invalid SA ID number"
}

function validateIndividualIdentity(f: PartyFormState, e: PartyErrors, need: (k: keyof PartyFormState) => void) {
  need("firstName"); need("lastName"); need("email"); need("phone")
  checkSaId(f, "idType", "idNumber", e)
}

function validateCompanyIdentity(f: PartyFormState, fullFica: boolean, e: PartyErrors, need: (k: keyof PartyFormState) => void) {
  need("companyName"); need("dirFirstName"); need("dirPhone")
  if (!fullFica) return
  need("addrLine1"); need("addrCity"); need("dirLastName"); need("dirIdNumber"); need("dirEmail")
  checkSaId(f, "dirIdType", "dirIdNumber", e)
}

/** Step 1 (Identity) validator — entity-aware; fullFica adds address + signatory requirements. */
export function validateIdentity(entity: PartyEntity, f: PartyFormState, fullFica: boolean): PartyErrors {
  const e: PartyErrors = {}
  const need = (k: keyof PartyFormState) => { if (!String(f[k] ?? "").trim()) e[k] = "Required" }
  if (entity === "individual") validateIndividualIdentity(f, e, need)
  else validateCompanyIdentity(f, fullFica, e, need)
  return e
}

/** Step 2 (Details) validator — role-specific gates (tenant POPIA consent, supplier specialities). */
export function validateDetails(role: PartyRole, f: PartyFormState): PartyErrors {
  const e: PartyErrors = {}
  if (role === "tenant" && !f.popiaConsent) e.popiaConsent = "POPIA consent is required to continue."
  if (role === "supplier" && (!f.specialities || f.specialities.length === 0)) {
    e.specialities = "Pick at least one speciality."
  }
  return e
}
