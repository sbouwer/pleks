"use client"

import { createContext, useContext, useState } from "react"

type Theme = "light" | "dark"

interface ThemeCtx {
  theme: Theme
  toggle: () => void
}

const Ctx = createContext<ThemeCtx>({ theme: "light", toggle: () => {} })

export function usePublicTheme() {
  return useContext(Ctx)
}

export function PublicThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (globalThis.window === undefined) return "light"
    const stored = localStorage.getItem("pleks-pub-theme")
    return stored === "dark" || stored === "light" ? stored : "light"
  })

  function toggle() {
    setTheme(prev => {
      const next = prev === "light" ? "dark" : "light"
      localStorage.setItem("pleks-pub-theme", next)
      return next
    })
  }

  return (
    <Ctx.Provider value={{ theme, toggle }}>
      <div className="pleks-public" data-theme={theme}>
        {children}
      </div>
    </Ctx.Provider>
  )
}
