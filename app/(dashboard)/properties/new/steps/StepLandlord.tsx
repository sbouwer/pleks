"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { useWizard, type LandlordDraft } from "../WizardContext"

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
      <div>
        <h2 className="font-heading text-2xl mb-1">Who owns this property?</h2>
        <p className="text-muted-foreground text-sm">
          The owner receives statements and insurance requests &mdash; they don&apos;t need a Pleks account.
        </p>
      </div>

      {/* Option cards */}
      <div className="space-y-2">
        {OPTION_CARDS.map((card) => (
          <button
            key={card.value}
            type="button"
            aria-pressed={option === card.value}
            onClick={() => setOption(card.value)}
            className={cn(
              "w-full text-left rounded-lg border px-4 py-3 transition-colors",
              option === card.value
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border hover:border-primary/40",
            )}
          >
            <span className="block text-sm font-medium">{card.label}</span>
            <span className="block text-xs text-muted-foreground mt-0.5">{card.sub}</span>
          </button>
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

      {/* Later — info note */}
      {option === "later" && (
        <div className="rounded-lg border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          The property will be created without an owner linked. You can add the owner from the
          property Overview tab at any time. The setup widget will flag it as outstanding.
        </div>
      )}
    </div>
  )
}
