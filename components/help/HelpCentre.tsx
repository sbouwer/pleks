"use client"

/**
 * components/help/HelpCentre.tsx — Role-scoped, searchable Help Centre (BUILD_68)
 *
 * Auth:   rendered by app/(dashboard)/help/page.tsx with the session role + a role-resolved
 *         back-href (PORTAL_DEFAULTS[role]) — never identity-in-URL (D-HELP-10).
 * Notes:  Content from lib/help/help-data.ts (one corpus). Search is a client-side filter over
 *         q+a+keywords (D-HELP-06) — works offline, no network. The search box doubles as the
 *         future AI ask box (D-HELP-08, reserved not built). Sticky bar keeps "← Back to
 *         dashboard" always visible (D-HELP-09). Categories with no entries for the role don't
 *         render. Theme via tokens (no hardcoded colours, D-HELP-16).
 */

import { useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { ChevronLeft, Search, ChevronDown, LifeBuoy } from "lucide-react"
import {
  entriesForRole, categoriesForRole, HELP_SUPPORT_EMAIL, type HelpRole, type HelpEntry,
} from "@/lib/help/help-data"

interface HelpCentreProps {
  role:     HelpRole
  backHref: string
}

export function HelpCentre({ role, backHref }: Readonly<HelpCentreProps>) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState<Set<string>>(new Set())

  const entries = useMemo(() => entriesForRole(role), [role])
  const categories = useMemo(() => categoriesForRole(role), [role])

  const q = query.trim().toLowerCase()
  const matches = useMemo<HelpEntry[] | null>(() => {
    if (!q) return null
    return entries.filter((e) =>
      `${e.q} ${e.a} ${e.keywords?.join(" ") ?? ""}`.toLowerCase().includes(q),
    )
  }, [entries, q])

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const isOpen = (id: string) => (matches ? true : open.has(id))

  let resultsNode: ReactNode
  if (matches && matches.length > 0) {
    resultsNode = (
      <Section
        label={`${matches.length} result${matches.length === 1 ? "" : "s"}`}
        entries={matches}
        isOpen={isOpen}
        toggle={toggle}
      />
    )
  } else if (matches) {
    resultsNode = <EmptyState query={query} />
  } else {
    resultsNode = categories.map((cat) => (
      <Section
        key={cat.id}
        label={cat.label}
        entries={entries.filter((e) => e.category === cat.id)}
        isOpen={isOpen}
        toggle={toggle}
      />
    ))
  }

  return (
     <div className="mx-auto max-w-3xl px-4 pb-16 pt-3">
      {/* Role-aware back to the user's home (D-HELP-09). The branded header + theme are now in the
          (help) layout (ADDENDUM_68A B11) — HelpCentre no longer self-rolls its shell. */}
      <Link
        href={backHref}
        className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to dashboard
      </Link>

      {/* Hero + search (= the future AI ask box, D-HELP-08) */}
      <div className="px-1 pt-6 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-brand/10 text-brand">
          <LifeBuoy className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">How can we help?</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Search the answers below, or reach the team if you&apos;re still stuck.
        </p>

        <div className="relative mx-auto mt-5 max-w-xl">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search help…"
            aria-label="Search help"
            className="w-full rounded-lg border border-border bg-surface py-2.5 pl-10 pr-4 text-sm outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/30"
          />
          <span className="mt-1.5 block text-[11px] text-muted-foreground">
            Soon: ask in your own words and get a direct answer.
          </span>
        </div>
      </div>

      {/* Results */}
      <div className="mt-8 space-y-6 px-1">{resultsNode}</div>

      {/* Still stuck */}
      <div className="mt-10 rounded-xl border border-border bg-muted/40 p-5 text-center">
        <p className="text-sm font-semibold">Still stuck?</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Email the team, or use the help button (bottom-right) to report a problem or send feedback.
        </p>
        <a
          href={`mailto:${HELP_SUPPORT_EMAIL}`}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-transform hover:scale-[1.02]"
        >
          Email {HELP_SUPPORT_EMAIL}
        </a>
      </div>
     </div>
  )
}

function Section({
  label, entries, isOpen, toggle,
}: Readonly<{ label: string; entries: HelpEntry[]; isOpen: (id: string) => boolean; toggle: (id: string) => void }>) {
  if (entries.length === 0) return null
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h2>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {entries.map((e) => {
          const open = isOpen(e.id)
          return (
            <div key={e.id}>
              <button
                type="button"
                onClick={() => toggle(e.id)}
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-muted/40"
              >
                <span>{e.q}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
              </button>
              {open && (
                <div className="px-4 pb-4 pt-0 text-sm leading-relaxed text-muted-foreground">
                  {e.a}
                  {e.roles.length > 1 && (
                    <span className="mt-2 block text-[11px] uppercase tracking-wide text-muted-foreground/70">
                      Applies to everyone
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function EmptyState({ query }: Readonly<{ query: string }>) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
      <p className="text-sm font-medium">No answers for &ldquo;{query.trim()}&rdquo;</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Try different words, or email{" "}
        <a href={`mailto:${HELP_SUPPORT_EMAIL}`} className="text-brand hover:underline">{HELP_SUPPORT_EMAIL}</a>.
      </p>
    </div>
  )
}
