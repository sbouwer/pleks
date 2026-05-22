/**
 * lib/reports/screening/_primitives/NarrativeColumns.tsx — Three-column AI narrative section for FitScore Stream 2 PDFs
 *
 * Notes: Renders Observed Strengths / Observed Concerns / Limited Visibility columns.
 *        Empty states use canonical text from §7.3 — blank columns are not permitted.
 *        If narrative is templated fallback (isTemplated=true), columns surface the fallback notice.
 *        Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §6.6, §7.3.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { colors, FONTS, sp } from "./theme"
import type { NarrativeResponse } from "./theme"

interface Props {
  narrative: NarrativeResponse
}

const EMPTY_STRENGTHS = 'No observed strengths above the Limited Visibility threshold for this lease.'
const EMPTY_CONCERNS  = 'No observed concerns at this verification level.'
const EMPTY_VISIBILITY = 'All core signal sources were available for this lease.'

const S = StyleSheet.create({
  container:   { flexDirection: 'row', gap: 8, marginTop: 12 },
  column:      { flex: 1 },
  colHeader:   {
    fontSize: 6.5,
    fontFamily: FONTS.sans,
    fontWeight: 'bold',
    color: colors.text.faint,
    textTransform: 'uppercase',
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 0.75,
    borderBottomColor: colors.surface.divider,
  },
  bulletRow:   { flexDirection: 'row', gap: 3, marginBottom: 4 },
  bullet:      { fontSize: 8.5, fontFamily: FONTS.sans, color: colors.text.primary, lineHeight: 1.45 },
  bulletDot:   { fontSize: 8.5, fontFamily: FONTS.sans, color: colors.text.soft },
  emptyText:   { fontSize: 8, fontFamily: FONTS.sans, color: colors.text.faint, lineHeight: 1.4 },
})

function Column({ title, items, emptyText }: Readonly<{ title: string; items: string[]; emptyText: string }>) {
  return (
    <View style={S.column}>
      <Text style={S.colHeader}>{title}</Text>
      {items.length === 0 ? (
        <Text style={S.emptyText}>{emptyText}</Text>
      ) : (
        items.map((item) => (
          <View key={item} style={S.bulletRow}>
            <Text style={S.bulletDot}>•</Text>
            <Text style={[S.bullet, { flex: 1 }]}>{sp(item)}</Text>
          </View>
        ))
      )}
    </View>
  )
}

export function NarrativeColumns({ narrative }: Readonly<Props>) {
  return (
    <View style={S.container}>
      <Column
        title="Observed Strengths"
        items={narrative.observedStrengths}
        emptyText={EMPTY_STRENGTHS}
      />
      <Column
        title="Observed Concerns"
        items={narrative.observedConcerns}
        emptyText={EMPTY_CONCERNS}
      />
      <Column
        title="Limited Visibility"
        items={narrative.limitedVisibility}
        emptyText={EMPTY_VISIBILITY}
      />
    </View>
  )
}
