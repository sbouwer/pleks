/**
 * app/(public)/cookie-policy/page.tsx — cookie policy for Pleks
 *
 * Route:  /cookie-policy
 * Auth:   public
 */
import type { Metadata } from "next"
import { LegalPageLayout } from "@/components/legal/LegalPageLayout"

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
      eyebrowParts={["COOKIES · TRACKING", "browser storage", "v1.0"]}
      titleBefore="Cookie"
      titleHighlight="policy"
      subtitle="How Pleks uses cookies and similar browser storage technologies to keep you signed in, measure performance, and improve the platform."
      kicker={[
        { label: "Last reviewed", value: "2026 · 04 · 01", mono: true },
        { label: "In force from",  value: "2026 · 05 · 05", mono: true },
        { label: "Jurisdiction",   value: "Republic of South Africa" },
        { label: "Framework",      value: "POPIA · ECT Act" },
      ]}
      sections={SECTIONS}
      hasSummary
      endLabel="END · COOKIE POLICY · v1.0"
    >
      {/* Plain-language summary */}
      <div className="summary-card" id="summary">
        <p className="sc-eyebrow">Plain-language summary</p>
        <h2 className="sc-h">What you need to know about cookies on Pleks</h2>
        <ul className="summary-list">
          <li><span className="b" /><span>Pleks uses essential cookies to keep you signed in and to protect your session. These cannot be disabled without breaking the platform.</span></li>
          <li><span className="b" /><span>We use Vercel Analytics for anonymous performance measurement. No personal data is sent to Vercel — only aggregated metrics.</span></li>
          <li><span className="b" /><span>We do not use advertising cookies, tracking pixels, or third-party behavioural profiling.</span></li>
          <li><span className="b" /><span>You can clear or block cookies in your browser settings at any time. Essential cookies will be re-set on next sign-in.</span></li>
          <li><span className="b" /><span>The public marketing site (pleks.co.za) uses fewer cookies than the authenticated dashboard — see section 02 for the full list.</span></li>
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
          Under the Electronic Communications and Transactions Act <span className="act-pill">ECT Act · S43</span> and the Protection
          of Personal Information Act <span className="act-pill">POPIA</span>, we are required to inform you about cookies that process
          personal information and to obtain your consent for non-essential cookies.
        </p>
      </section>

      {/* 02 */}
      <section id="essential">
        <p className="sec-num"><span className="bar" /><span>02 · Essential cookies</span></p>
        <h2 className="sec-h">Essential <span className="hl">cookies</span></h2>
        <p>
          These cookies are strictly necessary for Pleks to function. They cannot be disabled without preventing you from signing in
          or using the platform. No consent is required for these cookies under <span className="act-pill">POPIA · S11(1)(c)</span> —
          they are necessary for the performance of a contract you have entered into with us.
        </p>
        <table className="share-table">
          <thead>
            <tr>
              <th style={{ width: "35%" }}>Cookie</th>
              <th>Purpose</th>
              <th style={{ width: "20%" }}>Duration</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="who">sb-*-auth-token<span className="sub">Supabase</span></td>
              <td>Stores your authenticated session after sign-in. Required to access the dashboard.</td>
              <td>Session / 7 days</td>
            </tr>
            <tr>
              <td className="who">sb-*-auth-token-code-verifier<span className="sub">Supabase</span></td>
              <td>PKCE code verifier used during the OAuth authentication flow.</td>
              <td>Session</td>
            </tr>
            <tr>
              <td className="who">__Secure-next-auth.*<span className="sub">Next.js</span></td>
              <td>CSRF protection token for server actions and form submissions.</td>
              <td>Session</td>
            </tr>
            <tr>
              <td className="who">pub-theme<span className="sub">Pleks</span></td>
              <td>Stores your light/dark mode preference on the marketing site.</td>
              <td>1 year</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* 03 */}
      <section id="analytics">
        <p className="sec-num"><span className="bar" /><span>03 · Analytics cookies</span></p>
        <h2 className="sec-h">Analytics <span className="hl">cookies</span></h2>
        <p>
          Pleks uses <strong>Vercel Analytics</strong> to measure page performance and visitor counts on the marketing site. Vercel
          Analytics is privacy-focused by design: it does not use cookies, does not collect IP addresses, and does not build individual
          user profiles. The metrics we receive are aggregated and anonymous.
        </p>
        <p>
          Because Vercel Analytics does not process personal information as defined by <span className="act-pill">POPIA</span>, no
          consent banner is required for this measurement. If you block JavaScript or use a content blocker, analytics data is simply
          not collected — the platform continues to function normally.
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
              <td>When you complete a subscription payment or set up a recurring debit. Cookies are set on the PayFast checkout page.</td>
              <td>payfast.io/privacy</td>
            </tr>
            <tr>
              <td className="who">DocuSeal<span className="sub">e-signature</span></td>
              <td>When you sign or review a lease document within the DocuSeal signing flow.</td>
              <td>docuseal.com/privacy</td>
            </tr>
          </tbody>
        </table>
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
          Browser-specific guides: <a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener noreferrer">Chrome</a>,{" "}
          <a href="https://support.mozilla.org/kb/clear-cookies-and-site-data-firefox" target="_blank" rel="noopener noreferrer">Firefox</a>,{" "}
          <a href="https://support.apple.com/guide/safari/manage-cookies-sfri11471" target="_blank" rel="noopener noreferrer">Safari</a>,{" "}
          <a href="https://support.microsoft.com/windows/delete-and-manage-cookies" target="_blank" rel="noopener noreferrer">Edge</a>.
        </p>
      </section>

      {/* 06 */}
      <section id="changes">
        <p className="sec-num"><span className="bar" /><span>06 · Changes</span></p>
        <h2 className="sec-h">Changes to this <span className="hl">policy</span></h2>
        <p>
          We may update this cookie policy from time to time as the platform evolves or as legal requirements change. When we make
          material changes, we will update the &ldquo;Last reviewed&rdquo; date at the top of this page and, where appropriate,
          notify you by email.
        </p>
        <p>
          For any questions about how Pleks uses cookies, contact our Information Officer at{" "}
          <a href="mailto:legal@pleks.co.za">legal@pleks.co.za</a>.
        </p>
        <div className="officer-card">
          <span className="l">Information<br />officer</span>
          <span className="v">
            Stéan Bouwer
            <span className="sub"><a href="mailto:legal@pleks.co.za">legal@pleks.co.za</a></span>
          </span>
        </div>
      </section>
    </LegalPageLayout>
  )
}
