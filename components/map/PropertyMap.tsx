"use client"

import { useEffect, useRef } from "react"
import type { Map } from "leaflet"

interface PropertyMapProps {
  readonly street: string        // e.g. "6 Boegoe Street"
  readonly city: string          // e.g. "Paarl"
  readonly province?: string     // e.g. "Western Cape"
  readonly className?: string
}

async function geocode(street: string, city: string, province?: string): Promise<{ lat: number; lon: number } | null> {
  // Try structured search first (most accurate — Nominatim separates street from suburb)
  const attempts = [
    new URLSearchParams({ street, city, state: province ?? "", country: "South Africa", format: "json", limit: "1" }),
    new URLSearchParams({ street, city, country: "South Africa", format: "json", limit: "1" }),
    new URLSearchParams({ q: `${street}, ${city}, South Africa`, format: "json", limit: "1", countrycodes: "za" }),
  ]

  for (const params of attempts) {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { "Accept-Language": "en" },
      })
      const results = await res.json() as { lat: string; lon: string }[]
      if (results[0]) {
        return { lat: Number.parseFloat(results[0].lat), lon: Number.parseFloat(results[0].lon) }
      }
    } catch {
      // try next attempt
    }
  }
  return null
}

export function PropertyMap({ street, city, province, className }: PropertyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const initializedRef = useRef(false) // synchronous guard for StrictMode double-invoke

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    async function init() {
      if (!containerRef.current) return

      const L = (await import("leaflet")).default
      await import("leaflet/dist/leaflet.css")

      const iconProto = L.Icon.Default.prototype as L.Icon.Default & { _getIconUrl?: unknown }
      delete iconProto._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      })

      const coords = await geocode(street, city, province)
      const lat = coords?.lat ?? -29
      const lon = coords?.lon ?? 25
      const zoom = coords ? 16 : 5

      if (!containerRef.current || mapRef.current) return

      const map = L.map(containerRef.current, { zoomControl: true, scrollWheelZoom: false })
        .setView([lat, lon], zoom)
      mapRef.current = map

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      if (coords) {
        L.marker([lat, lon]).addTo(map)
      }
    }

    void init()

    return () => {
      initializedRef.current = false
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [street, city, province])

  return <div ref={containerRef} className={className} />
}
