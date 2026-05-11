/**
 * lib/comms/resolveOrgTone.ts — resolve org-level tone preference from settings JSONB
 *
 * Data:   organisations.settings JSONB → communication.tone_tenant
 */

export function resolveOrgTone(settings: unknown): "friendly" | "professional" | "firm" {
  const s = (settings ?? {}) as Record<string, unknown>
  const c = (s.communication ?? {}) as Record<string, unknown>
  const t = c.tone_tenant as string | undefined
  return t === "friendly" || t === "firm" ? t : "professional"
}
