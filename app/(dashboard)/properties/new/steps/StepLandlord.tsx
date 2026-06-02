"use client"

/**
 * app/(dashboard)/properties/new/steps/StepLandlord.tsx — wizard Owner step: pick / add / defer the landlord
 *
 * Route:  /properties/new (Owner step — relationship="other")
 * Data:   /api/landlords for the existing-owner picker; writes LandlordDraft to WizardContext
 * Notes:  "Add new owner" launches the shared add-party sub-flow in the SAME modal (full FICA via
 *         addLandlordParty) when hosted in PropertyWizardModal; on save the new owner is selected
 *         (option="existing") and the list re-fetches (refreshNonce). Falls back to the inline
 *         new-owner form when rendered outside the modal host. ownerContactable() (WizardContext) is
 *         the single owner-dependency gate — never branch owner paths on managedMode (D-60C-04).
 */
import { useState, useEffect } from "react"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { useWizard, type LandlordDraft } from "../WizardContext"
import { useAddLandlordSubflow } from "../addLandlordContext"
import { OptionRow } from "../OptionRow"
import { WField, WInput } from "./fields"

// ── Types ─────────────────────────────────────────────────────────────────────

interface LandlordRow {
  id:       string
  contacts: {
    id:            string
    first_name:    string | null
    last_name:     string | null
    company_name:  string | null
    primary_email: string | null
  } | null
}

function displayName(row: LandlordRow): string {
  const c = row.contacts
  if (!c) return "Unknown"
  if (c.company_name) return c.company_name
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed"
}

// ── Option selector ───────────────────────────────────────────────────────────

type OwnerOption = "existing" | "new" | "later"

const OPTION_CARDS: Array<{ value: OwnerOption; label: string; sub: string }> = [
  { value: "existing", label: "Pick existing owner",   sub: "Select from your contacts list" },
  { value: "new",      label: "Add new owner",         sub: "Enter their details now" },
  { value: "later",    label: "I'll add the owner later", sub: "We'll remind you — you can add from the property page" },
]

// ── New owner inline form ─────────────────────────────────────────────────────

type EntityType = "individual" | "company" | "trust"

interface NewOwnerFormProps {
  draft:    LandlordDraft
  onChange: (partial: Partial<LandlordDraft>) => void
}

function NewOwnerForm({ draft, onChange }: NewOwnerFormProps) {
  const entityType = (draft.entity_type ?? "individual") as EntityType

  const isTrust = entityType === "trust"
  const companyLabel = isTrust ? "Trust name" : "Company name"
  const companyPlaceholder = isTrust ? "Mokoena Family Trust" : "Blue Vista Properties (Pty) Ltd"

  return (
    <div className="space-y-4 rounded-[var(--r-button)] border border-border bg-muted/20 p-4">
      {/* Entity type — door pill */}
      <div className="flex gap-1 rounded-[var(--r-button)] border border-border bg-muted/40 p-1">
        {(["individual", "company", "trust"] as EntityType[]).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={entityType === t}
            onClick={() => onChange({ entity_type: t })}
            className={cn(
              "flex-1 rounded-[5px] px-3 py-1.5 text-xs font-medium capitalize transition-colors",
              entityType === t ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {entityType === "individual" ? (
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <WField label="First name" htmlFor="owner-first">
            <WInput id="owner-first" value={draft.first_name ?? ""} onChange={(v) => onChange({ first_name: v })} placeholder="Thabo" />
          </WField>
          <WField label="Last name" htmlFor="owner-last">
            <WInput id="owner-last" value={draft.last_name ?? ""} onChange={(v) => onChange({ last_name: v })} placeholder="Mokoena" />
          </WField>
        </div>
      ) : (
        <WField label={companyLabel} htmlFor="owner-company">
          <WInput id="owner-company" value={draft.company_name ?? ""} onChange={(v) => onChange({ company_name: v })} placeholder={companyPlaceholder} />
        </WField>
      )}

      <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
        <WField label="Email" htmlFor="owner-email">
          <WInput id="owner-email" type="email" value={draft.email ?? ""} onChange={(v) => onChange({ email: v })} placeholder="owner@example.com" />
        </WField>
        <WField label="Phone" htmlFor="owner-phone">
          <WInput id="owner-phone" type="tel" value={draft.phone ?? ""} onChange={(v) => onChange({ phone: v })} placeholder="082 000 0000" />
        </WField>
      </div>
      <p className="text-xs text-muted-foreground">
        Full details (ID, banking, FICA) are captured on the owner profile page after creation.
      </p>
    </div>
  )
}

// ── StepLandlord ──────────────────────────────────────────────────────────────

export function StepLandlord() {
  const { state, patch } = useWizard()
  const subflow = useAddLandlordSubflow()

  const [landlords, setLandlords]   = useState<LandlordRow[]>([])
  const [loading, setLoading]       = useState(true)
  const [searchQuery, setSearchQuery] = useState("")

  const option = (state.landlord?.option ?? null) as OwnerOption | null

  // Re-fetches on mount and after the add-landlord sub-flow creates one (refreshNonce bumps),
  // so the freshly-added owner appears in the picker and shows as selected.
  useEffect(() => {
    setLoading(true)
    fetch("/api/landlords")
      .then((r) => r.json())
      .then((data: { landlords?: LandlordRow[] }) => setLandlords(data.landlords ?? []))
      .catch(() => setLandlords([]))
      .finally(() => setLoading(false))
  }, [subflow?.refreshNonce])

  function setOption(o: OwnerOption) {
    // In the modal host, "add new owner" opens the shared add-party sub-flow (full FICA) in the
    // same modal instead of the inline form; it returns with the new owner selected.
    if (o === "new" && subflow) { subflow.openAddLandlord(); return }
    patch({
      landlord: {
        ...state.landlord,
        option: o,
        existing_id: o !== "existing" ? undefined : state.landlord?.existing_id,
      },
    })
  }

  function updateDraft(partial: Partial<LandlordDraft>) {
    patch({ landlord: { ...state.landlord, option: option ?? "new", ...partial } })
  }

  const filtered = landlords.filter((l) =>
    displayName(l).toLowerCase().includes(searchQuery.toLowerCase()) ||
    (l.contacts?.primary_email ?? "").toLowerCase().includes(searchQuery.toLowerCase()),
  )

  return (
    <div className="space-y-6">
      {/* Option cards */}
      <div className="space-y-1.5">
        {OPTION_CARDS.map((card) => (
          <OptionRow
            key={card.value}
            selected={option === card.value}
            onSelect={() => setOption(card.value)}
            label={card.label}
            sub={card.sub}
          />
        ))}
      </div>

      {/* Existing owner search */}
      {option === "existing" && (
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search by name or email…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-11 w-full rounded-[var(--r-button)] border border-border bg-card pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 hover:bg-muted/30 focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
            />
          </div>
          {loading && (
            <p className="text-sm text-muted-foreground py-2">Loading…</p>
          )}
          {!loading && filtered.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">No owners found.</p>
          )}
          {!loading && filtered.length > 0 && (
            <div className="max-h-56 divide-y divide-border overflow-y-auto rounded-[var(--r-button)] border border-border">
              {filtered.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => updateDraft({ option: "existing", existing_id: row.id })}
                  className={cn(
                    "w-full text-left px-4 py-3 text-sm transition-colors hover:bg-muted/50",
                    state.landlord?.existing_id === row.id && "bg-primary/5",
                  )}
                >
                  <span className="block font-medium">{displayName(row)}</span>
                  {row.contacts?.primary_email && (
                    <span className="block text-xs text-muted-foreground">
                      {row.contacts.primary_email}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* New owner inline form */}
      {option === "new" && (
        <NewOwnerForm
          draft={state.landlord ?? { option: "new", entity_type: "individual" }}
          onChange={updateDraft}
        />
      )}

      {/* Later — track picker */}
      {option === "later" && (
        <LaterPanel
          track={state.landlord?.later_track ?? null}
          email={state.landlord?.email ?? ""}
          onChangeTrack={(t) => updateDraft({ later_track: t, email: t === "self" ? undefined : state.landlord?.email })}
          onChangeEmail={(e) => updateDraft({ email: e, later_track: "owner_email" })}
        />
      )}
    </div>
  )
}

// ── Later panel ───────────────────────────────────────────────────────────────

interface LaterPanelProps {
  track:         "owner_email" | "self" | null
  email:         string
  onChangeTrack: (t: "owner_email" | "self") => void
  onChangeEmail: (e: string) => void
}

function LaterPanel({ track, email, onChangeTrack, onChangeEmail }: LaterPanelProps) {
  const TRACKS: Array<{ value: "owner_email" | "self"; label: string; sub: string }> = [
    { value: "owner_email", label: "Email the owner when I'm ready", sub: "We'll send them a short form to fill in" },
    { value: "self",        label: "I'll handle it myself",           sub: "Just remind me — no email to the owner" },
  ]

  return (
    <div className="space-y-3 rounded-[var(--r-button)] border border-border bg-muted/20 p-4">
      <p className="text-sm font-medium text-foreground">How should we follow up?</p>
      <div className="space-y-1.5">
        {TRACKS.map((t) => (
          <OptionRow
            key={t.value}
            selected={track === t.value}
            onSelect={() => onChangeTrack(t.value)}
            label={t.label}
            sub={t.sub}
          />
        ))}
      </div>

      {track === "owner_email" && (
        <WField label="Owner's email (optional — add later if unsure)" htmlFor="later-owner-email">
          <WInput id="later-owner-email" type="email" placeholder="owner@example.com" value={email} onChange={onChangeEmail} />
        </WField>
      )}
    </div>
  )
}
