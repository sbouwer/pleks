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
import { C, D, FONTS, sp } from "./theme"
import type { FitScoreReportData } from "./theme"
import { BlockHeader } from "./BlockHeader"

const S = StyleSheet.create({
  wrap: { marginBottom: D.primitiveGap },

  headerCard: {
    borderWidth:     0.75,
    borderColor:     C.rule.base,
    backgroundColor: C.surface.paperRaised,
    marginBottom:    D.primitiveGapTight,
  },
  doctrineBody: {
    paddingHorizontal: D.cardPaddingX,
    paddingVertical:   D.cardPaddingY,
  },
  doctrine: {
    fontFamily: FONTS.sans,
    fontSize:   8.5,
    color:      C.ink.mute,
    lineHeight: D.bodyLineHeight,
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
    paddingHorizontal: D.cardPaddingX,
    paddingVertical:   D.cardPaddingY,
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
    paddingHorizontal: D.cardPaddingX,
    paddingVertical:   D.cardPaddingY,
    gap:               8,
  },
  item: {
    paddingBottom: 6,
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
    lineHeight: D.bodyLineHeight,
  },
  emptyText: {
    fontFamily: FONTS.sans,
    fontSize:   8.5,
    color:      C.ink.faint,
    lineHeight: D.bodyLineHeight,
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
    <View style={S.wrap} wrap={false}>
      <View style={S.headerCard}>
        <BlockHeader label="2.3" title="Risk and uncertainty" />
        <View style={S.doctrineBody}>
          <Text style={S.doctrine}>
            {sp(
              'The left column lists signals that were observed in the supplied evidence. ' +
              'The right column lists information that was not available or was incomplete. ' +
              'Both inform manual review, but they are not the same kind of finding and must not be conflated.'
            )}
          </Text>
        </View>
      </View>

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
