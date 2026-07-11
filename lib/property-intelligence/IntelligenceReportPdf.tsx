/**
 * lib/property-intelligence/IntelligenceReportPdf.tsx — React PDF template for PI pull results
 *
 * Data:   IntelligenceReportData passed as props from /api/property-intelligence/run/[pullId]
 * Notes:  ADDENDUM_14A. Server-side only — rendered via renderToBuffer. One template covers
 *         all four product types via a discriminated union on productType. Helvetica throughout.
 */
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer"
import { fmtZA } from "@/lib/dates"
import { formatZAR } from "@/lib/constants"
import type {
  DeedsSearchFacts,
  LightstoneErfShortFacts,
  CipcCompanyFacts,
  CipcDirectorFacts,
} from "@/lib/property-intelligence/types"

// ── Shared styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    fontFamily:  "Helvetica",
    fontSize:    10,
    color:       "#111111",
    padding:     40,
    backgroundColor: "#ffffff",
  },
  header: {
    marginBottom: 20,
    borderBottom: "1pt solid #e2e8f0",
    paddingBottom: 12,
  },
  title: {
    fontSize:   16,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 9,
    color:    "#6b7280",
  },
  section: {
    marginTop: 14,
  },
  sectionLabel: {
    fontFamily:   "Helvetica-Bold",
    fontSize:     9,
    color:        "#6b7280",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: {
    flexDirection:  "row",
    paddingVertical: 5,
    borderBottom:   "0.5pt solid #f1f5f9",
  },
  rowLabel: {
    width:    "40%",
    color:    "#4b5563",
    fontSize: 9,
  },
  rowValue: {
    width:    "60%",
    fontFamily: "Helvetica-Bold",
  },
  footer: {
    position:  "absolute",
    bottom:    30,
    left:      40,
    right:     40,
    fontSize:  8,
    color:     "#9ca3af",
    borderTop: "0.5pt solid #e2e8f0",
    paddingTop: 6,
  },
  badge: {
    backgroundColor: "#f0fdf4",
    color:           "#15803d",
    padding:         "4 8",
    borderRadius:    4,
    fontSize:        9,
    fontFamily:      "Helvetica-Bold",
    alignSelf:       "flex-start",
    marginTop:       8,
  },
  disclaimer: {
    marginTop:  16,
    padding:    10,
    backgroundColor: "#fafafa",
    borderRadius: 4,
    fontSize:   8,
    color:      "#6b7280",
  },
})

const formatCents = (cents: number | null): string =>
  cents == null ? "—" : formatZAR(cents, true)

const formatDate = (d: string | null): string => {
  if (!d) return "—"
  try { return fmtZA(d, { day: "2-digit", month: "long", year: "numeric" }) }
  catch { return d }
}

// ── Product-specific fact sections ─────────────────────────────────────────────

function DeedsSection({ facts }: { facts: DeedsSearchFacts }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Ownership Record</Text>
      {[
        ["Registered owner",  facts.owner_name ?? "—"],
        ["ID number",         facts.owner_id_number ?? "—"],
        ["Purchase date",     formatDate(facts.purchase_date)],
        ["Purchase price",    formatCents(facts.purchase_price_cents)],
        ["Title deed number", facts.deed_number ?? "—"],
        ["Transfer date",     formatDate(facts.transfer_date)],
      ].map(([label, value]) => (
        <View key={label} style={styles.row}>
          <Text style={styles.rowLabel}>{label}</Text>
          <Text style={styles.rowValue}>{value}</Text>
        </View>
      ))}
    </View>
  )
}

function LightstoneSection({ facts }: { facts: LightstoneErfShortFacts }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Valuation</Text>
      {[
        ["Estimated value",    formatCents(facts.estimated_value_cents)],
        ["Value range (low)",  formatCents(facts.value_low_cents)],
        ["Value range (high)", formatCents(facts.value_high_cents)],
        ["Confidence",         facts.confidence ?? "—"],
        ["Last sale date",     formatDate(facts.last_sale_date)],
        ["Last sale price",    formatCents(facts.last_sale_price_cents)],
      ].map(([label, value]) => (
        <View key={label} style={styles.row}>
          <Text style={styles.rowLabel}>{label}</Text>
          <Text style={styles.rowValue}>{value}</Text>
        </View>
      ))}
    </View>
  )
}

function CipcCompanySection({ facts }: { facts: CipcCompanyFacts }) {
  const isActive = facts.status?.toLowerCase() === "active"
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Company Record</Text>
      {[
        ["Registered name",    facts.registered_name ?? "—"],
        ["Registration no.",   facts.registration_number ?? "—"],
        ["Status",             facts.status ?? "—"],
        ["Status date",        formatDate(facts.status_date)],
        ["Registered address", facts.registered_address ?? "—"],
        ["Business start",     formatDate(facts.business_start_date)],
      ].map(([label, value]) => (
        <View key={label} style={styles.row}>
          <Text style={styles.rowLabel}>{label}</Text>
          <Text style={styles.rowValue}>{value}</Text>
        </View>
      ))}
      {isActive && <Text style={styles.badge}>ACTIVE</Text>}
    </View>
  )
}

function CipcDirectorSection({ facts }: { facts: CipcDirectorFacts }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Director Record</Text>
      {[
        ["Director name",    facts.director_name ?? "—"],
        ["ID number",        facts.director_id_number ?? "—"],
        ["Position",         facts.position ?? "—"],
        ["Appointment date", formatDate(facts.appointment_date)],
        ["Status",           facts.status ?? "—"],
      ].map(([label, value]) => (
        <View key={label} style={styles.row}>
          <Text style={styles.rowLabel}>{label}</Text>
          <Text style={styles.rowValue}>{value}</Text>
        </View>
      ))}
    </View>
  )
}

// ── Main document ──────────────────────────────────────────────────────────────

export interface IntelligenceReportData {
  orgName:           string
  productType:       string
  productLabel:      string
  subjectLabel:      string
  pulledByEmail:     string
  pulledAt:          string
  facts:
    | DeedsSearchFacts
    | LightstoneErfShortFacts
    | CipcCompanyFacts
    | CipcDirectorFacts
}

export function IntelligenceReportPdf({ d }: { d: IntelligenceReportData }) {
  return (
    <Document title={`${d.productLabel} — ${d.subjectLabel}`} author="Pleks">
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>{d.productLabel}</Text>
          <Text style={styles.subtitle}>{d.subjectLabel}</Text>
          <Text style={styles.subtitle}>{d.orgName} · Pulled {formatDate(d.pulledAt)} by {d.pulledByEmail}</Text>
        </View>

        {d.productType === "deeds_search" && (
          <DeedsSection facts={d.facts as DeedsSearchFacts} />
        )}
        {d.productType === "lightstone_erf_short" && (
          <LightstoneSection facts={d.facts as LightstoneErfShortFacts} />
        )}
        {d.productType === "cipc_company" && (
          <CipcCompanySection facts={d.facts as CipcCompanyFacts} />
        )}
        {d.productType === "cipc_director" && (
          <CipcDirectorSection facts={d.facts as CipcDirectorFacts} />
        )}

        <View style={styles.disclaimer}>
          <Text>
            This report was sourced from Searchworx SA on behalf of {d.orgName}. Data is sourced from
            public registers (Deeds Office, Lightstone, CIPC) and is accurate as at the date of retrieval.
            Pleks and Searchworx accept no liability for decisions made on the basis of this report.
            Retained in accordance with PPRA mandate-record requirements.
          </Text>
        </View>

        <View style={styles.footer} fixed>
          <Text>Pleks Property Intelligence · {d.productLabel} · {formatDate(d.pulledAt)} · Confidential</Text>
        </View>
      </Page>
    </Document>
  )
}
