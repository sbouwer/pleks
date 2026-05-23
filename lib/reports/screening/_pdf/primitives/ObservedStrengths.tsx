/**
 * lib/reports/screening/_pdf/primitives/ObservedStrengths.tsx
 *
 * §4.1 — Observed strengths, concerns, and limited-visibility bullets from the narrative engine.
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.4.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { C, D, FONTS, sp } from "./theme"
import type { FitScoreReportData } from "./theme"
import { BlockHeader } from "./BlockHeader"

const S = StyleSheet.create({
  wrap: { marginBottom: D.primitiveGap },
  card: {
    borderWidth:     0.75,
    borderColor:     C.rule.base,
    backgroundColor: C.surface.paperRaised,
  },
  body: {
    paddingHorizontal: D.cardPaddingX,
    paddingTop:        D.cardPaddingY,
    paddingBottom:     D.cardPaddingY,
  },

  section: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 0.75,
    borderBottomColor: C.rule.base,
  },
  sectionLast: { marginBottom: 0, paddingBottom: 0, borderBottomWidth: 0 },

  sectionLabel: {
    fontFamily:    FONTS.mono,
    fontSize:      7,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color:         C.ink.mute,
    marginBottom:  6,
  },
  sectionLabelConcern: { color: C.amber.ink },

  bulletList: { gap: 5 },
  bulletRow:  { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  bulletDot:  {
    fontFamily: FONTS.mono,
    fontSize:   8,
    color:      C.ink.ghost,
    marginTop:  1,
  },
  bulletText: {
    fontFamily: FONTS.sans,
    fontSize:   8.5,
    color:      C.ink.soft,
    lineHeight: D.bodyLineHeight,
    flex:       1,
  },
  bulletTextConcern: { color: C.ink.primary },
  bulletTextFaint:   { color: C.ink.mute },
})

type BulletVariant = 'normal' | 'concern' | 'faint'

function BulletList({ bullets, variant = 'normal' }: Readonly<{
  bullets: string[]
  variant?: BulletVariant
}>) {
  return (
    <View style={S.bulletList}>
      {bullets.map((bullet, i) => (
        <View key={`${i}-${bullet.slice(0, 16)}`} style={S.bulletRow}>
          <Text style={S.bulletDot}>·</Text>
          <Text style={[
            S.bulletText,
            variant === 'concern' ? S.bulletTextConcern : {},
            variant === 'faint'   ? S.bulletTextFaint   : {},
          ]}>{sp(bullet)}</Text>
        </View>
      ))}
    </View>
  )
}

interface ObservedStrengthsProps {
  data: FitScoreReportData
}

export function ObservedStrengths({ data }: Readonly<ObservedStrengthsProps>) {
  const strengths   = data.narrative.observedStrengths
  const concerns    = data.narrative.observedConcerns
  const limited     = data.narrative.limitedVisibility
  const hasConcerns = concerns.length > 0
  const hasLimited  = limited.length > 0
  const isLastSection = !hasConcerns && !hasLimited

  return (
    <View style={S.wrap}>
      <View style={S.card}>
        <BlockHeader label="4.1" title="Observed strengths, concerns and limited visibility" />
        <View style={S.body}>
          {strengths.length > 0 && (
            <View style={isLastSection ? S.sectionLast : S.section}>
              <Text style={S.sectionLabel}>Observed strengths</Text>
              <BulletList bullets={strengths} />
            </View>
          )}
          {hasConcerns && (
            <View style={hasLimited ? S.section : S.sectionLast}>
              <Text style={[S.sectionLabel, S.sectionLabelConcern]}>Observed concerns</Text>
              <BulletList bullets={concerns} variant="concern" />
            </View>
          )}
          {hasLimited && (
            <View style={S.sectionLast}>
              <Text style={S.sectionLabel}>Limited visibility</Text>
              <BulletList bullets={limited} variant="faint" />
            </View>
          )}
        </View>
      </View>
    </View>
  )
}
