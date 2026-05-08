/**
 * app/(public)/cookie-policy/page.tsx — cookie policy for Pleks
 *
 * Route:  /cookie-policy
 * Auth:   public
 */
import type { Metadata } from "next"
import { LegalPageLayout } from "@/components/legal/LegalPageLayout"
import { LEGAL_VERSIONS } from "@/lib/legal-versions"
import { EXTERNAL_LINKS } from "@/lib/external-links"
import { ExtLink } from "@/components/legal/ExtLink"

export const metadata: Metadata = {
  title: "Cookie Policy — Pleks",
  description: "How Pleks uses cookies and similar technologies, and how you can manage them.",
}

const SECTIONS = [
  { id: "what",      num: "01", label: "What are cookies"    },
  { id: "essential", num: "02", label: "Essential cookies"   },
  { id: "analytics", num: "03", label: "Analytics cookies"   },
  { id: "third",     num: "04", label: "Third-party cookies" },
  { id: "manage",    num: "05", label: "Managing cookies"    },
  { id: "changes",   num: "06", label: "Changes"             },
]

export default function CookiePolicyPage() {
  return (
    <LegalPageLayout
      eyebrowParts={["COOKIES · TRACKING", "browser storage", LEGAL_VERSIONS.cookiePolicy]}
      titleBefore="Cookie"
      titleHighlight="policy"
      subtitle="How Pleks uses cookies and similar browser storage technologies to keep you signed in, measure performance, and improve the platform."
      kicker={[
        { label: "Last reviewed", value: "2026 · 05 · 05", mono: true },
        { label: "In force from",  value: "2026 · 05 · 05", mono: true },
        { label: "Jurisdiction",   value: "Republic of South Africa" },
        { label: "Framework",      value: "POPIA s11 · s69" },
      ]}
      sections={SECTIONS}
      hasSummary
      endLabel={`END · COOKIE POLICY · ${LEGAL_VERSIONS.cookiePolicy}`}
    >
      {/* Plain-language summary */}
      <div className="summary-card" id="summary">
        <p className="sc-eyebrow">Plain-language summary</p>
        <h2 className="sc-h">What you need to know about cookies on Pleks</h2>
        <ul className="summary-list">
          <li><span className="b" /><span>Pleks uses essential cookies to keep you signed in and to protect your session. These cannot be disabled without breaking the platform.</span></li>
          <li><span className="b" /><span>We use Vercel Analytics for performance measurement. IP addresses and user agents are converted to a daily-rotating one-way hash by Vercel; raw values are not retained. We treat this as processed in a privacy-preserving aggregated form.</span></li>
          <li><span className="b" /><span>We do not use advertising cookies, tracking pixels, or any cross-site behavioural profiling. Vercel Analytics measures aggregate site performance and does not profile individual visitors.</span></li>
          <li><span className="b" /><span>You can clear or block cookies in your browser settings at any time. Essential cookies will be re-set on next sign-in.</span></li>
          <li><span className="b" /><span>The public marketing site (pleks.co.za) uses fewer cookies than the authenticated dashboard — see section 02 for the full list.</span></li>
          <li><span className="b" /><span>Pleks does not show a cookie consent banner because we do not set any cookies that require POPIA s11(1)(a) consent. If that ever changes, a banner will appear and this policy will be updated.</span></li>
        </ul>
      </div>

      {/* 01 */}
      <section id="what">
        <p className="sec-num"><span className="bar" /><span>01 · Background</span></p>
        <h2 className="sec-h">What are <span className="hl">cookies</span></h2>
        <p>
          Cookies are small text files that a website places on your device when you visit. They allow the site to remember
          information between page loads — such as whether you are signed in, your language preference, or how you arrived at the site.
        </p>
        <p>
          In addition to cookies, Pleks may use <strong>local storage</strong> and <strong>session storage</strong> — browser-based
          key-value stores that behave similarly to cookies but are not sent to the server with every request. The same rules apply to
          these technologies as to cookies under this policy.
        </p>
        <p>
          Under <span className="act-pill">POPIA</span>, we are required to inform you about cookies that process personal information
          and to rely on a valid lawful basis — consent (<span className="act-pill">POPIA · S11(1)(a)</span>), contract
          (<span className="act-pill">POPIA · S11(1)(b)</span>), or legitimate interest (<span className="act-pill">POPIA · S11(1)(f)</span>)
          — before processing. SA law does not have a direct equivalent of the EU ePrivacy Directive&rsquo;s cookie rule; our requirements
          are set by POPIA s11 (lawful basis) and, for direct-marketing cookies, POPIA s69.
        </p>
        <p>
          This policy should be read together with our <a href="/privacy">Privacy Policy</a> and{" "}
          <a href="/terms">Terms of Service</a>, which describe how we handle personal information more broadly.
        </p>
        <p>
          Pleks operates under South African law. If you access Pleks from outside South Africa, additional local cookie or e-privacy
          laws may apply; this policy describes our compliance with SA law and is not a determination of compliance with any other
          jurisdiction&rsquo;s regime.
        </p>
      </section>

      {/* 02 */}
      <section id="essential">
        <p className="sec-num"><span className="bar" /><span>02 · Essential cookies</span></p>
        <h2 className="sec-h">Essential <span className="hl">cookies</span></h2>
        <p>
          These cookies are strictly necessary for Pleks to function. They cannot be disabled without preventing you from signing in
          or using the platform. No consent is required for these cookies under <span className="act-pill">POPIA · S11(1)(b)</span> —
          they are necessary for the performance of the contract (the Pleks Terms of Service) you have entered into with us.
        </p>
        <table className="share-table">
          <thead>
            <tr>
              <th style={{ width: "35%" }}>Storage item</th>
              <th>Purpose</th>
              <th style={{ width: "20%" }}>Duration</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="who">sb-[projectId]-auth-token<span className="sub">Supabase · localStorage</span></td>
              <td>Stores your authenticated session after sign-in. Required to access the dashboard. <em>[projectId] is the unique identifier of the Pleks Supabase project.</em></td>
              <td>7 days from issue; refreshed on each authenticated request; cleared on sign-out</td>
            </tr>
            <tr>
              <td className="who">sb-[projectId]-auth-token-code-verifier<span className="sub">Supabase · sessionStorage</span></td>
              <td>PKCE code verifier used during the OAuth authentication flow. Cleared immediately after sign-in completes.</td>
              <td>Session</td>
            </tr>
            <tr>
              <td className="who">pub-theme<span className="sub">Pleks · localStorage</span></td>
              <td>Stores your light/dark mode preference on the marketing site.</td>
              <td>1 year</td>
            </tr>
          </tbody>
        </table>
        <p>
          <strong>A note on storage type:</strong> Supabase session tokens are stored in <strong>localStorage</strong> (not as HTTP
          cookies) in the Pleks configuration. This means they are accessible via JavaScript and are not automatically sent with every
          server request. They are cleared when you sign out or clear your browser data. The same POPIA obligations apply regardless
          of whether data is stored in a cookie or in localStorage.
        </p>
        <p>
          Session tokens are held in <strong>localStorage</strong> on your device. Session validation and the underlying user record
          are stored at our database and storage provider&rsquo;s US infrastructure (see the operators directory in the{" "}
          <a href="/popia-register">POPIA processing register</a>) under Standard Contractual Clauses per{" "}
          <span className="act-pill">POPIA · S72(1)(a)</span>.
        </p>
      </section>

      {/* 03 */}
      <section id="analytics">
        <p className="sec-num"><span className="bar" /><span>03 · Analytics cookies</span></p>
        <h2 className="sec-h">Analytics <span className="hl">cookies</span></h2>
        <p>
          Pleks uses <strong>Vercel Analytics</strong> to measure page performance and visitor counts on the marketing site. Vercel
          Analytics does not set cookies. IP addresses and user agents are converted to a daily-rotating one-way hash by Vercel; raw
          values are not retained and no individual user profiles are built.
        </p>
        <p>
          Pleks treats Vercel Analytics data as processed in a privacy-preserving aggregated form and does not consider it to require POPIA s11(1)(a) consent. If you
          disagree, you can block analytics via your browser&rsquo;s developer tools or a content blocker — the platform continues to
          function normally.
        </p>
        <p>
          We do not use Google Analytics, Meta Pixel, or any other third-party analytics that sets cookies or tracks individuals
          across sites.
        </p>
      </section>

      {/* 04 */}
      <section id="third">
        <p className="sec-num"><span className="bar" /><span>04 · Third-party cookies</span></p>
        <h2 className="sec-h">Third-party <span className="hl">cookies</span></h2>
        <p>
          Some features of Pleks involve third-party services that may set their own cookies. Where this occurs, the third party&rsquo;s
          own cookie and privacy policy applies. Pleks does not control these cookies.
        </p>
        <table className="share-table">
          <thead>
            <tr>
              <th style={{ width: "30%" }}>Service</th>
              <th>When cookies are set</th>
              <th style={{ width: "25%" }}>Their policy</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="who">PayFast<span className="sub">payment processor</span></td>
              <td>Cookies are set by PayFast upon redirection to their secure payment gateway — this occurs when completing a subscription payment or setting up a recurring debit mandate. These typically include session and fraud-prevention cookies on the PayFast domain. Pleks does not control or access them; the PayFast cookie policy is the authoritative description.</td>
              <td><ExtLink href={EXTERNAL_LINKS.payfastPrivacy}>payfast.io/privacy-policy</ExtLink></td>
            </tr>
          </tbody>
        </table>
        <p>
          The e-signature workflow (DocuSeal) is self-hosted on Pleks&rsquo;s own infrastructure — no data is transferred to a
          third-party DocuSeal service, and any storage items set during document signing are first-party Pleks items governed by this
          policy. This is consistent with the Operator Agreement classification in the{" "}
          <a href="/popia-register">POPIA processing register</a>.
        </p>
        <p>
          Pleks does not embed social media plugins, advertising networks, or any third-party scripts that would track you across
          websites for marketing purposes.
        </p>
      </section>

      {/* 05 */}
      <section id="manage">
        <p className="sec-num"><span className="bar" /><span>05 · Managing cookies</span></p>
        <h2 className="sec-h">Managing <span className="hl">cookies</span></h2>
        <p>You can control and delete cookies through your browser settings. Most browsers allow you to:</p>
        <ul className="legal-list">
          <li>View all cookies currently stored by your browser.</li>
          <li>Delete all cookies, or cookies from a specific site.</li>
          <li>Block all cookies, or block cookies from specific sites.</li>
          <li>Set the browser to warn you before a cookie is placed.</li>
        </ul>
        <p>
          <strong>Be aware:</strong> blocking or deleting the essential cookies listed in section 02 will sign you out of Pleks and
          prevent the platform from working correctly. You will need to sign in again after clearing session cookies.
        </p>
        <p>
          Browser-specific guides:{" "}
          <ExtLink href={EXTERNAL_LINKS.chromeCookieHelp}>Chrome</ExtLink>{" "}
          <ExtLink href={EXTERNAL_LINKS.firefoxCookieHelp}>Firefox</ExtLink>{" "}
          <ExtLink href={EXTERNAL_LINKS.safariCookieHelp}>Safari</ExtLink>{" "}
          <ExtLink href={EXTERNAL_LINKS.edgeCookieHelp}>Edge</ExtLink>
        </p>
      </section>

      {/* 06 */}
      <section id="changes">
        <p className="sec-num"><span className="bar" /><span>06 · Changes</span></p>
        <h2 className="sec-h">Changes to this <span className="hl">policy</span></h2>
        <p>
          We may update this cookie policy from time to time as the platform evolves or as legal requirements change. Material
          changes include adding a new cookie or storage item, changing a cookie&rsquo;s purpose, adding a third-party recipient, or
          changing the lawful basis. Non-material changes (typographical corrections, link updates) take effect on publication. When
          we make material changes, we will update the &ldquo;Last reviewed&rdquo; date at the top of this page and, where
          appropriate, notify you by email.
        </p>
        <p>
          If an inconsistency exists between this Cookie Policy and the Pleks Terms of Service, the Terms of Service
          prevail unless mandatory law requires otherwise.
        </p>
        <p>
          For any questions about how Pleks uses cookies, contact our Information Officer.
        </p>
        <div className="officer-card">
          <span className="l">Information<br />officer</span>
          <span className="v">
            Stéan Bouwer
            <br /><span className="sub"><a href="mailto:legal@pleks.co.za">legal@pleks.co.za</a></span>
          </span>
        </div>
      </section>
    </LegalPageLayout>
  )
}
