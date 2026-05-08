"use client"

/**
 * components/legal/LegalPageLayout.tsx — shared shell for /privacy, /terms, /credit-check-policy
 *
 * Auth:   public
 * Notes:  IntersectionObserver scrollspy drives TOC active state.
 *         Doc switcher reads pathname to highlight current document.
 *         CSS classes (.legal-hero, .kicker, .sidenav-*, etc.) live in public.css.
 */
import { useState, useEffect, Fragment } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LEGAL_VERSIONS } from "@/lib/legal-versions"

export interface LegalSection { id: string; num: string; label: string }
export interface KickerCell   { label: string; value: string; mono?: boolean }

interface Props {
  readonly eyebrowParts: string[]
  readonly titleBefore: string
  readonly titleHighlight: string
  readonly titleAfter?: string
  readonly subtitle: string
  readonly kicker: KickerCell[]
  readonly sections: LegalSection[]
  readonly hasSummary?: boolean
  readonly showDocLinks?: boolean
  readonly endLabel: string
  readonly children: React.ReactNode
}

const LEGAL_DOCS = [
  { href: "/definitions",       label: "Definitions",          version: LEGAL_VERSIONS.definitions       },
  { href: "/cookie-policy",       label: "Cookie policy",       version: LEGAL_VERSIONS.cookiePolicy      },
  { href: "/credit-check-policy", label: "Credit check policy", version: LEGAL_VERSIONS.creditCheckPolicy },
  { href: "/paia-manual",         label: "PAIA manual",         version: LEGAL_VERSIONS.paiaManual        },
  { href: "/popia-register",      label: "POPIA register",      version: LEGAL_VERSIONS.popiaRegister     },
  { href: "/privacy",             label: "Privacy policy",      version: LEGAL_VERSIONS.privacy           },
  { href: "/terms",               label: "Terms of service",    version: LEGAL_VERSIONS.terms             },
]

export function LegalPageLayout({
  eyebrowParts, titleBefore, titleHighlight, titleAfter = "",
  subtitle, kicker, sections, hasSummary = false, showDocLinks = true, endLabel, children,
}: Props) {
  const pathname = usePathname()
  const [activeId, setActiveId] = useState<string>("")

  useEffect(() => {
    const ids = hasSummary ? ["summary", ...sections.map(s => s.id)] : sections.map(s => s.id)

    function update() {
      let current = ids[0] ?? ""
      for (const id of ids) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top <= 100) current = id
      }
      setActiveId(current)
    }

    window.addEventListener("scroll", update, { passive: true })
    update()
    return () => window.removeEventListener("scroll", update)
  }, [sections, hasSummary])

  return (
    <>
      {/* Hero */}
      <section className="legal-hero">
        <div className="legal-hero-bg" aria-hidden="true">
          <DocsBackground />
        </div>
        <div className="legal-hero-inner">
          <span className="legal-eyebrow">
            {eyebrowParts.map((part, i) => (
              <Fragment key={part}>
                {i > 0 && <span className="sep" />}
                <span>{part}</span>
              </Fragment>
            ))}
          </span>
          <h1 className="legal-title">
            {titleBefore} <span className="hl">{titleHighlight}</span>{titleAfter ? ` ${titleAfter}` : ""}
          </h1>
          <p className="legal-sub">{subtitle}</p>
          <div className="kicker">
            {kicker.map((cell) => (
              <div key={cell.label} className="kicker-cell">
                <span className="kicker-l">{cell.label}</span>
                <span className={`kicker-v${cell.mono ? " mono" : ""}`}>{cell.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Body grid */}
      <div className="legal-body">

        {/* Side nav */}
        <aside className="sidenav">
          <div className="sidenav-eyebrow">
            <span>On this page</span><span className="rule" />
          </div>
          <ul className="sidenav-list">
            {hasSummary && (
              <li>
                <a href="#summary" className={activeId === "summary" ? "is-active" : ""}>
                  <span className="num">—</span>
                  <span>Summary</span>
                </a>
              </li>
            )}
            {sections.map(section => (
              <li key={section.id}>
                <a href={`#${section.id}`} className={activeId === section.id ? "is-active" : ""}>
                  <span className="num">{section.num}</span>
                  <span>{section.label}</span>
                </a>
              </li>
            ))}
          </ul>

          {showDocLinks && (
            <div className="sidenav-section">
              <div className="sidenav-eyebrow">
                <span>Legal docs</span><span className="rule" />
              </div>
              <ul className="docswitch">
                {LEGAL_DOCS.map(doc => (
                  <li key={doc.href}>
                    <Link href={doc.href} className={pathname === doc.href ? "is-current" : ""}>
                      <span className="glyph">§</span>
                      <span>{doc.label}</span>
                      <span className="stamp">{doc.version}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="sidenav-foot">
            <span style={{ color: "var(--ink-faint)" }}>Pleks (Pty) Ltd · ZA</span>
          </div>
        </aside>

        {/* Content */}
        <main className="legal-content">
          {children}
          <div className="endstamp">
            <span className="seal">
              <span className="ring">P</span>
              <span>{endLabel}</span>
            </span>
            <span style={{ color: "var(--ink-faint)" }}>Effective 1 April 2026</span>
          </div>
        </main>
      </div>
    </>
  )
}

function DocsBackground() {
  return (
    <svg
      viewBox="0 0 1440 560"
      preserveAspectRatio="xMidYMid slice"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.5, color: "var(--amber-ink)" }}
      aria-hidden="true"
    >
      <defs>
        <pattern id="legal-dotgrid" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.9" fill="currentColor" fillOpacity="0.18" />
        </pattern>
        <pattern id="legal-hatch" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="currentColor" strokeWidth="0.6" strokeOpacity="0.18" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#legal-dotgrid)" />
      <g fontFamily="JetBrains Mono, monospace" fontSize="9" fill="currentColor" fillOpacity="0.7">
        <text x="40" y="36">PLEKS · LEGAL REGISTRY · BOOK 04</text>
        <text x="1400" y="36" textAnchor="end">FOL. 0117 · POPIA · CPA · NCA</text>
        <line x1="40" y1="46" x2="1400" y2="46" stroke="currentColor" strokeOpacity="0.22" strokeDasharray="2 4" />
      </g>
      {/* FORM card: top left, behind eyebrow/title area */}
      <g transform="translate(80,50)" stroke="currentColor" strokeOpacity="0.22" fill="none">
        <rect x="0" y="0" width="220" height="140" rx="3" fill="currentColor" fillOpacity="0.025" />
        <line x1="0" y1="22" x2="220" y2="22" />
        <text x="12" y="16" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="currentColor" fillOpacity="0.7" stroke="none">FORM · POPIA-S22</text>
        <line x1="14" y1="40" x2="206" y2="40" strokeDasharray="2 3" />
        <line x1="14" y1="56" x2="170" y2="56" strokeDasharray="2 3" />
        <line x1="14" y1="72" x2="194" y2="72" strokeDasharray="2 3" />
        <line x1="14" y1="88" x2="148" y2="88" strokeDasharray="2 3" />
        <rect x="14" y="100" width="64" height="22" rx="2" fill="currentColor" fillOpacity="0.08" />
        <text x="46" y="115" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="currentColor" fillOpacity="0.85" stroke="none">CONSENT</text>
      </g>
      {/* Clause ledger card: top right */}
      <g transform="translate(1060,70)" stroke="currentColor" strokeOpacity="0.22" fill="none">
        <rect x="0" y="0" width="280" height="160" rx="3" fill="currentColor" fillOpacity="0.025" />
        <text x="14" y="20" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="currentColor" fillOpacity="0.7" stroke="none">CLAUSE LEDGER · S04</text>
        <line x1="0" y1="28" x2="280" y2="28" />
        <g fontFamily="JetBrains Mono, monospace" fontSize="7.5" fill="currentColor" fillOpacity="0.55" stroke="none">
          <text x="14" y="46">§ 04.01  acceptance</text>
          <text x="14" y="62">§ 04.02  service description</text>
          <text x="14" y="78">§ 04.03  subscription &amp; payment</text>
          <text x="14" y="94">§ 04.04  cancellation · 90 days</text>
          <text x="14" y="110">§ 04.05  prohibited uses</text>
          <text x="14" y="126">§ 04.06  limitation of liability</text>
          <text x="14" y="142">§ 04.07  governing law · ZA · WC</text>
        </g>
        <line x1="200" y1="34" x2="200" y2="150" strokeDasharray="1 3" />
      </g>
      {/* POPIA stamp circle */}
      <g transform="translate(820,360)" stroke="currentColor" strokeOpacity="0.22" fill="none">
        <circle cx="0" cy="0" r="48" />
        <circle cx="0" cy="0" r="42" strokeDasharray="2 3" />
        <text x="0" y="-14" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="6.5" fill="currentColor" fillOpacity="0.7" stroke="none">REPUBLIC OF SOUTH AFRICA</text>
        <text x="0" y="3" textAnchor="middle" fontFamily="Inter Tight, sans-serif" fontSize="11" fontWeight="600" fill="currentColor" fillOpacity="0.8" stroke="none">POPIA</text>
        <text x="0" y="16" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="6.5" fill="currentColor" fillOpacity="0.6" stroke="none">ACT 4 OF 2013</text>
        <line x1="-30" y1="26" x2="30" y2="26" />
      </g>
      {/* Margin paragraph markers */}
      <g fontFamily="JetBrains Mono, monospace" fontSize="7.5" fill="currentColor" fillOpacity="0.5" stroke="none">
        <text x="40" y="120">¶ 01</text>
        <text x="40" y="160">¶ 02</text>
        <text x="40" y="200">¶ 03</text>
        <text x="40" y="240">¶ 04</text>
      </g>
      <rect x="0" y="540" width="1440" height="20" fill="url(#legal-hatch)" opacity="0.8" />
    </svg>
  )
}
