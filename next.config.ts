import type { NextConfig } from "next"
import withSerwist from "@serwist/next"
import { withSentryConfig } from "@sentry/nextjs"

const securityHeaders = [
  // Prevent clickjacking
  { key: "X-Frame-Options", value: "DENY" },
  // Prevent MIME-type sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Limit referrer information
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Restrict browser feature access
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Enforce HTTPS (2 years, include subdomains)
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Content Security Policy
  // Note: 'unsafe-inline' + 'unsafe-eval' required by Next.js App Router hydration.
  // Nonce-based CSP can be added once streaming/hydration patterns are confirmed stable.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://app.pleks.co.za https://pleks.co.za https://*.supabase.co wss://*.supabase.co https://api.resend.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io",
      "manifest-src 'self' https://app.pleks.co.za",
      "frame-src https://maps.google.com https://www.google.com",
      "worker-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
]

const nextConfig: NextConfig = {
  // Remove X-Powered-By: Next.js header
  poweredByHeader: false,

  // Expose the deploy commit to the client for bug-report correlation (ADDENDUM_68).
  // Vercel sets VERCEL_GIT_COMMIT_SHA at build; defaults to "local" in dev.
  env: {
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? "local",
  },

  // @react-pdf/renderer v4 uses yoga-wasm-web (WASM). Turbopack bundling breaks
  // WASM initialisation — exclude from bundling so it loads from node_modules at runtime.
  // pdf-parse (pdfjs) is the same shape — bundling it breaks the worker/decryption at runtime
  // (the encrypted-PDF decrypt in lib/extraction/pdfDecrypt would throw and get swallowed → file accepted).
  serverExternalPackages: ["@react-pdf/renderer", "pdf-parse"],

  // Tree-shake large packages at the module graph level (saves bundle + compile time)
  // Note: @react-pdf/renderer is intentionally absent — see serverExternalPackages above.
  experimental: {
    // Client Router Cache: Next 15/16 default dynamic pages to 0s (re-fetch the RSC on every
    // back/forward + re-visit). Against the throttled DB that makes tab-switching feel sluggish.
    // Keep a visited dynamic page's RSC for 30s and prefetched/static shells for 3 min so revisiting
    // a recently-seen nav category is instant. Mutations still call router.refresh() to bust it.
    staleTimes: { dynamic: 30, static: 180 },
    optimizePackageImports: [
      "lucide-react",
      "@react-email/components",
      "@fullcalendar/react",
      "@fullcalendar/daygrid",
      "@fullcalendar/timegrid",
      "@fullcalendar/list",
      "@fullcalendar/interaction",
    ],
  },

  // Silence the Turbopack/webpack mismatch warning from @serwist/next.
  // Serwist is disabled in development so webpack only runs in production builds.
  turbopack: {},

  async redirects() {
    return [
      // ── Route-naming renames ──
      { source: "/payments",           destination: "/billing",            permanent: true },
      { source: "/payments/:path*",    destination: "/billing/:path*",     permanent: true },

      { source: "/contractors",        destination: "/suppliers",          permanent: true },
      { source: "/contractors/:path*", destination: "/suppliers/:path*",   permanent: true },

      // Applications page → Listings (each listing has applicants). The list + compare redirect here;
      // /applications/[id] is NOT wildcarded — a server shim resolves it to /listings/[slug]/applications/[id].
      { source: "/applications",         destination: "/listings", permanent: true },
      { source: "/applications/compare", destination: "/listings", permanent: true },

      { source: "/settings/finance",   destination: "/settings/deposits",  permanent: true },

      // Documents settings renamed to Templates (ADDENDUM template-manager Phase 1)
      { source: "/settings/documents/templates", destination: "/settings/templates", permanent: true },
      { source: "/settings/documents",           destination: "/settings/templates", permanent: true },
      { source: "/settings/billing",   destination: "/settings/subscription", permanent: true },
      { source: "/settings/communication/templates", destination: "/settings/documents/templates", permanent: true },
      { source: "/settings/communication/:path*",    destination: "/settings/documents/:path*",    permanent: true },

      { source: "/api/payments/screening",                destination: "/api/billing/screening",                permanent: true },
      { source: "/api/payments/:paymentId/receipt",       destination: "/api/billing/:paymentId/receipt",       permanent: true },
      { source: "/api/contractors",                       destination: "/api/suppliers",                        permanent: true },
      { source: "/api/contractors/:path*",                destination: "/api/suppliers/:path*",                 permanent: true },

      // ── Role namespace renames ──
      { source: "/portal",             destination: "/tenant",             permanent: true },
      { source: "/portal/:path*",      destination: "/tenant/:path*",      permanent: true },

      { source: "/contractor",         destination: "/supplier",           permanent: true },
      { source: "/contractor/:path*",  destination: "/supplier/:path*",    permanent: true },

      // /landlord/* unchanged — route group renamed but URL prefix stays the same.
      // /settings/profile NOT redirected — URL is repurposed (new user-profile stub), not retired.

      // ── Retired pages ──
      // /status is handled by the proxy: any domain → 308 to status.pleks.co.za
    ]
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ]
  },
}

const serwistConfig = withSerwist({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
})(nextConfig)

export default withSentryConfig(serwistConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  tunnelRoute: "/monitoring",
  widenClientFileUpload: true,
  silent: !process.env.CI,
  telemetry: false,
  // Only upload source maps on production deployments — skip preview builds
  sourcemaps: {
    disable: process.env.VERCEL_ENV !== "production",
  },
})
