/**
 * lib/extraction/archetypeClassifier.ts — Deterministic archetype derivation
 *
 * Archetype is fully determined by unitType + applicantCount — both known before
 * any documents are uploaded. No AI call needed or appropriate here.
 *
 * Subtypes (guarantee, family, destressed) are document-signal patterns surfaced
 * by document type classification (donation-declaration, salary-increase-letter,
 * multiple id-documents). The agent interprets those signals; they are not
 * separate archetypes.
 *
 * Spec: ADDENDUM_14L D-14L-06
 */
import type { ApplicationArchetype, UnitType } from "./types"

export function deriveArchetype(unitType: UnitType, applicantCount: number): ApplicationArchetype {
  if (unitType === "commercial") {
    return applicantCount > 1 ? "commercial-multi-director" : "commercial-single-director"
  }
  return applicantCount > 1 ? "residential-multi" : "residential-single"
}
