/**
 * components/legal/PaiaManualPdf.tsx — react-pdf document for the PAIA s51 manual
 *
 * Auth:  public (served via /api/paia-manual-pdf)
 * Notes: Mirrors the content of app/(public)/paia-manual/page.tsx.
 *        Keep in sync when the manual content changes.
 */
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"

const amber = "#B45309"
const ink   = "#1a1a18"
const mute  = "#6b6b60"
const faint = "#d4d0c4"

const s = StyleSheet.create({
  page:       { fontFamily: "InterTight", fontSize: 9, color: ink, paddingTop: 56, paddingBottom: 56, paddingHorizontal: 56, lineHeight: 1.6 },
  /* cover — three-section layout: logo top, title middle, kicker footer */
  coverMid:   { flex: 1, justifyContent: "center" },
  logoWord:   { fontSize: 18, fontWeight: 700, color: ink, letterSpacing: -0.3 },
  coverTag:   { fontSize: 7, color: amber, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 0 },
  coverTitle: { fontSize: 28, fontWeight: 700, marginBottom: 6, marginTop: 4 },
  coverSub:   { fontSize: 11, color: mute, maxWidth: 340 },
  kicker:     { flexDirection: "row", gap: 32 },
  kickerCell: { gap: 2 },
  kickerL:    { fontSize: 7, color: mute, letterSpacing: 0.8, textTransform: "uppercase" },
  kickerV:    { fontSize: 9, fontWeight: 600 },
  rule:       { borderBottomWidth: 0.5, borderBottomColor: faint, marginVertical: 24 },
  /* sections */
  secNum:     { fontSize: 7, color: amber, letterSpacing: 1.2, textTransform: "uppercase" },
  secH:       { fontSize: 16, fontWeight: 700, marginBottom: 10 },
  p:          { marginBottom: 8, color: ink },
  bold:       { fontWeight: 700 },
  li:         { flexDirection: "row", marginBottom: 5 },
  bullet:     { width: 14, color: amber, fontWeight: 700 },
  liText:     { flex: 1 },
  /* table */
  table:      { marginVertical: 10, borderWidth: 0.5, borderColor: faint },
  thead:      { flexDirection: "row", backgroundColor: "#f5f3ee", borderBottomWidth: 0.5, borderBottomColor: faint },
  trow:       { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: faint },
  tlastrow:   { flexDirection: "row" },
  th:         { padding: "5 7", fontSize: 7, fontWeight: 700, color: mute, letterSpacing: 0.6, textTransform: "uppercase" },
  td:         { padding: "5 7", fontSize: 8.5 },
  tdSub:      { fontSize: 7.5, color: mute },
  /* end stamp */
  endstamp:   { marginTop: 48, paddingTop: 16, borderTopWidth: 0.5, borderTopColor: faint, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  endL:       { fontSize: 7, color: mute, letterSpacing: 0.8 },
  /* page number */
  pageNum:    { position: "absolute", bottom: 28, right: 56, fontSize: 7, color: mute },
})

function SectionHeader({ num, label, title }: { num: string; label: string; title: string }) {
  return (
    <View style={{ marginTop: 28 }}>
      <Text style={s.secNum}>{num} · {label}</Text>
      <View style={{ borderBottomWidth: 0.5, borderBottomColor: faint, marginTop: 6, marginBottom: 14 }} />
      <Text style={s.secH}>{title}</Text>
    </View>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <Text style={s.p}>{children}</Text>
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <View style={s.li}>
      <Text style={s.bullet}>·</Text>
      <Text style={s.liText}>{children}</Text>
    </View>
  )
}

function TH({ children, width }: { children: React.ReactNode; width?: string | number }) {
  return <Text style={[s.th, width ? { width } : { flex: 1 }]}>{children}</Text>
}

function TD({ children, width, sub }: { children?: React.ReactNode; width?: string | number; sub?: string }) {
  return (
    <View style={[s.td, width ? { width } : { flex: 1 }]}>
      <Text>{children}</Text>
      {sub ? <Text style={s.tdSub}>{sub}</Text> : null}
    </View>
  )
}

export function PaiaManualPdf() {
  return (
    <Document
      title="PAIA Manual — Pleks (Pty) Ltd"
      author="Pleks (Pty) Ltd"
      subject="Promotion of Access to Information Act s51 Manual"
      keywords="PAIA, privacy, information officer, Pleks"
    >
      {/* Cover page */}
      <Page size="A4" style={s.page}>
        {/* TOP: wordmark — whole word is ink; accent bracket (⌝) floats top-right of "s".
            alignSelf: flex-start constrains the stoep line to wordmark width. */}
        <View style={{ alignSelf: "flex-start" }}>
          <View style={{ flexDirection: "row" }}>
            <Text style={s.logoWord}>plek</Text>
            <View style={{ position: "relative" }}>
              <Text style={s.logoWord}>s</Text>
              <View style={{
                position: "absolute", top: -1.5, right: -2,
                width: 5, height: 5,
                borderTopWidth: 1.5, borderRightWidth: 1.5,
                borderTopColor: amber, borderRightColor: amber,
              }} />
            </View>
          </View>
          {/* Stoep underline: ink 26% | amber 15% | ink 59%, offset 6pt from left */}
          <View style={{ flexDirection: "row", height: 2, marginTop: 7 }}>
            <View style={{ width: 6 }} />
            <View style={{ flex: 26, backgroundColor: ink }} />
            <View style={{ flex: 15, backgroundColor: amber }} />
            <View style={{ flex: 59, backgroundColor: ink }} />
          </View>
        </View>

        {/* MIDDLE: tag + rule + title + subtitle — vertically centred in remaining space */}
        <View style={s.coverMid}>
          <Text style={s.coverTag}>PAIA · s51 · Private body · v1.0</Text>
          <View style={s.rule} />
          <Text style={s.coverTitle}>PAIA Manual</Text>
          <Text style={[s.coverSub, { marginTop: 12 }]}>Pleks (Pty) Ltd — Promotion of Access to Information Act 2 of 2000</Text>
        </View>

        {/* BOTTOM: metadata kicker */}
        <View>
          <View style={{ borderBottomWidth: 0.5, borderBottomColor: faint, marginBottom: 16 }} />
          <View style={s.kicker}>
            <View style={s.kickerCell}><Text style={s.kickerL}>Compiled by</Text><Text style={s.kickerV}>Pleks (Pty) Ltd</Text></View>
            <View style={s.kickerCell}><Text style={s.kickerL}>Last reviewed</Text><Text style={s.kickerV}>2026 · 05</Text></View>
            <View style={s.kickerCell}><Text style={s.kickerL}>In force from</Text><Text style={s.kickerV}>2025 · 06 · 01</Text></View>
            <View style={s.kickerCell}><Text style={s.kickerL}>Act</Text><Text style={s.kickerV}>PAIA · s51</Text></View>
          </View>
        </View>

        <Text style={s.pageNum} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
      </Page>

      {/* §01 Introduction */}
      <Page size="A4" style={s.page}>
        <SectionHeader num="01" label="Introduction" title="Introduction" />
        <P>Section 51 of the Promotion of Access to Information Act 2 of 2000 (PAIA) requires every private body to compile a manual containing the information prescribed in that section. This manual has been compiled in accordance with those requirements.</P>
        <P>Pleks (Pty) Ltd is a private body as defined in PAIA. This manual describes the categories of records held by Pleks, explains the procedure for requesting access to those records, and provides the contact details of our Information Officer.</P>
        <P>This manual is available free of charge on our website at pleks.co.za/paia-manual.</P>

        <SectionHeader num="02" label="Contact details" title="Contact details" />
        <P><Text style={s.bold}>Information Officer:</Text> Stéan Bouwer</P>
        <P><Text style={s.bold}>Email:</Text> legal@pleks.co.za</P>
        <P><Text style={s.bold}>Company:</Text> Pleks (Pty) Ltd, Republic of South Africa</P>
        <P>All PAIA requests, queries, and complaints regarding access to information must be directed to the Information Officer at the contact details above. We respond within 30 days of receiving a complete request.</P>

        <SectionHeader num="03" label="SAHRC guide" title="SAHRC guide" />
        <P>The South African Human Rights Commission (SAHRC) has compiled a guide on how to use PAIA. This guide is available on the SAHRC website at sahrc.org.za, and from the SAHRC directly. The guide describes in plain language the subjects and categories of records held by public and private bodies, and how to request access.</P>
        <P>Contact the SAHRC at info@sahrc.org.za or on 011 877 3600.</P>

        <Text style={s.pageNum} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
      </Page>

      {/* §04 Available records */}
      <Page size="A4" style={s.page}>
        <SectionHeader num="04" label="Available records" title="Freely available records" />
        <P>The following records are available on our website without a formal PAIA request:</P>
        <P><Text style={s.bold}>4.1 Legal documents</Text></P>
        <Li>Privacy Policy (pleks.co.za/privacy)</Li>
        <Li>Terms of Service (pleks.co.za/terms)</Li>
        <Li>Cookie Policy (pleks.co.za/cookie-policy)</Li>
        <Li>Credit Check Policy (pleks.co.za/credit-check-policy)</Li>
        <Li>POPIA Processing Register (pleks.co.za/popia-register)</Li>
        <Li>This PAIA Manual (pleks.co.za/paia-manual)</Li>
        <P><Text style={s.bold}>4.2 General product information</Text></P>
        <Li>Product feature descriptions and pricing (pleks.co.za/#pricing)</Li>
        <Li>Sub-processor list (within the Privacy Policy and section 08 of this manual)</Li>
        <P>No request or fee is required to access any of the documents listed above.</P>

        <SectionHeader num="05" label="Records held" title="Records held by Pleks" />
        <P>The following categories of records are held by Pleks in the course of operating its property management platform. These records are held in electronic form and stored on servers operated by Supabase (United States) under Standard Contractual Clauses.</P>

        <View style={s.table}>
          <View style={s.thead}>
            <TH width="30%">Category · subjects</TH>
            <TH>Examples</TH>
            <TH width="20%">Retention</TH>
          </View>
          {[
            ["Agency accounts\nagencies, admins", "Company name, registration number, address, VAT number, banking details, subscription records", "Duration of account + 7 years (TAA s29)"],
            ["User accounts\nindividual users", "Name, email, hashed password, role, login history, MFA enrolment", "Duration of employment + 3 years"],
            ["Rental applications\napplicants", "ID number, contact details, employment info, bank statements, pay slips", "Declined: 12 months · Successful: lease term + 5 years (RHA s5(7))"],
            ["Credit check results\napplicants", "FitScore, bureau report, consent record, NCA check log", "3 years (NCA intermediary obligation)"],
            ["Lease records\ntenants, landlords", "Signed lease, rent amount, deposit, special conditions, addenda", "End of term + 5 years (RHA s5(7))"],
            ["Inspection records\ntenants, properties", "Ingoing/outgoing inspection report, photos, condition notes, signatures", "End of lease + 5 years"],
            ["Financial records\ntenants, landlords, agencies", "Rent payments, trust account transactions, owner statements, arrears history", "7 years (Tax Administration Act s29)"],
            ["Maintenance records\ntenants, contractors", "Job description, contractor assigned, completion status, photos, cost", "End of lease + 3 years"],
            ["Communication log\ntenants, landlords", "System-generated emails, SMS notices, WhatsApp messages via platform", "3 years"],
            ["Consent records\napplicants, tenants", "POPIA and NCA consent timestamps, IP address, consent text version", "Duration of record + 3 years"],
            ["Audit log\nall users", "Login events, data access events, admin actions — no PII values stored", "10 years (POPIA s19)"],
            ["Billing records\nagencies", "Subscription plan, PayFast transaction IDs, invoice history", "7 years (TAA s29)"],
          ].map((row, i, arr) => (
            <View key={i} style={i === arr.length - 1 ? s.tlastrow : s.trow}>
              <TD width="30%" sub={row[0].split("\n")[1]}>{row[0].split("\n")[0]}</TD>
              <TD>{row[1]}</TD>
              <TD width="20%">{row[2]}</TD>
            </View>
          ))}
        </View>

        <Text style={s.pageNum} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
      </Page>

      {/* §06 Grounds for refusal */}
      <Page size="A4" style={s.page}>
        <SectionHeader num="06" label="Grounds for refusal" title="Grounds for refusal" />
        <P>Pleks may refuse a request for access to a record on the following grounds permitted by PAIA:</P>
        <Li><Text style={s.bold}>Protection of personal information (PAIA s63):</Text> Where disclosure would unreasonably disclose personal information about a third party who has not consented to disclosure, and that party&rsquo;s right to privacy outweighs the requester&rsquo;s right of access.</Li>
        <Li><Text style={s.bold}>Commercial information (PAIA s64):</Text> Where a record contains trade secrets, financial, commercial, scientific or technical information the disclosure of which would likely cause harm to the competitive position of Pleks or a third party.</Li>
        <Li><Text style={s.bold}>Confidential information of third parties (PAIA s65):</Text> Where a record contains information supplied in confidence by a third party, the disclosure of which could reasonably be expected to prejudice the future supply of similar information.</Li>
        <Li><Text style={s.bold}>Legal privilege (PAIA s67):</Text> Where a record contains information protected by legal professional privilege.</Li>
        <Li><Text style={s.bold}>Research information (PAIA s69):</Text> Where disclosure of a record would reveal the identity of a person who provided information in confidence, and disclosure would be likely to prejudice future research of the same nature.</Li>
        <P>Where access is refused, the Information Officer will provide written reasons for the refusal on Form 3. The requester may apply for internal appeal or approach the Information Regulator.</P>

        <SectionHeader num="07" label="How to request access" title="How to request access" />
        <P><Text style={s.bold}>7.1 Who may request</Text></P>
        <P>Any person — including a juristic person — may submit a request for access to a record held by Pleks. You need not provide reasons for your request; however, providing context may help us locate the correct record and assess whether any grounds for refusal apply.</P>
        <P><Text style={s.bold}>7.2 How to submit (PAIA Form 2)</Text></P>
        <P>Requests must be submitted using PAIA Form 2, which is available from the Information Regulator at inforeg.org.za or on request from our Information Officer. Send the completed form to legal@pleks.co.za. We will acknowledge receipt within 3 business days.</P>
        <P><Text style={s.bold}>7.3 Request fee</Text></P>
        <P>A request fee of R140 (as prescribed by the PAIA Regulations) is payable before we process your request. This fee covers the cost of searching for and preparing the record. The fee is waived for personal information requests by the data subject.</P>
        <P><Text style={s.bold}>7.4 Response time</Text></P>
        <P>We will respond to your request within 30 days of receiving it. We may extend this period by a further 30 days where the request is for a large number of records, or where meeting the 30-day deadline would unreasonably interfere with our operations.</P>
        <P><Text style={s.bold}>7.5 Form 3 — outcome</Text></P>
        <P>Whether access is granted or refused, we will notify you using PAIA Form 3. If access is granted, the record will be provided in the format you requested, subject to availability.</P>
        <P><Text style={s.bold}>7.6 Internal appeal and complaints</Text></P>
        <P>If access is refused, or you are dissatisfied with the response, you may approach the Information Regulator at inforeg.org.za or 010 023 5200. The Information Regulator may investigate and order compliance.</P>
        <View style={[s.table, { marginTop: 16 }]}>
          <View style={s.thead}>
            <TH>Contact</TH>
            <TH>Details</TH>
          </View>
          <View style={s.trow}>
            <TD>Information Officer</TD>
            <TD>Stéan Bouwer · legal@pleks.co.za</TD>
          </View>
          <View style={s.tlastrow}>
            <TD>Information Regulator</TD>
            <TD>inforeg.org.za · 010 023 5200</TD>
          </View>
        </View>

        <Text style={s.pageNum} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
      </Page>

      {/* §08 Sub-processors */}
      <Page size="A4" style={s.page}>
        <SectionHeader num="08" label="Sub-processors" title="Sub-processors and third-party operators" />
        <P>Pleks uses the following third-party service providers (sub-processors) in the operation of the platform. Each sub-processor processes personal information only on Pleks&rsquo;s documented instructions and is bound by a data processing agreement.</P>

        <View style={s.table}>
          <View style={s.thead}>
            <TH width="25%">Provider</TH>
            <TH>Purpose</TH>
            <TH width="22%">Region</TH>
          </View>
          {[
            ["Supabase", "database & storage", "Encrypted database storage, file storage, authentication infrastructure", "USA · SCC · POPIA s72"],
            ["Vercel", "application hosting", "Serving the Pleks application and edge processing of requests", "USA · SCC · POPIA s72"],
            ["Resend", "transactional email", "Sending system emails — lease notifications, arrears alerts, verification codes", "USA · SCC · POPIA s72"],
            ["Africa's Talking", "SMS gateway", "Sending SMS notifications to tenants and landlords", "Kenya · SCC · POPIA s72"],
            ["Anthropic", "AI processing", "AI-assisted income extraction from bank statements — output only, no raw data retained", "USA · SCC · POPIA s72"],
            ["Searchworx", "credit bureau", "Credit and background checks on rental applicants under the NCA", "South Africa"],
            ["DocuSeal", "e-signatures", "Generating, sending and storing signed lease and consent documents", "USA · SCC · POPIA s72"],
            ["Better Stack", "monitoring", "Uptime monitoring and incident alerting — no personal data transmitted", "EU · SCC"],
            ["PayFast", "payments", "Subscription billing and rent collection on the trust account", "South Africa"],
          ].map((row, i, arr) => (
            <View key={i} style={i === arr.length - 1 ? s.tlastrow : s.trow}>
              <TD width="25%" sub={row[1]}>{row[0]}</TD>
              <TD>{row[2]}</TD>
              <TD width="22%">{row[3]}</TD>
            </View>
          ))}
        </View>

        <P>For sub-processors operating outside South Africa, data processing agreements incorporating Standard Contractual Clauses (SCCs) under POPIA s72 are in place. Copies are held on file and available to the Information Regulator on request.</P>

        <SectionHeader num="09" label="Security & protection" title="Security and protection of records" />
        <Li>All data is encrypted in transit using TLS 1.3 and at rest using AES-256 disk encryption via Supabase.</Li>
        <Li>Sensitive fields (ID numbers, banking details, credit reports) are additionally encrypted at the application level before being written to the database (encrypt-before-INSERT, decrypt-after-SELECT).</Li>
        <Li>Access is controlled by role-based permissions scoped to each organisation. No user can access another organisation&rsquo;s data.</Li>
        <Li>An immutable audit log records all access to personal information, reviewed quarterly.</Li>
        <Li>In the event of a personal information breach affecting data subjects, Pleks will notify the affected agency (as Responsible Party) within 72 hours and will notify the Information Regulator as required by POPIA s22.</Li>
        <P><Text style={s.bold}>9.2 Retention and destruction</Text></P>
        <View style={[s.table, { marginTop: 8 }]}>
          <View style={s.thead}>
            <TH width="35%">Record type</TH>
            <TH width="30%">Legal basis</TH>
            <TH width="35%">Retention period</TH>
          </View>
          {[
            ["Declined rental applications", "POPIA principle 8", "12 months from decision"],
            ["Successful application records", "RHA s5(7)", "Lease term + 5 years"],
            ["Lease and tenancy records", "RHA s5(7)", "End of term + 5 years"],
            ["Financial and trust account records", "Tax Administration Act s29", "7 years"],
            ["Credit check records (NCA intermediary)", "NCA obligations", "3 years"],
            ["Audit log (access and consent events)", "Internal · POPIA s19", "10 years"],
            ["User accounts (after deletion)", "POPIA principle 8", "90 days then purged"],
          ].map((row, i, arr) => (
            <View key={i} style={i === arr.length - 1 ? s.tlastrow : s.trow}>
              <TD width="35%">{row[0]}</TD>
              <TD width="30%">{row[1]}</TD>
              <TD width="35%">{row[2]}</TD>
            </View>
          ))}
        </View>

        <Text style={s.pageNum} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
      </Page>

      {/* §10–11 Amendments & Certification */}
      <Page size="A4" style={s.page}>
        <SectionHeader num="10" label="Amendments" title="Amendments to this manual" />
        <P>Pleks will review this manual at least once every two years, or whenever there is a material change in our records, processing activities, or the applicable law. The current version of this manual is always available at pleks.co.za/paia-manual.</P>
        <P>The version number and effective date on the cover of this document indicate when it was last updated. Requesters are encouraged to check the website for the most current version before submitting a request.</P>
        <P>Where a material change is made to the categories of records held, the purposes for which they are processed, or the grounds on which access may be refused, we will update this manual and publish the updated version on our website within 30 days of the change taking effect.</P>

        <SectionHeader num="11" label="Certification" title="Certification" />
        <P>I, the undersigned, being the Information Officer of Pleks (Pty) Ltd, certify that this manual has been compiled in accordance with the requirements of section 51 of the Promotion of Access to Information Act 2 of 2000, and that the information contained herein is, to the best of my knowledge, accurate and complete as at the date of compilation.</P>

        <View style={[s.table, { marginTop: 16 }]}>
          <View style={s.trow}>
            <TD width="30%">Name</TD>
            <TD>Stéan Bouwer</TD>
          </View>
          <View style={s.trow}>
            <TD width="30%">Title</TD>
            <TD>Information Officer — Pleks (Pty) Ltd</TD>
          </View>
          <View style={s.trow}>
            <TD width="30%">Date compiled</TD>
            <TD>1 June 2025</TD>
          </View>
          <View style={s.trow}>
            <TD width="30%">Last reviewed</TD>
            <TD>5 May 2026</TD>
          </View>
          <View style={s.tlastrow}>
            <TD width="30%">Version</TD>
            <TD>v1.0</TD>
          </View>
        </View>

        <View style={s.endstamp}>
          <Text style={s.endL}>END · PAIA MANUAL · v1.0</Text>
          <Text style={s.endL}>Pleks (Pty) Ltd · Republic of South Africa</Text>
        </View>

        <Text style={s.pageNum} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
      </Page>
    </Document>
  )
}
