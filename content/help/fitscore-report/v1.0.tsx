/**
 * content/help/fitscore-report/v1.0.tsx — "How to Read Your FitScore Report" — interpretation.v1.0
 *
 * Notes:  Policy-grade content. Edit discipline: CODEOWNERS requires Stéan + CD review.
 *         Language constraints: no recommendation language, no predictive language, no character framing.
 *         All band criteria and flag descriptions must remain consistent with COMPOSITE.md.
 *         Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §9.
 */

export function FitScoreHelpContent() {
  return (
    <>
      {/* 01 — What is the FitScore Report? */}
      <section id="what-is">
        <p className="sec-num"><span className="bar" /><span>01 · What is the FitScore Report?</span></p>
        <h2 className="sec-h">What is the <span className="hl">FitScore Report?</span></h2>
        <p>
          The FitScore Report is a structured summary produced by Pleks&apos;s screening engine after an
          agent runs a verification check on a lease application. It draws on credit bureau data, income
          verification, identity checks, employment tenure records, and Pleks network history (where
          available) to organise the evidence into a consistent format.
        </p>
        <p>
          The report presents this evidence as a band classification, four dimensional scores, a
          confidence assessment, a verification integrity grade, material flags, and an AI-generated
          narrative summary. It is produced once per application and delivered to the agent.
        </p>
        <p>
          A copy of the underlying bureau data is separately delivered to each applicant as Stream 1 —
          the combined consumer credit report — at the time the application is processed. This document
          explains what the FitScore Report shows and how to read it. It does not cover the Stream 1
          bureau report itself.
        </p>
      </section>

      {/* 02 — The doctrine */}
      <section id="doctrine">
        <p className="sec-num"><span className="bar" /><span>02 · The doctrine</span></p>
        <h2 className="sec-h">The <span className="hl">doctrine</span></h2>
        <blockquote className="legal-quote">
          Pleks verifies and organises applicant signals into a consistent screening framework.
          The landlord or agent remains the decision-maker.
        </blockquote>
        <p>
          FitScore band classifications describe the evidentiary state of the lease application at the
          time of assessment. They do not prescribe, recommend, or require a tenancy outcome. The
          classification is a fact about what the supplied evidence shows; the tenancy outcome is a
          separate human decision made by the agent or landlord, with the classification as one input
          among many.
        </p>
        <p>
          This distinction is structural, not merely stated in a disclaimer. The deterministic scoring
          engine never produces a tenancy outcome — it produces a band, dimensional scores, flags, and
          a confidence reading. The AI narrative engine is barred by design from using recommendation
          or approval language. No code path in the platform treats a FitScore band as a tenancy gate.
          The agent&apos;s decision autonomy is preserved by the architecture itself.
        </p>
        <p>
          When you read a FitScore Report, the band — Verified Stability, Stable Profile, and so on
          — tells you what the evidence shows at assessment time. It does not tell you whether to
          accept or decline the application. That decision belongs to the agent or landlord.
        </p>
      </section>

      {/* 03 — The four header pillars */}
      <section id="pillars">
        <p className="sec-num"><span className="bar" /><span>03 · The four header pillars</span></p>
        <h2 className="sec-h">The four <span className="hl">header pillars</span></h2>
        <p>
          The opening section of every FitScore Report shows four pillars at equal visual weight.
          Reading all four together gives the most complete picture of the assessment.
        </p>
        <ul className="legal-list">
          <li>
            <strong>Band</strong> — the composite band classification reflecting the overall evidence
            state across all dimensions and all applicants on the lease. One of seven possible states:
            Verified Stability, Stable Profile, Cautious Review, Limited Confidence, Adverse Signals,
            Limited Data Profile, or Blocked. See §05 for each band explained.
          </li>
          <li>
            <strong>Confidence</strong> — a parallel reading that answers &ldquo;how much of the
            relevant data was available and internally consistent?&rdquo; Three levels: High, Medium,
            or Low (or Insufficient, used only for Limited Data Profile). A High band with Low
            Confidence means the evidence base was thin — the agent should factor both signals. See §07.
          </li>
          <li>
            <strong>Verification Integrity</strong> — a grade (High, Medium, Low, or Limited) for
            the evidentiary consistency of the underlying checks. Distinct from Confidence: Confidence
            measures data coverage; Verification Integrity measures internal consistency — did the
            checks that ran agree with each other? See §07.
          </li>
          <li>
            <strong>Material Flags</strong> — critical signals surfaced outside the band calculation
            and shown at the top of every report, regardless of their effect on the composite score.
            Three classes: Critical (forces Blocked), Capping (may cap the band ceiling), and Trust
            (a positive network signal). See §06.
          </li>
        </ul>
        <p>
          The numeric score (0–100) appears below the band as supporting metadata. It enables
          cross-application comparison for agents handling multiple applications and is available
          for reference. The band classification is the primary reading — not the number.
        </p>
      </section>

      {/* 04 — The four dimensions */}
      <section id="dimensions">
        <p className="sec-num"><span className="bar" /><span>04 · The four dimensions</span></p>
        <h2 className="sec-h">The four <span className="hl">dimensions</span></h2>
        <p>
          The composite band is derived from four underlying dimensions. Each appears as a score card
          in the report with a numeric score and an evidence summary line. Reading the dimension cards
          shows which areas drove the composite result.
        </p>
        <ul className="legal-list">
          <li>
            <strong>Affordability</strong> — what percentage of the verified joint income does the
            proposed rent represent, and what is the total debt servicing load? Income is verified
            across multiple evidence sources (bank statements, bureau income estimates, employer
            confirmation) and compared against the proposed rent. Higher rent-to-income ratios and
            higher debt servicing loads reduce the Affordability score.
          </li>
          <li>
            <strong>Stability</strong> — how stable are the applicants&apos; employment and
            residential situations? The engine assesses employment tenure, income-weighted average
            tenure across all applicants, and verified rental reference history in the Pleks network.
            Longer, more consistent tenure and verified prior tenancies in good standing contribute
            to a higher Stability score.
          </li>
          <li>
            <strong>Credit Behaviour</strong> — what do credit bureau records show about payment
            history and existing obligations? Pleks draws on multiple South African credit bureaus
            (TransUnion, VeriCred, Sigma/Experian) where available. The engine produces a
            coverage-weighted reading across responding bureaus, adjusted for bureau divergence.
            Adverse listings, active judgments, debt review status, and other adverse bureau signals
            reduce the Credit Behaviour score. This dimension is not assessed for foreign-national
            applicants where no bureau coverage is available — see §09.
          </li>
          <li>
            <strong>Verification Integrity</strong> — how consistent and complete were the
            verification checks themselves? Five checks are run per applicant: identity verification
            against Home Affairs DHA-NPR, account verification service (AVS), employer confirmation,
            address cross-reference, and income reconciliation. The dimension score reflects both the
            count of checks passed and the degree of internal consistency — specifically whether
            declared income and bank-verified income align within the acceptable variance window.
            This dimension also drives the Verification Integrity grade shown in the header pillar
            (see §07).
          </li>
        </ul>
        <p>
          For joint applications, each dimension score is computed at the lease level across all
          applicants, income-weighted where relevant. The narrative summary in the report explains
          the key signals that drove each dimension.
        </p>
      </section>

      {/* 05 — The bands explained */}
      <section id="bands">
        <p className="sec-num"><span className="bar" /><span>05 · The bands explained</span></p>
        <h2 className="sec-h">The <span className="hl">bands</span> explained</h2>
        <p>
          Seven band states are possible. Five are composite bands derived from the dimensional
          scores; two are categorical states that override the score entirely.
        </p>

        <h3 className="pub-h3" style={{ marginTop: 28, marginBottom: 8 }}>Verified Stability</h3>
        <p>
          Verified Stability reflects strong alignment across all four dimensions at assessment time.
          Composite scores in the 85–100 range place a lease in this band under standard conditions.
          Signals that contribute include verified income with rent comfortably within the affordability
          window, established employment tenure, clean bureau records across multiple responding
          bureaus, and all verification checks passing. A Pleks Network trust flag may also appear
          for applicants with prior tenancies in good standing in the Pleks network.
        </p>
        <p>
          Verified Stability is capped at Stable Profile if the Verification Integrity grade is
          Medium — the underlying composite score may be in the Verified Stability range, but the
          evidentiary consistency is incomplete.
        </p>

        <h3 className="pub-h3" style={{ marginTop: 28, marginBottom: 8 }}>Stable Profile</h3>
        <p>
          Stable Profile reflects evidence that the lease application is supported across the main
          dimensions Pleks assesses — income affordability, applicant stability, credit behaviour,
          and verification integrity — with no critical concerns surfaced. Composite scores in the
          70–84 range place a lease in this band under standard conditions.
        </p>
        <p>
          Signals that contribute include verified income with a rent-to-income ratio in the 25–35%
          range, employment tenure of two or more years, bureau coverage from multiple responding
          bureaus aligning within reasonable variance, and a clear identity verification result.
          Stable Profile may be the maximum band achievable for a lease where the Verification
          Integrity grade is Medium, holding the band even where the underlying composite score
          is higher.
        </p>

        <h3 className="pub-h3" style={{ marginTop: 28, marginBottom: 8 }}>Cautious Review</h3>
        <p>
          Cautious Review reflects evidence in the borderline range — one or more dimensions showing
          signals that the agent should examine. Composite scores in the 55–69 range produce this
          band under standard conditions. Common contributing signals include rent above 35% of
          verified joint income, an income discrepancy flag, limited bureau coverage, or a recent
          ID reissue. Material Flags in the report will specify which signals triggered the
          Cautious Review classification.
        </p>

        <h3 className="pub-h3" style={{ marginTop: 28, marginBottom: 8 }}>Limited Confidence</h3>
        <p>
          Limited Confidence reflects significant gaps or concerns in one or more dimensions at
          assessment time. Composite scores in the 40–54 range place a lease in this band under
          standard conditions. The Confidence grade in the header is typically Low for this band.
          Common contributing signals include an active court judgment recorded within the last
          24 months, limited bureau response, or rent materially above the affordability window.
        </p>

        <h3 className="pub-h3" style={{ marginTop: 28, marginBottom: 8 }}>Adverse Signals</h3>
        <p>
          Adverse Signals reflects multiple material concerns across dimensions at assessment time.
          Composite scores below 40 place a lease in this band. Common contributing signals include
          active debt review, multiple adverse bureau listings, significant income concerns, or
          several Capping flags present simultaneously. Adverse Signals is not a categorical block
          — the agent reviews the underlying evidence and makes their decision.
        </p>

        <h3 className="pub-h3" style={{ marginTop: 28, marginBottom: 8 }}>Limited Data Profile</h3>
        <p>
          Limited Data Profile is a categorical state, not a scored band. The engine uses this
          classification when insufficient data was available to produce a reliable composite score
          — specifically, when fewer than two of the four core signal sources met the data-coverage
          threshold required for scoring. See §08 for a full explanation.
        </p>

        <h3 className="pub-h3" style={{ marginTop: 28, marginBottom: 8 }}>Blocked</h3>
        <p>
          Blocked is a categorical state triggered by one of four Critical Hard Flags. The composite
          score is not computed when a Critical flag is present — the band is set to Blocked
          regardless of what the dimensional scores would show. The four Critical Hard Flags that
          force Blocked are: SAFPS fraud-listing match, Home Affairs returned deceased status,
          confirmed fraudulent documents, and material bank-statement manipulation. See §06.
        </p>
      </section>

      {/* 06 — Material Flags */}
      <section id="flags">
        <p className="sec-num"><span className="bar" /><span>06 · Material Flags</span></p>
        <h2 className="sec-h">Material <span className="hl">Flags</span></h2>
        <p>
          Material Flags are signals that the engine surfaces separately from the composite band,
          in the header of every report. They are shown regardless of whether they affected the
          band result. Three flag classes exist:
        </p>
        <ul className="legal-list">
          <li>
            <strong>Critical</strong> — the flag overrides the composite calculation entirely and
            places the lease in Blocked state. Four Critical flags exist (see glossary below).
            A Critical flag indicates a foundational verification failure that the agent must
            investigate before the application can proceed.
          </li>
          <li>
            <strong>Capping</strong> — the flag is surfaced for the agent&apos;s attention and may
            cap the composite band at a specified ceiling, depending on the flag type and — for
            income-related caps — whether the flagged applicant contributes more than 40% of the
            joint income. The flag does not hide the underlying dimensional scores; the agent can
            see the full picture and decide accordingly.
          </li>
          <li>
            <strong>Trust</strong> — a positive signal from the Pleks network indicating that one
            or more applicants have prior tenancies in good standing in the Pleks-connected agency
            network. Trust flags are surfaced for the agent&apos;s awareness; they do not affect
            the composite band calculation.
          </li>
        </ul>
        <p>
          Where a flag applies to a specific applicant on a joint lease (rather than to the lease
          as a whole), the applicant label (A, B, C…) is shown alongside the flag description.
        </p>

        <h3 className="pub-h3" style={{ marginTop: 28, marginBottom: 12 }}>Flag glossary</h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="pub-gap-table" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ width: '22%' }}>Flag name</th>
                <th style={{ width: '10%' }}>Class</th>
                <th style={{ width: '36%' }}>What it means</th>
                <th style={{ width: '32%' }}>When it appears</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="row-label">Fraud-listing match</td>
                <td>Critical</td>
                <td>A Southern African Fraud Prevention Service (SAFPS) match was returned for this applicant&apos;s identity number.</td>
                <td>When SAFPS returns a positive match — results in the lease being Blocked.</td>
              </tr>
              <tr>
                <td className="row-label">Deceased status returned</td>
                <td>Critical</td>
                <td>Home Affairs DHA-NPR returned a deceased status for this applicant&apos;s identity number.</td>
                <td>Forces the lease to Blocked. Usually indicates identity misuse — the agent should escalate to the applicant and where appropriate to the relevant authorities.</td>
              </tr>
              <tr>
                <td className="row-label">Confirmed fraudulent documents</td>
                <td>Critical</td>
                <td>Document consistency checks identified deliberate manipulation in submitted documents.</td>
                <td>Forces the lease to Blocked. The agent will discuss the finding with the applicant and request alternative evidence where appropriate.</td>
              </tr>
              <tr>
                <td className="row-label">Material bank-statement manipulation</td>
                <td>Critical</td>
                <td>Bank statement analysis identified signs of overlaid text or inconsistent transaction flow.</td>
                <td>Forces the lease to Blocked. The agent will request alternative income evidence.</td>
              </tr>
              <tr>
                <td className="row-label">Debt review active</td>
                <td>Capping</td>
                <td>The credit bureau response indicates the applicant is currently under debt review or has an active administration order.</td>
                <td>Surfaced for the agent&apos;s attention. Caps the lease band at Cautious Review where the flagged applicant contributes more than 40% of the joint verified income.</td>
              </tr>
              <tr>
                <td className="row-label">Active judgment</td>
                <td>Capping</td>
                <td>A court judgment is currently recorded against the applicant in the credit bureau response.</td>
                <td>Surfaced for the agent&apos;s attention. Caps the band at Limited Confidence when the judgment is recorded within the last 24 months.</td>
              </tr>
              <tr>
                <td className="row-label">Recent ID reissue</td>
                <td>Capping</td>
                <td>The applicant&apos;s identity document was reissued within the last 12 months, as recorded by Home Affairs DHA-NPR.</td>
                <td>Surfaced as an evidentiary signal. Caps the band at Stable Profile because recent reissue events are associated with elevated identity risk.</td>
              </tr>
              <tr>
                <td className="row-label">Recent SIM swap</td>
                <td>Capping</td>
                <td>A SIM swap on the applicant&apos;s recorded phone number occurred within the last 30 days.</td>
                <td>Surfaced as an evidentiary signal. Caps the band at Stable Profile as a precautionary measure.</td>
              </tr>
              <tr>
                <td className="row-label">Material income discrepancy</td>
                <td>Capping</td>
                <td>The variance between two income evidence sources exceeded 40% — for example, declared income and bank-statement-verified income diverged materially.</td>
                <td>Caps the band at Cautious Review. The agent may request a salary reconciliation or alternative income evidence.</td>
              </tr>
              <tr>
                <td className="row-label">Adverse Pleks-network history</td>
                <td>Capping</td>
                <td>Pleks&apos;s internal rental history records show a prior tenancy with material concerns — eviction, abandonment, material non-payment, or severe recorded damages.</td>
                <td>Caps the band at a ceiling that depends on the applicant&apos;s income contribution to the joint lease.</td>
              </tr>
              <tr>
                <td className="row-label">Missing critical document</td>
                <td>Capping</td>
                <td>A required document for the lease application is missing or was rejected by the document consistency check.</td>
                <td>Caps the band at Stable Profile. The agent will request the missing document before the application can progress.</td>
              </tr>
              <tr>
                <td className="row-label">Work permit expires within lease term</td>
                <td>Capping</td>
                <td>The applicant&apos;s work permit has an expiry date that falls within the proposed lease term.</td>
                <td>Surfaced for the agent&apos;s attention. Caps the band at Stable Profile. The agent may request evidence of permit renewal or extension.</td>
              </tr>
              <tr>
                <td className="row-label">Bureau coverage partial</td>
                <td>Capping</td>
                <td>Fewer than three of the three contacted credit bureaus responded to the enquiry.</td>
                <td>Surfaced to indicate that the Credit Behaviour score is based on partial bureau coverage. Caps the band at Stable Profile if only one bureau responded.</td>
              </tr>
              <tr>
                <td className="row-label">Narrative engine did not complete</td>
                <td>Capping</td>
                <td>The AI narrative generation process encountered an error and a template summary was used in place of a generated narrative.</td>
                <td>Surfaced to indicate that the narrative columns in the report are templated, not AI-generated. Does not affect the composite band or dimensional scores.</td>
              </tr>
              <tr>
                <td className="row-label">Trusted by Pleks Network</td>
                <td>Trust</td>
                <td>Pleks&apos;s internal rental history records show one or more prior tenancies in good standing for this applicant in the Pleks-connected agency network.</td>
                <td>Surfaced as a positive observation alongside the report. Does not affect the composite band calculation.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 07 — Confidence vs Verification Integrity */}
      <section id="confidence">
        <p className="sec-num"><span className="bar" /><span>07 · Confidence vs Verification Integrity</span></p>
        <h2 className="sec-h">Confidence vs <span className="hl">Verification Integrity</span></h2>
        <p>
          These two header pillars are related but answer different questions:
        </p>
        <ul className="legal-list">
          <li>
            <strong>Confidence</strong> answers: &ldquo;how much of the relevant data was
            available?&rdquo; It reflects coverage — did all the bureaus respond? Was a bank
            statement supplied? Was income verifiable across multiple sources? High Confidence
            means the engine had a full data set to work with. Low Confidence means significant
            gaps existed at assessment time.
          </li>
          <li>
            <strong>Verification Integrity</strong> answers: &ldquo;how internally consistent were
            the checks that did run?&rdquo; It reflects quality — did identity match, did the
            income reconciliation pass within acceptable variance, did the bank statement align
            with the employer confirmation? High Verification Integrity means the checks agree.
            Low Verification Integrity means material inconsistencies were found in what was
            available.
          </li>
        </ul>
        <p>
          A lease can have High Confidence but Medium Verification Integrity — all data sources
          responded, but the income reconciliation showed variance. Equally, a lease can have
          Low Confidence but High Verification Integrity — limited data was available, but
          everything that was available was internally consistent.
        </p>
        <p>
          The agent should read both pillars. Confidence tells you how much weight to place on
          the assessment; Verification Integrity tells you how consistent the underlying evidence
          was. Neither is a positive or negative signal on its own — together they describe the
          reliability envelope of the assessment.
        </p>
        <p>
          Verification Integrity also acts as a band cap: a Verification Integrity grade of Medium
          caps the composite band at Stable Profile, even if the dimensional scores would produce
          a Verified Stability result. This cap is shown in the Material Flags section of the
          report.
        </p>
      </section>

      {/* 08 — Limited Data Profile */}
      <section id="ldp">
        <p className="sec-num"><span className="bar" /><span>08 · Limited Data Profile</span></p>
        <h2 className="sec-h">Limited <span className="hl">Data Profile</span></h2>
        <p>
          When the engine determines that insufficient data is available to produce a reliable
          composite score, the lease is classified as a Limited Data Profile. This is a categorical
          state — no composite score, no dimensional band — not a negative classification.
        </p>
        <p>
          A Limited Data Profile is triggered when fewer than two of the four core signal sources
          (Affordability, Stability, Credit Behaviour, Verification Integrity) meet the
          data-coverage threshold required for scoring. Possible causes include:
        </p>
        <ul className="legal-list">
          <li>No credit bureau responded to the enquiry</li>
          <li>No income evidence was supplied or verifiable</li>
          <li>Insufficient bank statement data (fewer than the minimum number of months required)</li>
          <li>A foreign-national applicant with no South African bureau coverage, where other signal sources also have gaps</li>
          <li>A combination of the above across multiple applicants on a joint application</li>
        </ul>
        <p>
          The report still shows whatever evidence was available. The Confidence grade for a
          Limited Data Profile is Insufficient. The agent reviews the available evidence and
          makes their decision. Requesting additional documentation from the applicant —
          extended bank statements, additional income evidence, a rental reference — may resolve
          the data gaps if the agent wishes to proceed.
        </p>
      </section>

      {/* 09 — Foreign-national applicants */}
      <section id="foreign">
        <p className="sec-num"><span className="bar" /><span>09 · Foreign-national applicants</span></p>
        <h2 className="sec-h">Foreign-national <span className="hl">applicants</span></h2>
        <p>
          South African credit bureaus hold limited or no records for foreign nationals who do
          not have a South African identity number. The FitScore engine adapts its methodology
          for foreign-national applicants to reflect what can and cannot be assessed:
        </p>
        <ul className="legal-list">
          <li>
            <strong>Credit Behaviour</strong> is excluded from the composite calculation for
            foreign-national applicants where no bureau coverage is available. The remaining
            three dimensions are weighted accordingly to produce a composite score from the
            available evidence.
          </li>
          <li>
            <strong>Work permit tenure</strong> is included in the Stability dimension where
            relevant — the remaining time on the work permit contributes to the stability
            assessment alongside employment tenure.
          </li>
          <li>
            <strong>Work permit expiry within the proposed lease term</strong> triggers a
            Capping flag (see §06). The agent can factor the permit renewal timeline into their
            decision.
          </li>
          <li>
            <strong>Identity verification</strong> is still run via Home Affairs DHA-NPR for
            South African passport holders and for foreign nationals presenting a South African
            document. For other document types, the verification check is adapted accordingly.
          </li>
        </ul>
        <p>
          On a joint application with a mix of SA-citizen and foreign-national applicants, the
          engine applies per-applicant dimension handling and then combines results at the lease
          level. The narrative summary in the report identifies which applicants have limited
          bureau coverage and explains the methodology adaptation.
        </p>
        <p>
          The Limited Visibility column in the narrative section of the report will note where
          bureau coverage was absent for a specific applicant. This is not a negative finding
          about that applicant — it is an accurate statement of data availability.
        </p>
      </section>

      {/* 10 — Pleks doesn't decide */}
      <section id="no-decision">
        <p className="sec-num"><span className="bar" /><span>10 · Pleks doesn&apos;t decide</span></p>
        <h2 className="sec-h">Pleks doesn&apos;t <span className="hl">decide</span></h2>
        <p>
          The FitScore Report is decision-support for the agent or landlord. It organises the
          verification evidence into a consistent, readable format. It does not make a tenancy
          recommendation. No Pleks system takes a tenancy action based on a FitScore result.
        </p>
        <p>
          POPIA s71 protects data subjects from decisions which result in legal consequences
          or substantial profile effects, based solely on automated processing. Pleks&apos;s
          architecture is designed so that this protection applies fully:
        </p>
        <ul className="legal-list">
          <li>
            The scoring engine produces a band, dimensional scores, flags, and a confidence
            reading. It does not produce a tenancy outcome.
          </li>
          <li>
            The AI narrative engine is constrained by design from using recommendation,
            approval, or predictive language.
          </li>
          <li>
            No code path in the platform takes a FitScore band as input and produces a
            lease approval or rejection. The agent&apos;s decision is recorded as a human
            action.
          </li>
          <li>
            There is no &ldquo;Pleks override&rdquo; — because there is no Pleks recommendation
            to override. The agent can proceed with any application at any band, and the
            platform does not prevent or log this as anomalous.
          </li>
          <li>
            Every historical score is replayable from the stored component snapshot against the
            versioned engine code. A challenged assessment has a deterministic, auditable answer.
          </li>
        </ul>
        <p>
          The agent&apos;s tenancy decision is the human action that POPIA s71 requires.
          The FitScore is the reference data the agent consults in reaching that decision.
          That separation is not a legal disclaimer — it is how the system is built.
        </p>
      </section>

      {/* 11 — What if I disagree? */}
      <section id="disagree">
        <p className="sec-num"><span className="bar" /><span>11 · What if I disagree with my band?</span></p>
        <h2 className="sec-h">What if I <span className="hl">disagree?</span></h2>
        <p>
          If you are an applicant and believe the FitScore Report does not accurately reflect
          your situation, the following paths are available:
        </p>
        <ul className="legal-list">
          <li>
            <strong>Talk to the agent or landlord.</strong> They have access to the full report
            and can review the dimensional evidence and material flags with you. Many concerns
            can be addressed by supplying additional documentation — extended bank statements,
            a reconciliation letter, or a verified rental reference.
          </li>
          <li>
            <strong>Request your L2 access record.</strong> Under POPIA s23, you have the right
            to request the Pleks-derived data held about you: your band classification, dominant
            material flags, identity verification result, application status, and a cross-reference
            to when your bureau data was delivered as Stream 1. Contact the agent, who can
            initiate this request with the Pleks Information Officer. The response will be
            delivered to you as a structured letter within the statutory 30-day window.
          </li>
          <li>
            <strong>Dispute the underlying bureau data.</strong> The FitScore band is derived
            from the evidence available at assessment time. If that evidence contained an error
            — for example, a bureau record that is incorrect — the appropriate first step is
            to dispute the underlying record directly with the relevant credit bureau
            (TransUnion, VeriCred, or Experian Sigma). Each bureau has a formal dispute process.
            Once a bureau record is corrected, a fresh assessment can be requested.
          </li>
          <li>
            <strong>Lodge with the Information Regulator.</strong> If you believe your rights
            under POPIA have been infringed, you can lodge a complaint with the Information
            Regulator of South Africa. The Information Regulator&apos;s contact details are
            available at <code>inforegulator.org.za</code>.
          </li>
          <li>
            <strong>Raise a dispute at the Rental Housing Tribunal.</strong> The Rental Housing
            Tribunal (RHT) handles disputes between tenants and landlords under the Rental Housing
            Act 50 of 1999. If you believe a tenancy decision was made on unfair grounds, the RHT
            is the appropriate forum. Note that the FitScore is produced for the agent, not as a
            final tenancy decision — the agent&apos;s decision-making process is within the RHT&apos;s
            scope; the FitScore report itself is one piece of evidence in that process.
          </li>
        </ul>
      </section>

      {/* 12 — Versioning and historical reports */}
      <section id="versioning">
        <p className="sec-num"><span className="bar" /><span>12 · Versioning and historical reports</span></p>
        <h2 className="sec-h">Versioning and <span className="hl">historical reports</span></h2>
        <p>
          The interpretation document version is recorded in every FitScore Report and stored
          against the application record. The footer of each PDF shows the interpretation version
          (for example, <code>Interpretation: interpretation.v1.0</code>) and a link to the
          version-specific URL for that document.
        </p>
        <p>
          If you received a FitScore Report and want to read the interpretation document that
          applied at the time of that assessment, use the URL in the report footer — not the
          unversioned URL (<code>/help/fitscore-report</code>), which always serves the current
          version. Version-specific URLs are permanent and will not change.
        </p>
        <p>
          Versioning rules:
        </p>
        <ul className="legal-list">
          <li>
            <strong>Minor bumps</strong> (v1.0 → v1.1) cover wording refinements, expanded
            examples, clarifications, and new flag glossary entries. Band criteria and the
            underlying doctrine do not change on a minor bump.
          </li>
          <li>
            <strong>Major bumps</strong> (v1.x → v2.0) are reserved for genuine methodology
            changes: band threshold shifts, new dimensions, structural changes to the four-pillar
            header, or doctrine updates. A major bump means a report generated under the prior
            version may read differently under the new criteria.
          </li>
        </ul>
        <p>
          Every version carries a changelog (below) that records what changed from the previous
          version. The changelog is part of the POPIA s71 methodology-transparency mechanism —
          it shows that band criteria have not changed silently over time.
        </p>
      </section>

      {/* Changelog */}
      <section id="changelog" style={{ marginTop: 48, paddingTop: 32, borderTop: '1px dashed var(--rule)' }}>
        <h2 style={{ fontSize: 14, fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: 16 }}>
          Changelog
        </h2>

        <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12.5, color: 'var(--muted-foreground)', lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 4px' }}><strong style={{ color: 'var(--foreground)' }}>interpretation.v1.0</strong> — 2026-05-22</p>
          <ul style={{ margin: '0 0 0 16px', padding: 0, listStyle: 'disc' }}>
            <li>Initial publication alongside FitScore composite v1.0</li>
            <li>Engine versions covered: fitscore.v1.0</li>
            <li>Prompt versions covered: narr.v1.0</li>
          </ul>
        </div>
      </section>
    </>
  )
}
