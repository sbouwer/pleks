"use client"

import { useEffect, useRef } from "react"
import type { Map } from "leaflet"

interface PropertyMapProps {
  readonly address: string
  readonly className?: string
}

async function geocode(address: string): Promise<{ lat: number; lon: number } | null> {
  // Try progressively shorter queries until we get a result
  const queries = [
    address + ", South Africa",
    // Drop first component (unit/flat numbers) and retry
    address.split(",").slice(1).join(",").trim() + ", South Africa",
  ]

  for (const q of queries) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=za`,
        { headers: { "Accept-Language": "en" } }
      )
      const results = await res.json() as { lat: string; lon: string }[]
      if (results[0]) {
        return { lat: Number.parseFloat(results[0].lat), lon: Number.parseFloat(results[0].lon) }
      }
    } catch {
      // try next query
    }
  }
  return null
}

export function PropertyMap({ address, className }: PropertyMapProps) {
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

      // Fix Webpack/Next.js asset path issue for default marker icons
      const iconProto = L.Icon.Default.prototype as L.Icon.Default & { _getIconUrl?: unknown }
      delete iconProto._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      })

      if (!containerRef.current) return

      const coords = await geocode(address)
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
  }, [address])

  return <div ref={containerRef} className={className} />
}
