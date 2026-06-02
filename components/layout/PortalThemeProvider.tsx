"use client"

/**
 * components/layout/PortalThemeProvider.tsx — portal light/dark theme (data-theme on .pleks-portal)
 *
 * Auth:   dashboard layout (gateway)
 * Data:   localStorage "pleks-portal-theme" for an explicit user choice; otherwise prefers-color-scheme
 * Notes:  Follows the DEVICE theme by default (and live-tracks OS changes) so a dark-mode phone gets a
 *         dark app instead of a light-app / dark-chrome mix. A manual toggle writes an explicit override
 *         that wins and stops device-following. Theme is applied client-side after mount (brief flash on
 *         first paint is accepted — there's no html-level pre-paint hook since data-theme sits on the div).
 */

import { createContext, useContext, useEffect, useMemo, useState } from "react"

type Theme = "light" | "dark"

interface PortalThemeCtx {
  theme: Theme
  toggle: () => void
}

const ThemeContext = createContext<PortalThemeCtx>({ theme: "light", toggle: () => {} })

export function usePortalTheme() { return useContext(ThemeContext) }

function getDeviceTheme(): Theme {
  if (typeof window === "undefined" || !window.matchMedia) return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function PortalThemeProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [theme, setTheme] = useState<Theme>("light")
  // True once the user has explicitly chosen a theme — that choice wins and we stop following the device.
  const [hasExplicit, setHasExplicit] = useState(false)

  // Resolve the initial theme after mount: an explicit saved choice wins; otherwise mirror the device.
  useEffect(() => {
    const saved = localStorage.getItem("pleks-portal-theme") as Theme | null
    if (saved === "dark" || saved === "light") {
      setHasExplicit(true)
      setTheme(saved)
    } else {
      setTheme(getDeviceTheme())
    }
  }, [])

  // While there's no explicit choice, live-track the OS light/dark setting.
  useEffect(() => {
    if (hasExplicit || typeof window === "undefined" || !window.matchMedia) return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => setTheme(mq.matches ? "dark" : "light")
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [hasExplicit])

  function toggle() {
    setHasExplicit(true)
    setTheme(current => {
      const next = current === "light" ? "dark" : "light"
      localStorage.setItem("pleks-portal-theme", next)
      return next
    })
  }

  const ctx = useMemo<PortalThemeCtx>(() => ({ theme, toggle }), [theme])

  return (
    <ThemeContext.Provider value={ctx}>
      <div className="pleks-portal flex h-screen overflow-hidden" data-theme={theme}>
        {children}
      </div>
    </ThemeContext.Provider>
  )
}
