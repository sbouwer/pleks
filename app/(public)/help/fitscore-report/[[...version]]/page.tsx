/**
 * app/(public)/help/fitscore-report/[[...version]]/page.tsx — "How to Read Your FitScore Report"
 *
 * Route:  /help/fitscore-report              (current version)
 *         /help/fitscore-report/v1.0         (version-specific — linked from PDF footer + L2 responses)
 * Auth:   public — no authentication required; search engine indexing allowed
 * Notes:  Discharges POPIA s71 mechanism #2 per COMPOSITE.md §1.5 ("documenting band criteria publicly").
 *         Version-specific URLs are permanent — the PDF footer and L2 responses link to them.
 *         Content lives in content/help/fitscore-report/v<version>.tsx (CODEOWNERS protected).
 *         Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §9.
 */

import { notFound } from "next/navigation"
import Link from "next/link"
import type { Metadata } from "next"
import { LegalPageLayout } from "@/components/legal/LegalPageLayout"
import { FitScoreHelpContent } from "@/content/help/fitscore-report/v1.0"

// ─── Version registry ────────────────────────────────────────────────────────
// When interpretation.v1.1 ships: add { slug: 'v1.1', label: 'interpretation.v1.1', ... }
// and import the new content component above.

const CURRENT_VERSION_SLUG = 'v1.0'

const VERSION_REGISTRY: Record<string, {
  label:       string
  published:   string
  engineCovers: string
  component:   React.ComponentType
}> = {
  'v1.0': {
    label:        'interpretation.v1.0',
    published:    '2026 · 05 · 22',
    engineCovers: 'fitscore.v1.0 · narr.v1.0',
    component:    FitScoreHelpContent,
  },
}

// ─── Sections (TOC) ──────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'what-is',    num: '01', label: 'What is the FitScore Report?' },
  { id: 'doctrine',   num: '02', label: 'The doctrine'                  },
  { id: 'pillars',    num: '03', label: 'The four pillars'              },
  { id: 'dimensions', num: '04', label: 'The four dimensions'           },
  { id: 'bands',      num: '05', label: 'The bands explained'           },
  { id: 'flags',      num: '06', label: 'Material Flags'                },
  { id: 'confidence', num: '07', label: 'Confidence vs Verification Integrity' },
  { id: 'ldp',        num: '08', label: 'Limited Data Profile'          },
  { id: 'foreign',    num: '09', label: 'Foreign-national applicants'   },
  { id: 'no-decision',num: '10', label: 'Pleks doesn\'t decide'         },
  { id: 'disagree',   num: '11', label: 'What if I disagree?'           },
  { id: 'versioning', num: '12', label: 'Versioning and historical reports' },
]

// ─── Route params ─────────────────────────────────────────────────────────────

interface PageParams { version?: string[] }

function resolveSlug(params: PageParams): string | null {
  if (params.version && params.version.length > 0) {
    return params.version.length === 1 ? (params.version[0] ?? null) : null
  }
  return CURRENT_VERSION_SLUG
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: Readonly<{ params: Promise<PageParams> }>): Promise<Metadata> {
  const p = await params
  const slug = resolveSlug(p)
  const entry = slug ? VERSION_REGISTRY[slug] : null

  if (!entry) return { title: 'Not found — Pleks' }

  const versionSuffix = slug !== CURRENT_VERSION_SLUG ? ` (${entry.label})` : ''

  return {
    title: `How to Read Your FitScore Report${versionSuffix} — Pleks`,
    description:
      'Plain-English explanation of the Pleks FitScore Report — what the bands mean, ' +
      'how the dimensions are scored, what the material flags indicate, and how the ' +
      'methodology is version-controlled for POPIA transparency.',
    robots: { index: true, follow: true },
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function FitScoreHelpPage({ params }: Readonly<{ params: Promise<PageParams> }>) {
  const p = await params
  const slug = resolveSlug(p)
  const entry = slug ? VERSION_REGISTRY[slug] : null

  if (!entry) notFound()

  const { label, published, engineCovers, component: Content } = entry
  const isHistoricalVersion = slug !== CURRENT_VERSION_SLUG

  return (
    <LegalPageLayout
      eyebrowParts={['HOW TO READ', 'FitScore Report', label]}
      titleBefore="FitScore"
      titleHighlight="Report"
      titleAfter=" — How to Read"
      subtitle={
        'Plain-English explanation of the Pleks FitScore Report. What each band reflects, ' +
        'how the four dimensions are scored, what material flags mean, and how to escalate ' +
        'if you disagree with an assessment.'
      }
      kicker={[
        { label: 'Document',      value: label,        mono: true },
        { label: 'Published',     value: published,    mono: true },
        { label: 'Engine covers', value: engineCovers             },
        { label: 'Jurisdiction',  value: 'Republic of South Africa' },
      ]}
      sections={SECTIONS}
      hasSummary={false}
      showDocLinks={false}
      endLabel={`END · FITSCORE INTERPRETATION · ${label}`}
    >
      {isHistoricalVersion && (
        <div className="pub-notice" style={{ marginBottom: 32 }}>
          <div className="pub-notice-inner">
            <span className="pub-notice-dot" />
            You are reading a historical version of this document ({label}).{' '}
            <Link href="/help/fitscore-report">View the current version</Link>.
          </div>
        </div>
      )}
      <Content />
    </LegalPageLayout>
  )
}
