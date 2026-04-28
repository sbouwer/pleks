export interface RpConfig {
  rpId: string
  origin: string
  rpName: string
}

export function getRpConfig(req: Request): RpConfig {
  const url = new URL(req.url)
  const host = url.host

  if (host === "app.pleks.co.za") {
    return { rpId: "app.pleks.co.za", origin: "https://app.pleks.co.za", rpName: "Pleks" }
  }

  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
    return { rpId: "localhost", origin: `http://${host}`, rpName: "Pleks (dev)" }
  }

  // Vercel preview deploys and any unknown origin: refuse passkey operations.
  // D-AUTH-03: *.vercel.app is on the Public Suffix List and cannot safely host passkeys.
  throw new Error(`Refusing to serve passkeys on unknown host: ${host}`)
}
