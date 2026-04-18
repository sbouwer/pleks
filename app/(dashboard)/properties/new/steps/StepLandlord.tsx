"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { useWizard, type LandlordDraft } from "../WizardContext"
import { OptionRow } from "../OptionRow"

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

  return (
    <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
      {/* Entity type */}
      <div className="flex gap-2">
        {(["individual", "company", "trust"] as EntityType[]).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={entityType === t}
            onClick={() => onChange({ entity_type: t })}
            className={cn(
              "flex-1 rounded-lg border px-3 py-2 text-xs font-medium capitalize transition-colors",
              entityType === t
                ? "border-primary bg-primary/5 text-primary"
                : "border-border text-muted-foreground hover:border-primary/40",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {entityType === "individual" ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="owner-first" className="text-xs font-medium">First name</label>
            <input
              id="owner-first"
              type="text"
              value={draft.first_name ?? ""}
              onChange={(e) => onChange({ first_name: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Thabo"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="owner-last" className="text-xs font-medium">Last name</label>
            <input
              id="owner-last"
              type="text"
              value={draft.last_name ?? ""}
              onChange={(e) => onChange({ last_name: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Mokoena"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          {(() => {
            const isTrust = entityType === "trust"
            const fieldLabel = isTrust ? "Trust name" : "Company name"
            const placeholder = isTrust ? "Mokoena Family Trust" : "Blue Vista Properties (Pty) Ltd"
            return (
              <>
                <label htmlFor="owner-company" className="text-xs font-medium">{fieldLabel}</label>
                <input
                  id="owner-company"
                  type="text"
                  value={draft.company_name ?? ""}
                  onChange={(e) => onChange({ company_name: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder={placeholder}
                />
              </>
            )
          })()}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="owner-email" className="text-xs font-medium">Email</label>
          <input
            id="owner-email"
            type="email"
            value={draft.email ?? ""}
            onChange={(e) => onChange({ email: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="owner@example.com"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="owner-phone" className="text-xs font-medium">Phone</label>
          <input
            id="owner-phone"
            type="tel"
            value={draft.phone ?? ""}
            onChange={(e) => onChange({ phone: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="082 000 0000"
          />
        </div>
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

  const [landlords, setLandlords]   = useState<LandlordRow[]>([])
  const [loading, setLoading]       = useState(true)
  const [searchQuery, setSearchQuery] = useState("")

  const option = (state.landlord?.option ?? null) as OwnerOption | null

  useEffect(() => {
    fetch("/api/landlords")
      .then((r) => r.json())
      .then((data: { landlords?: LandlordRow[] }) => setLandlords(data.landlords ?? []))
      .catch(() => setLandlords([]))
      .finally(() => setLoading(false))
  }, [])

  function setOption(o: OwnerOption) {
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
          <input
            type="search"
            placeholder="Search by name or email…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          {loading && (
            <p className="text-sm text-muted-foreground py-2">Loading…</p>
          )}
          {!loading && filtered.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">No owners found.</p>
          )}
          {!loading && filtered.length > 0 && (
            <div className="max-h-56 overflow-y-auto rounded-lg border divide-y">
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
    <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
      <p className="text-sm font-medium">How should we follow up?</p>
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
        <div className="space-y-1">
          <label htmlFor="later-owner-email" className="text-xs font-medium block">
            Owner&apos;s email <span className="text-muted-foreground font-normal">(optional — add later if unsure)</span>
          </label>
          <input
            id="later-owner-email"
            type="email"
            placeholder="owner@example.com"
            value={email}
            onChange={(e) => onChangeEmail(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      )}
    </div>
  )
}
