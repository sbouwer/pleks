/**
 * lib/reports/screening/_pdf/primitives/MethodologyEyebrow.tsx
 *
 * Framing primitive: full-width strip rendered above DimensionCardEditorial when the
 * evidentiary class changes methodology (all-foreign = three-dimension methodology).
 * Carries rationale for topology change; styled as structural declaration (not alert).
 * Rendered by parent composition layer; DimensionCardEditorial handles topology.
 * Spec: ADDENDUM_14H_DENSITY_SURFACE_PASS §6.3/§6.4; D-DSP-16/17/18.
 */
import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { C, D, FONTS, sp } from "./theme"

// Only one variant ships in Phase 2. Extensible for commercial methodology variants.
export type MethodologyEyebrowVariant = 'foreign-national-evidentiary-class'

const EYEBROW_CONTENT: Record<MethodologyEyebrowVariant, { title: string; body: string }> = {
  'foreign-national-evidentiary-class': {
    title: 'Three-dimension methodology · Foreign-national evidentiary class',
    body:  'Credit Behaviour is not assessed where South African bureau coverage is unavailable for all applicants. ' +
           'Affordability, Stability, and Verification Integrity carry additional weight in the composite methodology.',
  },
}

const S = StyleSheet.create({
  wrap: {
    backgroundColor:  C.surface.paperRaised,
    borderWidth:      0.75,
    borderColor:      C.rule.base,
    paddingVertical:  10,
    paddingHorizontal: D.cardPaddingX,
    marginBottom:     D.primitiveGap,
  },
  title: {
    fontFamily:    FONTS.mono,
    fontSize:      7.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color:         C.ink.mute,
    marginBottom:  5,
  },
  body: {
    fontFamily: FONTS.sans,
    fontSize:   8.5,
    color:      C.ink.soft,
    lineHeight: 1.45,
  },
})

interface MethodologyEyebrowProps {
  variant: MethodologyEyebrowVariant
}

export function MethodologyEyebrow({ variant }: Readonly<MethodologyEyebrowProps>) {
  const content = EYEBROW_CONTENT[variant]
  return (
    <View style={S.wrap}>
      <Text style={S.title}>{sp(content.title)}</Text>
      <Text style={S.body}>{sp(content.body)}</Text>
    </View>
  )
}
