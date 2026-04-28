/**
 * components/map/PropertyMap.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
interface PropertyMapProps {
  readonly street: string
  readonly city: string
  readonly province?: string
  readonly className?: string
}

export function PropertyMap({ street, city, province, className }: PropertyMapProps) {
  const query = encodeURIComponent([street, city, province, "South Africa"].filter(Boolean).join(", "))

  return (
    <iframe
      src={`https://maps.google.com/maps?q=${query}&output=embed&z=16`}
      className={`w-full ${className ?? ""}`}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      title="Property location"
    />
  )
}
