/**
 * app/(public)/definitions/page.tsx — shared legal definitions for the Pleks document suite
 *
 * Route:  /definitions
 * Auth:   public
 * Notes:  First document in the legal nav. Terms defined here are used consistently
 *         across the Privacy Policy, Terms of Service, PAIA Manual, Credit Check Policy,
 *         Cookie Policy, and POPIA Processing Register. Where a definition in another
 *         document differs from one here, the more specific document governs for its
 *         own purposes; the Terms of Service prevail over all others in the event of
 *         inconsistency.
 */
import type { Metadata } from "next"
import { LegalPageLayout } from "@/components/legal/LegalPageLayout"
import { LEGAL_VERSIONS } from "@/lib/legal-versions"

export const metadata: Metadata = {
  title: "Definitions — Pleks",
  description: "Definitions of key terms used across the Pleks legal document suite — Privacy Policy, Terms of Service, PAIA Manual, Credit Check Policy, and POPIA Processing Register.",
}

const SECTIONS = [
  { id: "about",    num: "01", label: "About this document" },
  { id: "popia",    num: "02", label: "POPIA terms"         },
  { id: "platform", num: "03", label: "Platform terms"      },
  { id: "legal",    num: "04", label: "Legal & process"     },
  { id: "tech",     num: "05", label: "Technical terms"     },
  { id: "acts",     num: "06", label: "Acts & regulations"  },
]

export default function DefinitionsPage() {
  return (
    <LegalPageLayout
      eyebrowParts={["DEFINITIONS", "shared glossary", LEGAL_VERSIONS.definitions]}
      titleBefore="Legal"
      titleHighlight="definitions"
      subtitle="Key terms used consistently across the Pleks legal document suite. Start here if you are reading any Pleks legal document for the first time."
      kicker={[
        { label: "Last reviewed", value: "2026 · 05 · 07", mono: true },
        { label: "Effective",     value: "2026 · 05 · 07", mono: true },
        { label: "Applies to",    value: "All Pleks legal documents"   },
        { label: "Jurisdiction",  value: "Republic of South Africa"    },
      ]}
      sections={SECTIONS}
      hasSummary={false}
      endLabel={`END · DEFINITIONS · ${LEGAL_VERSIONS.definitions}`}
    >

      {/* 01 — About */}
      <section id="about">
        <p className="sec-num"><span className="bar" /><span>01 · About this document</span></p>
        <h2 className="sec-h">About <span className="hl">this document</span></h2>
        <p>
          This glossary defines key terms used across the Pleks legal document suite. Each definition applies
          consistently unless a specific document states otherwise for its own purposes.
        </p>

        <p><strong>Hierarchy of definitions</strong></p>
        <ul className="legal-list">
          <li>Statutory definitions (as enacted in South African legislation) take precedence over all other definitions in this document.</li>
          <li>Document-specific definitions override this glossary within the scope of that document only.</li>
          <li>Platform-specific definitions (such as FitScore and Compliance Records) are subordinate to statutory terms where both could apply.</li>
          <li>In the event of any inconsistency between documents, the Terms of Service prevail unless mandatory law requires a different outcome.</li>
        </ul>

        <p><strong>Capitalisation</strong></p>
        <p>
          Capitalised terms have the meanings assigned in this document or the relevant governing legal document.
          Where a term is capitalised in one Pleks document but not another, the capitalised usage takes its
          defined meaning; the uncapitalised usage takes its ordinary meaning unless context clearly indicates
          otherwise.
        </p>

        <p><strong>Legal Document Suite</strong></p>
        <p>
          The collective set of governing legal documents applicable to the Pleks platform, including the Terms of Service, 
          Privacy Policy, PAIA Manual, Cookie Policy, Credit Check Policy, POPIA Processing Register, and this Definitions 
          document. The Legal Document Suite operates as a unified interpretive framework, and all references to “this 
          document” or “these terms” include the applicable document within this suite unless explicitly stated otherwise.
        </p>

        <p><strong>Undefined terms</strong></p>
        <p>
          Any term not defined in this document shall be interpreted in accordance with applicable South African
          law and, where relevant, its ordinary commercial meaning in the South African property management sector.
        </p>
      </section>

      {/* 02 — POPIA terms — alphabetical */}
      <section id="popia">
        <p className="sec-num"><span className="bar" /><span>02 · POPIA terms</span></p>
        <h2 className="sec-h">POPIA <span className="hl">terms</span></h2>

        <p><strong>Consent</strong></p>
        <p>
          Any voluntary, specific, and informed expression of will in terms of POPIA s1 and s11(1)(a), by which
          a Data Subject agrees to the Processing of their Personal Information. Consent for credit checks and
          applicant screening is explicit written consent obtained individually before any bureau query is
          submitted. Consent may be withdrawn at any time, subject to the limitations described in the Credit
          Check Policy and Privacy Policy. Pleks distinguishes explicit consent (s11(1)(a)) — required for
          credit checks and marketing — from other lawful bases (contractual necessity, legal obligation,
          legitimate interest) which do not require consent and cannot be withdrawn.
        </p>

        <p><strong>Consent Log</strong></p>
        <p>
          An immutable record of all Consent events captured within the Pleks platform, including timestamp, IP address, 
          Consent version, purpose of Processing, and the Data Subject to whom the Consent relates. The Consent Log is 
          retained for accountability purposes under POPIA s17 and forms part of the Compliance Records dataset with a 
          10-year Retention Period.
        </p>

        <p><strong>Data Subject</strong></p>
        <p>
          The person to whom Personal Information relates, as defined in POPIA s1. In the Pleks context, Data
          Subjects include tenants, applicants, landlords, Agency staff, and any other individual whose Personal
          Information is Processed through the platform.
        </p>

        <p><strong>DPIA — Data Protection Impact Assessment</strong></p>
        <p>
          A structured process for identifying and minimising the privacy risks of new or significantly changed
          Processing activities — as contemplated in POPIA s27 and recommended best practice for high-risk
          Processing. Pleks conducts DPIAs before introducing new AI-assisted Processing workflows or materially
          expanding the scope of existing ones.
        </p>

        <p><strong>Information Officer</strong></p>
        <p>
          The person designated by Pleks (Pty) Ltd under POPIA s55 to encourage compliance, deal with
          data-subject requests, and engage with the Information Regulator. Also the head of the private body
          for PAIA purposes. Contact:{" "}
          <a href="mailto:legal@pleks.co.za">legal@pleks.co.za</a>.
        </p>

        <p><strong>Lawful basis</strong></p>
        <p>
          One of the grounds in POPIA s11(1) that authorises Processing. The principal bases used by Pleks are:
          s11(1)(a) explicit Consent; s11(1)(b) contractual necessity; s11(1)(c) legal obligation; and s11(1)(f)
          legitimate interest (subject to a balancing test). Where multiple bases apply, Pleks relies primarily
          on the basis most directly connected to the Processing activity.
        </p>

        <p><strong>Operator</strong></p>
        <p>
          A person or organisation that Processes Personal Information on behalf of a Responsible Party, without
          coming under the direct authority of that party — as defined in POPIA s1. Pleks (Pty) Ltd acts as
          Operator for all agency-managed data (Part B Processing). The written data-processing agreement
          between Pleks as Operator and the Agency as Responsible Party is set out in the Terms of Service §09.
        </p>

        <p><strong>Part A processing</strong></p>
        <p>
          Processing of Personal Information for which Pleks (Pty) Ltd is the Responsible Party — primarily
          platform operations: authentication, billing, security monitoring, error logging, and platform
          administration. See the POPIA Processing Register Part A for the full enumeration.
        </p>

        <p><strong>Part B processing</strong></p>
        <p>
          Processing of Personal Information on behalf of Agencies as Responsible Parties — covering all
          rental-management operations: tenant applications, credit checks, leases, rent collection, inspections,
          maintenance, trust accounting, and communications. See the POPIA Processing Register Part B for the
          full enumeration.
        </p>

        <p><strong>Personal Information</strong></p>
        <p>
          Information relating to an identifiable, living, natural person — including name, identity number,
          contact details, location data, financial records, health information, biometric data, and any other
          information that can be used alone or in combination to identify a person — as defined in POPIA s1.
          The definition also extends to an identifiable, existing juristic person to the extent that such
          information is not publicly available or otherwise exempted under POPIA.
        </p>

        <p><strong>Processing</strong></p>
        <p>
          Any operation or activity, whether automated or not, concerning Personal Information — including
          collection, receipt, recording, organisation, collation, storage, updating or modification, retrieval,
          alteration, consultation, use, dissemination, distribution, merging, linking, blocking, degradation,
          erasure, or destruction of information — as defined in POPIA s1. Processing is the base concept that
          triggers all POPIA obligations: Lawful basis requirements, Operator/Responsible Party allocation,
          Retention Period rules, and Data Subject rights.
        </p>

        <p><strong>Processing Instructions</strong></p>
        <p>
          The documented and system-enforced instructions issued by a Responsible Party to an Operator governing the 
          Processing of Personal Information. In the Pleks platform, Processing Instructions are constituted by:
          (i) the POPIA Processing Register (Part A and Part B), (ii) the Terms of Service, and (iii) system-level 
          configuration defaults that define how data is Processed on behalf of Agencies. These instructions are binding 
          on Pleks (Pty) Ltd when acting as Operator under POPIA s20–s21.
        </p>

        <p><strong>Processing under instruction</strong></p>
        <p>
          Processing of Personal Information carried out by an Operator strictly in accordance with documented
          instructions from a Responsible Party, as required by POPIA s20–s21. Pleks processes Part B data only
          on the documented instructions of the Agency. The purpose entries in the POPIA Processing Register
          constitute the Agency&rsquo;s standing instructions for all standard platform operations.
        </p>

        <p><strong>Pseudonymised</strong></p>
        <p>
          Personal Information that has been processed so that it can no longer be attributed to a specific Data
          Subject without additional information held separately. Unlike anonymisation, pseudonymisation is
          reversible — re-identification remains reasonably possible when pseudonymised data is combined with
          other information held by Pleks or the Agency. Pseudonymised data remains Personal Information and is
          subject to POPIA.
        </p>

        <p><strong>Responsible Party</strong></p>
        <p>
          The person or organisation that determines the purpose and means of Processing — as defined in POPIA
          s1. For data arising from agency use of the Pleks platform (tenants, applicants, leases, trust
          accounts), the Agency is the Responsible Party. For data arising from platform operations
          (authentication, billing, error monitoring), Pleks (Pty) Ltd is the Responsible Party.
        </p>
        
        <p><strong>Special Personal Information</strong></p>
        <p>
          Sensitive categories of data as defined in POPIA s26 — including religious beliefs, race, 
          trade union membership, health, or criminal behavior. Pleks does not actively solicit 
          this data, but may process it where incidentally included in documents or communications 
          provided by a Responsible Party.
        </p>
      </section>

      {/* 03 — Platform terms — alphabetical */}
      <section id="platform">
        <p className="sec-num"><span className="bar" /><span>03 · Platform terms</span></p>
        <h2 className="sec-h">Platform <span className="hl">terms</span></h2>

        <p><strong>Agency</strong></p>
        <p>
          A juristic person — typically a property management company or estate agency — that subscribes to the
          Pleks platform to manage properties, leases, tenants, and related operational data. An Agency is the
          Responsible Party for all Part B data Processed through the platform. Where an individual landlord
          subscribes directly without an Agency intermediary, that landlord is treated as the Agency for the
          purposes of these documents.
        </p>

        <p><strong>Applicant</strong></p>
        <p>
          A natural or juristic person (including companies, close corporations, trusts, partnerships, or other legal entities) 
          that applies for residential or commercial tenancy through an Agency using the Pleks platform. An Applicant may act 
          through one or more authorised representatives (Users) where the Applicant is a juristic person.
        </p>

        <p>
          Applicant records may be subject to identity verification, affordability assessment, reference checks, and credit 
          bureau enquiries where explicit Consent is obtained in terms of POPIA s11(1)(a). All credit and screening activities 
          are governed by the Credit Check Policy and applicable lawful basis requirements.
        </p>

        <p>
          Unsuccessful Applicant records are retained for 90 days after rejection, after which they are automatically purged 
          unless converted into Tenant records following approval of a lease agreement. Successful Applicants are reclassified 
          as Tenants for the duration of the lease relationship.
        </p>

        <p><strong>Compliance Records</strong></p>
        <p>
          A defined subset of records retained beyond the standard 12-month Operational Data window because of
          specific statutory obligations. The five categories are: (1) audit log — 7 years (POPIA s17);
          (2) trust account records — 5 years from end of financial year (PPA Reg 33); (3) trust reconciliation
          records — 5 years (PPA Reg 33); (4) consent log — 10 years (POPIA s17); (5) authentication events —
          7 years (POPIA s17 / Companies Act s24). Held in a restricted-access archive after operational
          deletion, accessible only for the legal obligation that requires their retention. Where a record
          qualifies as both Operational Data and a Compliance Record, it is treated as a Compliance Record for
          Retention Period purposes — the longer period always governs.
        </p>

        <p><strong>Fiduciary-class actions</strong></p>
        <p>
          Platform actions involving Trust Account funds, deposit transactions, or financial decisions with
          direct regulatory consequences under the Property Practitioners Act — for example: recording a trust
          receipt, allocating a deposit, initiating a disbursement, or approving a deduction schedule. These
          actions require MFA step-up authentication (passkey or TOTP challenge) before execution.
        </p>

        <p><strong>FitScore</strong></p>
        <p>
          A Pleks-proprietary applicant rating combining credit bureau results, verified income, employment
          stability, and rental payment history into a weighted score for use by Agencies in evaluating rental
          applications. FitScore is an assistive tool only — it does not constitute automated decision-making
          within the meaning of POPIA s71 because no outcome is triggered automatically by any score threshold,
          and FitScore does not deterministically influence system outcomes or enforce thresholds. All tenancy
          decisions remain with the Agency or landlord. FitScore outputs may not be used as the sole basis for
          approval, rejection, or adverse treatment of an Applicant.
        </p>

        <p><strong>Landlord / Property Owner</strong></p>
        <p>
          The legal owner of a property managed through the Pleks platform. While often represented 
          by an Agency acting as an intermediary, a Landlord may also be a Subscriber in 
          their own right.
        </p>

        <p><strong>Operational Data</strong></p>
        <p>
          The day-to-day records created through Agency use of the Pleks platform — properties, leases, tenant
          profiles, communications, inspection records, maintenance records, rent ledgers, and related documents.
          Retained for 12 months after Subscription cancellation, then deleted from production systems and
          excluded from backup retention — subject to statutory Retention Periods and active Legal Holds.
        </p>

        <p><strong>Organisation</strong></p>
        <p>
          A system-level tenant container used within the Pleks platform to enforce multi-tenant data isolation. 
          An Organisation represents a logical partition of data (identified by org_id) and may correspond to an Agency, 
          but is not itself a legal entity. Organisations also exist for system-generated or internal records, including 
          sentinel or purged accounts, and do not necessarily represent active commercial users.
        </p>

        <p><strong>PENDING_CANCELLATION</strong></p>
        <p>
          An intermediate Subscription state between <em>active</em> and <em>cancelled</em>. When an Agency
          owner initiates cancellation, the Subscription moves to PENDING_CANCELLATION. The 12-month Operational
          Data Retention Period starts only after the cancellation is confirmed via MFA challenge or email
          confirmation link. Unconfirmed requests expire after 24 hours and the Subscription reverts to active.
        </p>

        <p><strong>Platform</strong></p>
        <p>
          The collective set of Pleks SaaS applications, Application Programming Interfaces (APIs), 
          and associated administrative tooling used to deliver the service.
        </p>

        <p><strong>Retention Period</strong></p>
        <p>
          The defined time period for which a category of data is stored before deletion, anonymisation, or
          transfer to Compliance Records, as specified in the applicable retention schedule. Retention Periods
          are determined by the longer of: the contractual period (e.g. 12 months post-cancellation for
          Operational Data), the statutory period (e.g. 5 years for trust records under PPA Reg 33), or any
          active Legal Hold. Where a record falls under both an Operational Data Retention Period and a
          Compliance Records Retention Period, the longer Compliance Records period prevails.
        </p>

        <p><strong>Retention Start Event</strong></p>
        <p>
          The triggering event that determines the commencement of a Retention Period for a specific category of data. 
          Examples include Subscription cancellation confirmation, lease termination, Applicant rejection, or completion 
          of a financial year for trust accounting purposes. Where multiple Retention Periods may apply, the earliest 
          valid triggering event is recorded, but the longest applicable statutory or contractual Retention Period always prevails.
        </p>

        <p><strong>Sentinel Organisation</strong></p>
        <p>
          An internal system organisation (<code>__purged__</code>, UUID{" "}
          <code>00000000-0000-0000-0000-000000000001</code>) that receives Compliance Record rows when an Agency
          account is purged. It has no User membership and its rows are never returned by application queries.
          It exists solely to retain Compliance Records after the operational deletion of an Agency account.
        </p>

        <p><strong>Subscriber</strong></p>
        <p>
          Any natural or juristic person (including estate agencies and landlords) that maintains 
          an active paid account to use the Pleks platform. The Subscriber is typically the party 
          entering into the primary contractual agreement with Pleks (Pty) Ltd.
        </p>

        <p><strong>Subscription</strong></p>
        <p>
          A contractual arrangement between an Agency and Pleks (Pty) Ltd granting access to the Pleks platform
          under a defined pricing tier and Terms of Service. The Subscription lifecycle — active, past_due,
          paused, PENDING_CANCELLATION, cancelled, purged — determines which platform features are accessible
          and triggers the Operational Data retention and deletion schedule.
        </p>

        <p><strong>Tenant</strong></p>
        <p>
          A natural or juristic person (including companies, close corporations, trusts, partnerships, or other legal entities) 
          that occupies or has occupied a residential or commercial property under a lease agreement administered through 
          the Pleks platform. A Tenant may be represented by one or more authorised Users acting on its behalf within the system.
        </p>

        <p>
          A Tenant is a Data Subject under POPIA where the Tenant is a natural person, and a Data Subject representative 
          context where the Tenant is a juristic person. Tenant records are Processed on behalf of an Agency as Responsible Party 
          under Part B Processing.
        </p>

        <p><strong>Trust Account</strong></p>
        <p>
          A separate bank account maintained by a property practitioner in accordance with the Property
          Practitioners Act 22 of 2019 (PPA s86) for holding rental income, deposits, and other funds on behalf
          of clients. Pleks does not hold, control, or initiate payments from Trust Accounts — it provides tools
          for Agencies to reconcile and audit their own Trust Account against bank statement imports. Trust
          Account records are Compliance Records subject to a 5-year Retention Period from the end of the
          relevant financial year (PPA Regulation 33).
        </p>

        <p><strong>User</strong></p>
        <p>
          An authenticated individual account holder who is granted access to the Pleks platform. A User is strictly a 
          system-level identity used for authentication and access control, and does not in itself determine legal status, 
          contractual role, or POPIA classification.
        </p>

        <p>
          A User may act on behalf of one or more legal or organisational entities within the platform, including (without 
          limitation) an Agency, a Landlord, a Property Owner, a Tenant, or an Applicant, depending on the permissions 
          and roles assigned to that User within the relevant Organisation context.
        </p>

        <p>
          The legal character of any action (including whether it is performed as Responsible Party, Operator, Tenant, 
          Landlord, or Applicant) is determined by the underlying Organisation context and role assignment, not by the 
          User identity itself.
        </p>

        <p>
          A single User may hold multiple roles across different Organisations and may act in different capacities in 
          different contexts. All actions are recorded against the User identity for audit purposes, but legal attribution 
          is determined by role and organisational context.
        </p>

        <p>
          References to “User” in the platform or documentation refer exclusively to the authenticated system identity.
        </p>
      </section>

      {/* 04 — Legal & process terms — alphabetical */}
      <section id="legal">
        <p className="sec-num"><span className="bar" /><span>04 · Legal &amp; process terms</span></p>
        <h2 className="sec-h">Legal &amp; process <span className="hl">terms</span></h2>

        <p><strong>Break-glass procedure</strong></p>
        <p>
          A controlled-access process for reading Compliance Records when normal application access paths are
          unavailable or insufficient — for example, responding to a PAIA request or SARS audit. Requires prior
          written approval from the Information Officer and results in a logged entry in the compliance access
          log. All break-glass exports include export timestamp, actor identity, and case reference for
          chain-of-custody purposes.
        </p>

        <p><strong>Legal Hold</strong></p>
        <p>
          A formal instruction suspending the automated deletion lifecycle for a specific Agency&rsquo;s data,
          placed by the Information Officer in response to a subpoena, court order, regulatory investigation, or
          preservation request. During a Legal Hold, both Operational Data and Compliance Records are retained
          regardless of their normal Retention Periods, and statutory expiry timers for Compliance Records are
          suspended until the hold is released.
        </p>

        <p><strong>Material Change</strong></p>
        <p>
          Any modification to the Terms of Service, Privacy Policy, or related legal documents that affects:
          (i) lawful basis of Processing, (ii) data retention periods, (iii) data sharing or Operators,
          (iv) user rights or obligations, or (v) pricing, billing, or Subscription structure. 
          Material Changes trigger notification and, where required by POPIA s11 or contractual terms, 
          renewed acceptance of the updated Terms.
        </p>

        <p><strong>Tribunal</strong></p>
        <p>
          The Rental Housing Tribunal established under section 7 of the Rental Housing Act 50 of 1999.
          Statutory body with jurisdiction over landlord-tenant disputes including unfair practices, deposit
          disputes, and lease compliance. Inspection records, photographs, and communications carry evidentiary
          preservation timelines specifically designed to support Tribunal proceedings.
        </p>

        <p><strong>Wear and tear</strong></p>
        <p>
          The reasonable deterioration of a rental property and its fittings attributable to ordinary residential
          use over time, as distinct from damage caused by tenant negligence or deliberate act. Under the Rental
          Housing Act s5(3)(c), normal wear and tear may not be deducted from a tenant&rsquo;s deposit. Every
          item on a Pleks deposit deduction schedule must be classified and justified separately; the Agency
          remains solely responsible for ensuring deductions comply with the RHA and applicable Tribunal
          standards.
        </p>
      </section>

      {/* 05 — Technical terms — alphabetical */}
      <section id="tech">
        <p className="sec-num"><span className="bar" /><span>05 · Technical terms</span></p>
        <h2 className="sec-h">Technical <span className="hl">terms</span></h2>

        <p><strong>AAL2 — Authenticator Assurance Level 2</strong></p>
        <p>
          A session authentication strength level achieved by completing an MFA challenge (passkey or TOTP) in
          addition to initial sign-in. Required for Fiduciary-class actions and for confirming a Subscription
          cancellation. Where a User does not have MFA enrolled (typically Owner-free tier), an email
          confirmation link with 24-hour validity serves as an equivalent gate.
        </p>

        <p><strong>Backup Data</strong></p>
        <p>
          System-generated copies of Operational Data created for disaster recovery purposes, including 
          database snapshots, Point-in-Time Recovery (PITR) states, and infrastructure-level backups. 
          Backup Data is not part of the live production dataset, is not directly accessible via the application layer, 
          and is maintained solely for resilience and recovery purposes. Backup Data is subject to separate retention 
          and restoration controls and does not override applicable statutory Retention Periods or Legal Holds.
        </p>

        <p><strong>MFA — Multi-Factor Authentication</strong></p>
        <p>
          An authentication method requiring a User to verify their identity using two or more independent
          factors before access is granted — typically something they know (password or PIN) plus something they
          have (a device generating a one-time code) or something they are (biometric via passkey). Pleks
          requires MFA for all agent-role Users and enforces an AAL2 step-up challenge before Fiduciary-class
          actions and Subscription cancellation.
        </p>

        <p><strong>Passkey / WebAuthn</strong></p>
        <p>
          A cryptographic credential used for MFA that relies on public-key cryptography rather than passwords. 
          Biometric data used to unlock a passkey remains on the user&apos;s device and is never transmitted to Pleks.
        </p>

        <p><strong>PITR — Point-in-Time Recovery</strong></p>
        <p>
          A database backup mechanism allowing restoration to any point within a defined retention window. Pleks
          uses Supabase PITR. A Legal Hold does not automatically extend the PITR window — infrastructure-level
          backup suspension requires a separate counsel directive and must be documented in the hold case file.
        </p>

        <p><strong>RLS — Row-Level Security</strong></p>
        <p>
          A Postgres database security feature that enforces access control at the individual row level, ensuring
          each Agency can only read and write its own data regardless of the query used. RLS is the primary
          data-isolation mechanism in the Pleks database. Row-level access controls are enforced across all
          production application data stores containing Personal Information.
        </p>

        <p><strong>SCCs — Standard Contractual Clauses</strong></p>
        <p>
          Contractual provisions imposing data-protection obligations substantially equivalent to POPIA on
          recipients of Personal Information outside South Africa, used as the primary mechanism for
          cross-border transfers under POPIA s72(1)(a). Note: POPIA does not formally adopt GDPR-style SCCs
          as a named instrument — Pleks uses SCC-style contractual safeguards that meet the POPIA s72(1)(a)
          adequacy standard.
        </p>

        <p><strong>TOTP — Time-Based One-Time Password</strong></p>
        <p>
          A short-lived numeric code generated by an authenticator app (such as Google Authenticator or Authy)
          using a shared secret and the current timestamp, as standardised in RFC 6238. On Pleks, TOTP is the
          fallback MFA method when a passkey is not enrolled. A new code is generated every 30 seconds and is
          valid for a single authentication attempt.
        </p>
      </section>

      {/* 06 — Acts & regulations — alphabetical by abbreviation */}
      <section id="acts">
        <p className="sec-num"><span className="bar" /><span>06 · Acts &amp; regulations</span></p>
        <h2 className="sec-h">Acts &amp; <span className="hl">regulations</span></h2>
        
        <div className="terms-list"> {/* Wrapped in a div for better spacing control */}
          <p><strong>CPA</strong></p>
          <p>
            Consumer Protection Act 68 of 2008 — governs consumer rights in fixed-term agreements,
            auto-renewals, cooling-off periods, and unfair contract terms in South Africa.
          </p>

          <p><strong>Credit Bureau Code</strong></p>
          <p>
            Code of Conduct issued under POPIA (2020) — regulates credit information processing and
            requires explicit consent before any credit bureau enquiry.
          </p>

          <p><strong>ECT Act</strong></p>
          <p>
            Electronic Communications and Transactions Act 25 of 2002 — provides legal recognition
            for electronic contracts, signatures, and data messages.
          </p>

          <p><strong>FICA</strong></p>
          <p>
            Financial Intelligence Centre Act 38 of 2001 — imposes anti-money-laundering and
            know-your-customer obligations on accountable institutions, including estate agencies.
          </p>

          <p><strong>GDPR</strong></p>
          <p>
            General Data Protection Regulation (EU) 2016/679 — referenced only for SCC-style contractual
            safeguards used under POPIA s72(1)(a) for cross-border transfers. GDPR does not apply directly
            to Pleks operations.
          </p>

          <p><strong>NCA</strong></p>
          <p>
            National Credit Act 34 of 2005 — regulates credit providers and credit bureaus, including
            consent-based credit reporting and dispute mechanisms.
          </p>

          <p><strong>PAIA</strong></p>
          <p>
            Promotion of Access to Information Act 2 of 2000 — provides the right of access to information
            held by public and private bodies.
          </p>

          <p><strong>POPIA</strong></p>
          <p>
            Protection of Personal Information Act 4 of 2013 — South Africa’s primary data protection law
            governing lawful processing, retention, security safeguards, and data subject rights.
          </p>

          <p><strong>PPA</strong></p>
          <p>
            Property Practitioners Act 22 of 2019 — governs property practitioners including registration,
            fidelity Fund Certificates, and trust account obligations.
          </p>

          <p><strong>PPA Regulation 33</strong></p>
          <p>
            Trust account record-keeping regulation under the Property Practitioners Act — requires a
            5-year retention period for all trust account records from the end of the relevant financial year.
          </p>

          <p><strong>RHA</strong></p>
          <p>
            Rental Housing Act 50 of 1999 — governs residential rental relationships including deposits,
            inspections, unfair practices, and Rental Housing Tribunal jurisdiction.
          </p>

          <p><strong>STSMA</strong></p>
          <p>
            Sectional Titles Schemes Management Act 8 of 2011 — governs sectional title schemes and
            homeowners’ associations in South Africa.
          </p>

          <p><strong>TAA</strong></p>
          <p>
            Tax Administration Act 28 of 2011 — imposes record-keeping obligations including a
            5-year retention period for tax and financial records.
          </p>
        </div>
      </section>

    </LegalPageLayout>
  )
}
