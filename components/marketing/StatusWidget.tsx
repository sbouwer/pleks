"use client"

/**
 * components/marketing/StatusWidget.tsx — Live platform status indicator for public footer
 *
 * Data:   fetches /api/public/status-summary (cached 60s) which polls BetterStack monitors
 * Notes:  fails silently — on any fetch error, shows "All systems operational" so the footer
 *         never alarms visitors due to a widget failure
 */

import { useEffect, useState } from "react"

type Status = "loading" | "operational" | "degraded" | "outage"

export function StatusWidget() {
  const [status, setStatus] = useState<Status>("loading")

  useEffect(() => {
    fetch("/api/public/status-summary")
      .then(r => r.json())
      .then(d => setStatus(d.status ?? "operational"))
      .catch(() => setStatus("operational"))
  }, [])

  const label: Record<Status, string> = {
    loading:     "Checking status…",
    operational: "All systems operational",
    degraded:    "Partial degradation",
    outage:      "Service disruption",
  }

  const dot: Record<Status, string> = {
    loading:     "#c0bbb2",
    operational: "#2d7d52",
    degraded:    "#c97c2a",
    outage:      "#b93a3a",
  }

  return (
    <a
      href="https://status.pleks.co.za"
      target="_blank"
      rel="noopener noreferrer"
      className="pub-small"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        color: "var(--ink-soft)",
        textDecoration: "none",
      }}
    >
      <span style={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: dot[status],
        flexShrink: 0,
        ...(status === "operational" ? {
          boxShadow: `0 0 0 0 ${dot.operational}66`,
          animation: "status-pulse 2.4s ease-in-out infinite",
        } : {}),
      }} />
      {label[status]}
    </a>
  )
}
