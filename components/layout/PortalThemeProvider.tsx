"use client"

/**
 * components/layout/PortalThemeProvider.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */

import { createContext, useContext, useEffect, useMemo, useState } from "react"

type Theme = "light" | "dark"

interface PortalThemeCtx {
  theme: Theme
  toggle: () => void
}

const ThemeContext = createContext<PortalThemeCtx>({ theme: "light", toggle: () => {} })

export function usePortalTheme() { return useContext(ThemeContext) }

export function PortalThemeProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [theme, setTheme] = useState<Theme>("light")

  useEffect(() => {
    const saved = localStorage.getItem("pleks-portal-theme") as Theme | null
    if (saved === "dark" || saved === "light") setTheme(saved) // eslint-disable-line react-hooks/set-state-in-effect
  }, [])

  function toggle() {
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
