"use client"

import { useEffect, useRef } from "react"
import type { Map } from "leaflet"

interface PropertyMapProps {
  readonly address: string
  readonly className?: string
}

export function PropertyMap({ address, className }: PropertyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

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

      // Geocode via Nominatim (OpenStreetMap — free, no API key)
      const encoded = encodeURIComponent(`${address}, South Africa`)
      let lat = -29, lon = 25, zoom = 5
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`,
          { headers: { "Accept-Language": "en" } }
        )
        const results = await res.json() as { lat: string; lon: string }[]
        if (results[0]) {
          lat = Number.parseFloat(results[0].lat)
          lon = Number.parseFloat(results[0].lon)
          zoom = 16
        }
      } catch {
        // fall through to default SA centre
      }

      if (!containerRef.current) return

      const map = L.map(containerRef.current, { zoomControl: true, scrollWheelZoom: false })
        .setView([lat, lon], zoom)
      mapRef.current = map

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      if (zoom === 16) {
        L.marker([lat, lon]).addTo(map)
      }
    }

    void init()

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [address])

  return <div ref={containerRef} className={className} />
}
