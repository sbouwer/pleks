"use client"

/**
 * app/(dashboard)/properties/new/WizardContext.tsx — property-wizard client state + step computation
 *
 * Route:  /properties/new (client context shared by WizardShell + step components)
 * Auth:   client-only; the save path (createPropertyFromWizard) enforces requireAgentWriteAccess
 * Data:   in-memory WizardState + localStorage draft (B12, DRAFT_KEY v2); no direct DB access
 * Notes:  Owner-first ordering (ADDENDUM_60C): computeActiveStepIds resolves relationship+owner FIRST;
 *         managedMode DERIVES from the step-1 relationship answer; ownerContactable() is the single
 *         owner-dependency gate (never branch owner-contact paths on managedMode — D-60C-04).
 */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react"
import type { ScenarioType } from "@/lib/properties/scenarios"
import type { UniversalAnswers } from "@/lib/properties/buildProfile"
import type { SkeletonUnit } from "@/lib/properties/skeletonUnits"

// ── Types ─────────────────────────────────────────────────────────────────────

export type ManagedMode = "self_owned" | "managed_for_owner"
export type WizardMode  = "wizard" | "advanced"
/** Step-1 answer (ADDENDUM_60C): "self" = I'm the owner; "other" = I'm an agent for a landlord. */
export type Relationship = "self" | "other"

export interface WizardAddress {
  formatted:              string
  street_number:          string
  street_name:            string
  /** Building name, unit number, floor, etc. */
  address_line2:          string
  suburb:                 string
  city:                   string
  province:               string
  postal_code:            string
  country:                string
  lat:                    number | null
  lng:                    number | null
  google_place_id:        string | null
  property_name:          string
  erf_number:             string | null
  sectional_title_number: string | null
}

export interface LandlordDraft {
  option:        "existing" | "new" | "later"
  existing_id?:  string
  entity_type?:  "individual" | "company" | "trust"
  first_name?:   string
  last_name?:    string
  company_name?: string
  email?:        string
  phone?:        string
  /** For option="later": "owner_email" emails owner when provided; "self" = widget nudges only */
  later_track?:  "owner_email" | "self"
}

export interface InsuranceStub {
  option:                    "now" | "ask_owner" | "later"
  insurer?:                  string
  policy_number?:            string
  renewal_date?:             string
  replacement_value_cents?:  number
}

export interface UploadedDoc {
  storage_path:  string
  original_name: string
  doc_type:      string
  expires_at?:   string
}

/** Held in client state during the wizard; uploaded by createPropertyFromWizard on save. */
export interface PendingDocument {
  file:        File
  doc_type:    string
  expires_at?: string
}

/** Editable unit record held in the wizard before save. */
export type UnitDraft = SkeletonUnit

export interface WizardState {
  mode:         WizardMode
  step:         number

  // Step 1 — Relationship & owner (ADDENDUM_60C). `relationship` is the source of truth for the
  // step-1 answer; `managedMode` is DERIVED from it (set together at StepRelationship — D-60C-03).
  relationship:  Relationship | null
  // The user's own details, confirmed at the "check your details" sub-step (owner or agent variant).
  selfDetailsConfirmed: boolean

  // Step 2 — Picker
  scenarioType:  ScenarioType | null
  managedMode:   ManagedMode
  unitCount:     number

  // Step 1 — Address
  address:       WizardAddress | null

  // Step 2 — Universal questions
  universals:    UniversalAnswers | null

  // Step 3 — Scenario-specific answers
  scenarioAnswers: Record<string, unknown>

  // Step 4 — Operating hours (commercial / mixed only)
  operatingHoursPreset:   string | null
  afterHoursAccess:       string | null
  afterHoursNoticeHours:  number | null
  afterHoursNotes:        string | null

  // Step 5 — Owner / landlord (managed_for_owner only)
  landlord: LandlordDraft | null

  // Step 2 — Unit hints (set in Details step, applied when building skeleton units)
  unitHints: {
    unitType:         string | null
    bedrooms:         number | null
    bathrooms:        number | null
    furnishingStatus: "unfurnished" | "semi_furnished" | "furnished" | null
    sizeM2:           number | null
  }

  // Step 6 — Unit drafts (pre-filled from skeletonUnits, fully editable)
  units: UnitDraft[]

  // Step 7 — Insurance stub
  insurance: InsuranceStub | null

  // Step 8 — Documents
  documents:        UploadedDoc[]      // populated post-save (saved doc references)
  pendingDocuments: PendingDocument[]  // client-only: files awaiting upload at save time
}

export interface WizardContextValue {
  state:   WizardState
  patch:   (partial: Partial<WizardState>) => void
  goNext:  () => void
  goBack:  () => void
  /** Total number of active steps for the current scenario */
  totalSteps: number
}

// ── Owner-dependency invariant (ADDENDUM_60C §4 / D-60C-04) ────────────────────

/**
 * True only when there is a SEPARATE owner we can actually email. The single gate for every
 * owner-contact path (e.g. insurance "ask the owner"). Gate on THIS, never on managedMode — that
 * is what stops the bug class (an owner-email prompt with no owner to email) from regrowing as new
 * owner-dependent questions are added. False for self-owned (you ARE the owner — you don't email
 * yourself), deferred-self ("I'll handle it, no owner email"), or an owner with no email yet.
 */
export function ownerContactable(l: LandlordDraft | null): boolean {
  if (!l) return false
  if (l.option === "existing" && !!l.existing_id) return true        // existing owner has an email on file
  if (l.option === "new" && !!l.email?.trim()) return true           // new owner with an email entered
  if (l.option === "later" && l.later_track === "owner_email" && !!l.email?.trim()) return true
  return false
}

// ── Step applicability ────────────────────────────────────────────────────────

const COMMERCIAL_OR_MIXED: ScenarioType[] = ["c1", "c2", "c3", "c4", "c5", "c6", "m1", "m2", "m3", "m4"]

/**
 * Returns the ordered list of active step ids (ADDENDUM_60C — owner-first).
 * Order: Relationship & Owner → Property → Housekeeping.
 *
 * Step 1 is unconditional and resolves who the property is for + the owner FIRST (D-60C-08), so
 * every later owner-dependent question relies on a known owner instead of guessing from a mode flag:
 *   - relationship "self"  → "owner_details"  (you ARE the landlord; just confirm your details)
 *   - relationship "other" → "landlord" → "agent_details"  (add the landlord, then confirm yours)
 *   - relationship null    → default to the self path; the relationship step gates Continue until chosen
 */
export function computeActiveStepIds(state: Pick<WizardState, "scenarioType" | "relationship">): string[] {
  const ids = ["relationship"]
  if (state.relationship === "other") {
    ids.push("landlord", "agent_details")
  } else {
    ids.push("owner_details")
  }

  // Property phase
  ids.push("picker", "universal", "address", "followup")
  if (state.scenarioType && COMMERCIAL_OR_MIXED.includes(state.scenarioType)) {
    ids.push("hours")
  }
  ids.push("units")

  // Housekeeping phase
  ids.push("insurance", "documents", "summary")
  return ids
}

// ── Default state ─────────────────────────────────────────────────────────────

const DEFAULT_STATE: WizardState = {
  mode:          "wizard",
  step:          0,
  relationship:  null,
  selfDetailsConfirmed: false,
  scenarioType:  null,
  managedMode:   "self_owned",
  unitCount:     1,
  address:       null,
  universals:    null,
  scenarioAnswers: {},
  operatingHoursPreset:  null,
  afterHoursAccess:      null,
  afterHoursNoticeHours: null,
  afterHoursNotes:       null,
  landlord:      null,
  unitHints: { unitType: null, bedrooms: null, bathrooms: null, furnishingStatus: null, sizeM2: null },
  units:            [],
  insurance:        null,
  documents:        [],
  pendingDocuments: [],
}

// ── Draft persistence (B12 — survive navigating away mid-wizard) ───────────────
// Without this, any navigation (e.g. the Browse-help link) unmounts the wizard and loses every
// answer. We autosave to localStorage and rehydrate on mount. `pendingDocuments` is omitted —
// it holds File objects that don't survive JSON (the user re-attaches files, which is fine; far
// better than losing the whole property). Bump the key version if WizardState shape changes.
// v2 (ADDENDUM_60C D-60C-05): the owner-first reorder changed what each numeric `step` index means,
// so a v1 draft saved under the old order would restore to the WRONG step. The new key discards
// stale v1 drafts cleanly. Bump this whenever the step order or WizardState shape changes.
const DRAFT_KEY = "pleks_property_wizard_draft_v2"

function loadDraft(): WizardState | null {
  if (typeof globalThis.localStorage === "undefined") return null
  try {
    const raw = globalThis.localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<WizardState>
    return { ...DEFAULT_STATE, ...parsed, pendingDocuments: [] }
  } catch {
    return null   // corrupt / incompatible draft → start clean
  }
}

function saveDraft(state: WizardState): void {
  if (typeof globalThis.localStorage === "undefined") return
  try {
    // Drop File objects (pendingDocuments) — not JSON-serialisable; everything else persists.
    const serialisable: WizardState = { ...state, pendingDocuments: [] }
    globalThis.localStorage.setItem(DRAFT_KEY, JSON.stringify(serialisable))
  } catch {
    // quota exceeded / serialisation failure — non-fatal, just skip this save
  }
}

/** Clear the saved wizard draft — call after a successful property create so the next run is fresh. */
export function clearWizardDraft(): void {
  try { globalThis.localStorage?.removeItem(DRAFT_KEY) } catch { /* ignore */ }
}

// ── Context ───────────────────────────────────────────────────────────────────

const WizardCtx = createContext<WizardContextValue | null>(null)

export function WizardProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [state, setState] = useState<WizardState>(DEFAULT_STATE)
  // Rehydrate in an effect (not a lazy initialiser) so server and first client render both use
  // DEFAULT_STATE — avoids a hydration mismatch. Gate children on `hydrated` so we don't flash
  // step 0 (and fire step-0 effects) before the saved step is restored.
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const draft = loadDraft()
    if (draft) setState(draft)
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return   // don't clobber a saved draft with DEFAULT_STATE before rehydration
    saveDraft(state)
  }, [state, hydrated])

  const patch = useCallback((partial: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...partial }))
  }, [])

  const totalSteps = useMemo(
    () => computeActiveStepIds(state).length,
    [state],
  )

  const goNext = useCallback(() => {
    setState((prev) => ({
      ...prev,
      step: Math.min(prev.step + 1, computeActiveStepIds(prev).length - 1),
    }))
  }, [])

  const goBack = useCallback(() => {
    setState((prev) => ({ ...prev, step: Math.max(prev.step - 1, 0) }))
  }, [])

  const value = useMemo<WizardContextValue>(
    () => ({ state, patch, goNext, goBack, totalSteps }),
    [state, patch, goNext, goBack, totalSteps],
  )

  // Hold render for the one tick until the draft is rehydrated, so steps mount against the
  // restored state (not DEFAULT_STATE) — no step-0 flash, no wrong-step effects.
  return (
    <WizardCtx.Provider value={value}>
      {hydrated ? children : null}
    </WizardCtx.Provider>
  )
}

export function useWizard(): WizardContextValue {
  const ctx = useContext(WizardCtx)
  if (!ctx) throw new Error("useWizard must be used inside WizardProvider")
  return ctx
}
