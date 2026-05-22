/**
 * lib/reports/screening/_pdf/primitives/RiskUncertaintySplit.tsx
 *
 * §2.3 — Two-column panel: observed concerns (risk) vs limited visibility (uncertainty).
 * Architectural separation per COMPOSITE.md §1.2: risk = what was observed in evidence;
 * uncertainty = what was absent or incomplete. Both inform review; neither is the same finding.
 * Sources: narrative.observedConcerns and narrative.limitedVisibility — always present.
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.3.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { C, FONTS, sp } from "./theme"
import type { FitScoreReportData } from "./theme"
import { SectionHeader } from "./SectionHeader"

const S = StyleSheet.create({
  wrap: { marginBottom: 16 },

  doctrine: {
    fontFamily:   FONTS.sans,
    fontSize:     8.5,
    color:        C.ink.mute,
    lineHeight:   1.6,
    marginBottom: 12,
  },

  split: {
    flexDirection: 'row',
    gap:           10,
  },
  col: {
    flex:            1,
    borderWidth:     0.75,
    borderColor:     C.rule.base,
    backgroundColor: C.surface.paperRaised,
  },
  colHead: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 14,
    paddingVertical:   10,
    borderBottomWidth: 0.75,
    borderBottomColor: C.rule.base,
    backgroundColor:   C.surface.paperSunk,
  },
  colHeadLeft: { gap: 3 },
  colRef: {
    fontFamily:    FONTS.mono,
    fontSize:      6.5,
    letterSpacing: 0.8,
    color:         C.ink.mute,
  },
  colTitle: {
    fontFamily: FONTS.sans,
    fontSize:   9,
    fontWeight: 'bold',
    color:      C.ink.primary,
  },
  countPill: {
    fontFamily:        FONTS.mono,
    fontSize:          6.5,
    letterSpacing:     0.5,
    color:             C.ink.mute,
    paddingHorizontal: 6,
    paddingVertical:   2,
    borderWidth:       0.75,
    borderColor:       C.rule.base,
    borderRadius:      2,
  },

  colBody: {
    paddingHorizontal: 14,
    paddingVertical:   12,
    gap:               10,
  },
  item: {
    paddingBottom: 8,
    borderBottomWidth: 0.75,
    borderBottomColor: C.rule.base,
  },
  itemLast: {
    paddingBottom:     0,
    borderBottomWidth: 0,
  },
  itemText: {
    fontFamily: FONTS.sans,
    fontSize:   8.5,
    color:      C.ink.primary,
    lineHeight: 1.55,
  },
  emptyText: {
    fontFamily: FONTS.sans,
    fontSize:   8.5,
    color:      C.ink.faint,
    lineHeight: 1.55,
  },
})

interface ColProps {
  docRef:  string
  title:   string
  items:   string[]
  empty:   string
}

function Col({ docRef, title, items, empty }: Readonly<ColProps>) {
  return (
    <View style={S.col}>
      <View style={S.colHead}>
        <View style={S.colHeadLeft}>
          <Text style={S.colRef}>{docRef}</Text>
          <Text style={S.colTitle}>{title}</Text>
        </View>
        <Text style={S.countPill}>{`${items.length} item${items.length === 1 ? '' : 's'}`}</Text>
      </View>

      <View style={S.colBody}>
        {items.length === 0
          ? <Text style={S.emptyText}>{empty}</Text>
          : items.map((item, i) => (
              <View
                key={`${i}-${item.slice(0, 16)}`}
                style={i === items.length - 1 ? S.itemLast : S.item}
              >
                <Text style={S.itemText}>{sp(item)}</Text>
              </View>
            ))
        }
      </View>
    </View>
  )
}

interface RiskUncertaintySplitProps {
  data: FitScoreReportData
}

export function RiskUncertaintySplit({ data }: Readonly<RiskUncertaintySplitProps>) {
  const concerns   = data.narrative.observedConcerns   ?? []
  const visibility = data.narrative.limitedVisibility  ?? []

  return (
    <View style={S.wrap}>
      <SectionHeader
        badge="2.3"
        title="Observed concerns  |  Limited visibility"
        rightLabel="Architecturally separated"
      />

      <Text style={S.doctrine}>
        {sp(
          'The left column lists signals that were observed in the supplied evidence. ' +
          'The right column lists information that was not available or was incomplete. ' +
          'Both inform manual review, but they are not the same kind of finding.'
        )}
      </Text>

      <View style={S.split}>
        <Col
          docRef="2.3.A · Risk"
          title="Observed concerns"
          items={concerns}
          empty="No concerns recorded for this applicant."
        />
        <Col
          docRef="2.3.B · Uncertainty"
          title="Limited visibility"
          items={visibility}
          empty="No visibility gaps recorded."
        />
      </View>
    </View>
  )
}
