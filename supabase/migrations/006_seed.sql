-- 030_prime_rate_history.sql — Seed historical SA prime rates (SARB MPC decisions)

-- Remove the placeholder seed first
DELETE FROM prime_rates WHERE notes = 'Seed rate — update with actual effective date';

-- Insert full history (newest first for readability, order doesn't matter for queries)
INSERT INTO prime_rates (rate_percent, effective_date, notes) VALUES
  (10.25, '2025-11-21', 'MPC Nov 2025'),
  (10.50, '2025-08-01', 'MPC Aug 2025'),
  (10.75, '2025-05-30', 'MPC May 2025'),
  (11.00, '2025-01-31', 'MPC Jan 2025'),
  (11.25, '2024-11-22', 'MPC Nov 2024'),
  (11.50, '2024-09-20', 'MPC Sep 2024'),
  (11.75, '2023-05-26', 'MPC May 2023'),
  (11.25, '2023-03-31', 'MPC Mar 2023'),
  (10.75, '2023-01-27', 'MPC Jan 2023'),
  (10.50, '2022-11-25', 'MPC Nov 2022'),
  (9.75,  '2022-09-23', 'MPC Sep 2022'),
  (9.00,  '2022-07-22', 'MPC Jul 2022'),
  (8.25,  '2022-05-20', 'MPC May 2022'),
  (7.75,  '2022-03-25', 'MPC Mar 2022'),
  (7.50,  '2022-01-28', 'MPC Jan 2022'),
  (7.25,  '2021-11-19', 'MPC Nov 2021'),
  (7.00,  '2020-07-24', 'MPC Jul 2020'),
  (7.25,  '2020-05-22', 'MPC May 2020'),
  (7.75,  '2020-04-15', 'MPC Apr 2020 (emergency)'),
  (8.75,  '2020-03-20', 'MPC Mar 2020 (COVID emergency)'),
  (9.75,  '2020-01-17', 'MPC Jan 2020'),
  (10.00, '2019-07-19', 'MPC Jul 2019'),
  (10.25, '2018-11-23', 'MPC Nov 2018'),
  (10.00, '2018-03-29', 'MPC Mar 2018'),
  (10.25, '2017-07-21', 'MPC Jul 2017')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- LEASE CLAUSE LIBRARY SEED
-- ═══════════════════════════════════════════════════════════════

-- 032_lease_clauses_seed.sql
-- Pleks standard lease clause library — sourced from SA residential lease template
-- Anonymised: all entity-specific names replaced with {{var:}} tokens
-- Cross-references replaced with {{ref:}} and {{self:N}} tokens per cross-reference map
-- 
-- Token reference:
--   {{var:field}}    — replaced with lease variable at generation time
--   {{ref:key}}      — replaced with actual clause number at generation time
--                      renders as "[not included in this agreement]" if clause disabled
--   {{self:N}}       — replaced with "[this clause number].N" at generation time

-- ─── Required clauses (25) ──────────────────────────────────────────────────

INSERT INTO lease_clause_library
  (clause_key, title, body_template, lease_type,
   is_required, is_enabled_by_default, sort_order,
   depends_on, description, toggle_label)
VALUES

('interpretation', 'Interpretation',
$$In this agreement and its annexes –
clause headings shall not be used in its interpretation;
unless the context clearly indicates a contrary intention, an expression which denotes –
any gender includes the other gender;
a natural person includes an artificial person and vice versa;
the singular includes the plural and vice versa;
the following expressions shall bear the following meanings and related expressions bear corresponding meanings –
"agreement" - this agreement and its annexes, as amended from time to time;
"building" - the building as described on page 1 of this agreement;
"commencement date" - referencing 'commencement date' as described on page 1 of this agreement. This constitutes the date on which the lease agreement commences;
"common property" - the public parking areas, entrances, exits, driveways, landscape areas, and all other amenities provided in the property and/or the building for the common general use of occupiers of the property;
"initial period" - the period commencing on the commencement date and terminating on the date as indicated in the lease period on page 1 of this agreement, as well as Annexure A attached hereto;
"leased premises" - as described on page 1 of this agreement;
"lessee" - as described on page 1 of this agreement;
"lessor" - as described on page 1 of this agreement;
"parties" - collectively the lessor and the lessee and any reference to "party" shall be deemed to be reference to either one of them as the context may require;
"prime rate" - the rate publicly quoted by the Lessor's banking institution from time to time as being its prime overdraft rate (expressed as a nominal annual compounded monthly in arrear rate), calculated on a 365 day a year factor, irrespective as to whether or not the year is a leap year and prima facie proven, in the event of there being a dispute in relation thereto, by certificate by any manager of such bank (whose appointment, qualification or authority need not be proven). The Lessor's banking institution is recorded in Annexure B;
"property" – The erf upon which the building is situated;
"RSA" - Republic of South Africa;
"signature date" - the date upon which this agreement is signed by the last signing party hereto;
"SME" - small and micro enterprise;
"SMME" - small, medium and micro enterprise;
"termination date" - the date on which this agreement is terminated for any reason whatever;
"VAT" - Value added tax as defined in the VAT Act;
"VAT Act" - the Value Added Tax Act, Act 89 of 1991;
where any term is defined within the context of any particular clause, the term so defined, unless it is clear from the clause in question that the term so defined has limited application to the relevant clause, shall bear the meaning ascribed to it for all purposes in terms of this Agreement, notwithstanding that the term has not been defined in this interpretation clause;
any reference to any law, proclamation, ordinance, Act, regulation or other enactment having the force of law ("law") is to such law as at the signature date and as amended, re-enacted or substituted from time to time thereafter;
should any provision contained in a definition be a substantive provision conferring any right or imposing any obligation on any party, then notwithstanding that it is only in the interpretation clause effect shall be given to it as if it were a substantive provision in this agreement;
when any number of days is prescribed such number shall exclude the first and include the last day unless the last day falls on a day which is not a business day, in which case the last day shall be the next succeeding business day;
the use of a specific example (whether or not after the word "including" or "such as") shall not be construed as limiting the meaning of the general wording preceding it and the ejusdem generis rule shall not be applied in the interpretation of such general wording or such specific example/s. Accordingly, without limiting the generality of the foregoing, wherever the words "includes" or "including" are used in this agreement, the words "without limitation" shall be deemed to follow them;
the rule of construction that the contract shall be interpreted against the party responsible for the drafting or preparation of the agreement shall not apply;
all annexes, if any, hereto are deemed to be incorporated herein and shall have the same force and effect as if they were contained in the body of this agreement;
words and/or expressions defined in this agreement shall bear the same meanings when used in any annexes, if any, hereto;
a reference to any statutory body or court shall be construed as a reference to that statutory body or court as at the signature date and as substituted from time to time thereafter by successor statutory bodies or courts, as the case may be;
a reference to any legal principle, doctrine or process under South African law shall include a reference to the equivalent or analogous principle, doctrine or process in any other jurisdiction in which the provisions of this agreement may apply or to the laws of which a party may be or become subject;
the expiration or termination of this agreement shall not affect such of its provisions as expressly provide that they will continue to apply after such expiration or termination or which of necessity must continue to apply after such expiration or termination;
a reference to –
"business day" shall be construed as being any day other than a Saturday, Sunday or public holiday in the RSA;
"business hours" shall be construed as being the hours between 08h30 and 17h00 on any business day;
day/s, month/s or year/s shall be construed as Gregorian calendar day/s, month/s or year/s;
any written agreement shall be a reference to that agreement as amended, substituted or replaced from time to time in accordance with its terms;
any communication which is required to be "in writing" in terms of this agreement shall mean legible writing in English and includes, save for the non-variation clause contemplated in {{ref:general}}.3, a communication which is written or produced by any substitute for writing or which is partly written or partly so produced, and shall include printing, typewriting, lithography, facsimile and electronic mail and any form of electronic communication contemplated in the Electronic Communications and Transactions Act, Act 25 of 2002.$$,
'both', true, true, 100, '{}', NULL, NULL),

('lease', 'Lease',
$$The lessor hereby lets to the lessee, which hereby hires the leased premises on the terms and conditions set out in this agreement.$$,
'both', true, true, 300, '{}', NULL, NULL),

('duration', 'Duration',
$$This agreement shall commence on the commencement date and shall endure for the initial period, subject to such other rights as are vested in the parties in terms of this agreement or in terms of law.$$,
'both', true, true, 400, '{}', NULL, NULL),

('rental_deposit', 'Rental and deposit',
$$The basic monthly rental payable by the lessee to the lessor in respect of the hire of the leased premises, during the initial period, is set out in Annexure A: Rental Calculation per month for the initial period.
As security for his/its obligations in terms of this agreement the lessee shall deposit with the lessor on the signature date an amount stipulated in Annexure A: Rental Calculation payable by the lessee to the lessor which shall be retained by the lessor whilst this agreement remains in existence. The interest earned thereon shall be for the benefit of the lessee. Such deposit may at any time be applied by the lessor towards payment of any amount whatsoever due by the lessee, pursuant to this agreement or otherwise, including any replacements, repairs or maintenance for which the lessee is liable as well as any damage to the leased premises caused by the lessee during its occupation, and in such event the lessee shall upon demand restore the deposit to the original sum. The lessee shall not, under any circumstances, be entitled to set off against the deposit any amount payable by it to the lessor. The deposit or the balance thereof plus interest thereon shall be refunded in full to the lessee within the period prescribed by the Rental Housing Act after the termination date, provided that the lessee has complied with all his/its obligations as set out in this agreement including the restoring of the leased premises to the condition it was in at the commencement date (taking into consideration any repairs and/or improvements effected by the lessor to the leased premises during the course of this agreement), fair wear and tear excluded.$$,
'both', true, true, 500, '{}', NULL, NULL),

('payment', 'Payment',
$$The lessee shall pay to the lessor in advance on or before the first day, or other day agreed in writing, of each month commencing on the commencement date, the basic monthly rental referred to in {{ref:rental_deposit}} and all other amounts and charges as stipulated in this agreement, in South African currency, free of any deduction or set-off whatsoever and free of bank charges and/or commission.
The lessee shall, unless otherwise agreed, authorise the lessor, or its agent, to issue and deliver payment instructions to the lessee's bank, for collection against the lessee's account, of either a fixed amount relating to the monthly rental, adjusted for increases, or a variable amount equal to the debit balance outstanding in respect of the leased premises.
The lessor has the right to request the lessee to, further to {{self:1}}, sign a debit order form, in the form prescribed by the lessor or its agent from time to time, giving effect to the abovementioned debit order authority, and shall be bound by the terms and conditions thereof.
Where it is agreed that payments shall not be made by debit order or prior to the approval of a debit order, all amounts payable to the lessor in terms of this agreement shall be paid by means of electronic transfer of funds into the lessor's banking account as stipulated in Annexure A: Rental Calculation or such other banking account as the lessor may from time to time, in writing, direct.
The lessor shall have the right in its sole and absolute discretion when receiving payment of any monies from the lessee and notwithstanding any direction given by the lessee as to which indebtedness of the lessee to the lessor such payment is to be appropriated, to appropriate such payment received to any indebtedness whatsoever of the lessee to the lessor owing for the time being.
Without prejudice to and in addition to any other rights and remedies of the lessor under this agreement, any amount falling due for payment by the lessee under this agreement which is not paid on its due date for payment, including any amount which may be payable by the lessee as damages, shall bear interest at the prime rate plus {{var:arrears_interest_margin}}% ({{var:arrears_interest_margin_words}} percent) per annum, calculated from the due date for payment thereof or, in the case of any amount payable by way of damages, with effect on and as from the date upon which those damages are sustained, until the date of payment, both dates inclusive. If interest or damages have been incurred, any payments done by the lessee will first be allocated to these.
All amounts payable by the lessee to the lessor in terms of this agreement are expressed to be exclusive of VAT on the basis that the lessee shall pay the lessor VAT thereon at the applicable rate as determined in accordance with the provisions of the VAT Act from time to time.$$,
'both', true, true, 600, '{}', NULL, NULL),

('purpose', 'Purpose for which premises are let',
$$The leased premises are let to the lessee for the purposes of {{var:lease_type_description}} use. The lessee shall not use the leased premises for any other purpose whatsoever without the prior written consent of the lessor, which consent shall not be unreasonably withheld.$$,
'both', true, true, 1000, '{}', NULL, NULL),

('maintenance', 'Maintenance',
$$The lessee shall –
at his/its own cost keep and maintain in a clean, good order and condition the leased premises and replace or repair same, as the case may be, which, without derogating from the generality hereof, shall include all fixtures and fittings, electrical installations, plumbing and sanitary works, appliances, firefighting equipment, doors, roller shutter doors, door handles, locks, keys, entrances, glass and windows in or serving the leased premises and on the termination date deliver the leased premises to the lessor in the same good order and condition as existed at the commencement date (taking into consideration any repairs and/or improvements effected by the lessor to the leased premises during the course of this agreement) fair wear and tear excepted. The lessee shall effect proper and adequate insurance for such amount of cover indemnifying the lessor against damage of every nature caused and howsoever caused, to the items referred to in this clause. Replacement of damaged glass shall comply with the safety regulations as specified by the relevant authority from time to time;
prevent any blockage of sewerage or water pipes or septic tanks or drains in or used in connection with the leased premises and shall remove at his/its cost any obstruction or blockage in any sewer or water pipe or septic tanks or drains serving the leased premises and, where necessary, repair the sewer pipe or drain concerned;
pay for and replace where necessary all fluorescent bulbs, starters, ballasts and incandescent bulbs used in the leased premises and shall be responsible at his/its own cost to maintain all lights in the leased premises in proper order and clean condition;
ensure that the exterior of the leased premises to the full height thereof, including the glass and the interior of the leased premises;
not install any floor covering, interior or exterior lighting, plumbing, fixtures or shelves or make any change to the perimeter of the leased premises or any other part of the leased premises without the lessor's prior written consent;
not erect or install aerials on the roof or exterior walls of the building or any other part of the property without in each instance the lessor's prior written consent. Any aerial so erected or installed without such written consent may be removed by the lessor at the lessee's cost at any time without notice to the lessee;
ensure that no radios, hi-fi's, tape recorders, compact disc players, televisions or other devices shall be used in a manner so as to be heard outside of the leased premises;
ensure that the leased premises are kept pest free at all times (which includes cockroaches, black ants, rodents and any and all other infestation) at the lessee's cost. The lessor may from time to time call for a certificate from a registered pest control operator certifying that the leased premises are pest and infestation free;
be responsible for and shall pay all costs in respect of cleaning the exterior of the windows in the leased premises.
Should the lessee fail or refuse to maintain or repair the leased premises or part thereof as provided for in terms of this agreement and remain in default for a period of seven days after dispatch by the lessor of a written notice calling on the lessee to rectify such default, then the lessor shall be entitled, without prejudice to its other rights in law or in terms of this agreement, to effect the necessary maintenance or repairs and to claim the costs so incurred from the lessee.$$,
'both', true, true, 1200, '{}', NULL, NULL),

('contravention_laws', 'Contravention of laws',
$$The lessee shall not contravene or permit the contravention of any law, by-law or statutory regulation or the conditions of any licence relating to or affecting the occupation of the leased premises or the carrying on of the lessee's permitted business therein, which may expose the lessor to any claim, action or prosecution.
The lessee shall not contravene any of the conditions of title as set out in the title deed under which the lessor holds title, nor any laws which the lessor is required to observe, by reason of its ownership of the property.
Should the lessee contravene any law and the lessor be penalised in any way as a result thereof, the lessor shall be entitled to recover any loss or damage either incurred or to be incurred in the future, from the lessee.
The lessee hereby warrants to and for the benefit of the lessor that it complies with all applicable money laundering legislation and that it will comply in all respects with all laws and orders to which it may be subject in this regard.
The lessee shall not contravene or allow the contravention of the Tobacco Products Control Act, Act 83 of 1993 (including regulations thereunder) ("the Tobacco Act") by members of his/its staff or any person on the leased premises. The lessee further indemnifies and holds the lessor harmless against any penalty imposed by any local, provincial, national or other authority as a result of the lessee's failure to comply with the provisions of the Tobacco Act.
The lessee confirms that with effect from the commencement date it will have acquired full control in respect of the use of the leased premises for purposes of the Occupational Health and Safety Act, Act 85 of 1993, as amended ("the Occupational Health and Safety Act"), and any of the regulations issued thereunder. The lessee shall be obliged at all times during the agreement to comply with the provisions of the Occupational Health and Safety Act at his/its cost and in this regard, undertakes forthwith on demand from the lessor, to do all things necessary to ensure compliance with the provisions of the aforesaid Act. The lessee hereby indemnifies the lessor or any duly appointed agent of the lessor against any claims arising from the lessee's non-compliance with the provisions of the Occupational Health and Safety Act.$$,
'both', true, true, 1400, '{}', NULL, NULL),

('alterations', 'Alterations, additions, fixtures and fittings',
$$The lessor shall not be under any obligation or liability to make any applications in respect of, do any work or make any alterations or repairs to the leased premises in order to comply with the requirements of any local authority or other applicable laws and regulations. The lessor shall not however, unreasonably withhold its consent to the lessee to, at its own expense, carry out such alterations, additions or renovations provided that the lessor's prior written consent is obtained and if the lessor so requires, the work must be carried out by a contractor approved by the lessor and under the supervision of an architect approved by the lessor, with all costs for the lessee's account;
The lessee shall not effect or cause to allow to be effected to the leased premises and/or to the building any alterations or additions, whether external, internal, structural, non-structural or of any other nature whatsoever, without the prior written consent of the lessor;
Should the lessee request the lessor, in writing, that the lessee wants to carry out any alterations and/or additions and/or improvements then it shall be in the sole and absolute discretion of the lessor whether or not to agree to such request and should the lessor so agree, the work shall be effected within a reasonable period from the date of receipt by the lessor of such written request, provided that –
the plans and specifications for the work shall be prepared by the lessor's architect or an architect approved by the lessor in writing and submitted to the lessor for approval;
the work shall be carried out by such contractor(s) as may be nominated or agreed to by the lessor under the supervision of the lessor's architect and/or other professional consultant(s);
the professional fees and charges of the lessor's architect, quantity surveyor, consulting engineer and/or other professional consultant(s) shall be borne by the lessee;
should the lessor so require, the lessee shall pay to the lessor prior to the commencement of the alterations and/or additions and/or improvements (as the case may be) an amount equivalent to the estimated cost of such alterations, additions and improvements, as determined by the lessor in consultation with the lessor's architect, quantity surveyor, consulting engineer and/or other professional consultant(s) subject to adjustment between the parties after completion of the alterations or additions; and
if the lessee is not required to pay the estimated cost of the alterations or additions to the lessor in advance, then the lessee shall within seven days after the issue of a certificate by the lessor's architect or quantity surveyor, pay to the lessor an amount equal to the amount certified in the relevant certificate.
The lessee shall pay to the lessor on demand any additional municipal rates and taxes levied from time to time during the currency of this agreement in respect of or by virtue of the additions and alterations effected in terms of {{self:0}}. In the event of the premiums payable by the lessor in respect of any insurance policy relating to the leased premises and/or to the building being increased by reason of any such alterations and additions then, as and when the lessor shall be obliged to make payment of such additional premiums during the currency of this agreement, the lessee shall be obligated to refund to the lessor the amount of such increase(s).
Upon the termination of this agreement for any reason whatever the lessor shall be entitled in its sole discretion to direct that the lessee shall, at the lessee's cost and expense, remove any such alteration or addition or improvements and reinstate the leased premises in the same good order and condition, as at the commencement date (taking into consideration any repairs and/or improvements effected by the lessor to the leased premises during the course of this agreement), fair wear and tear excepted, and to make good and repair at the lessee's cost and expense any disrepair, damage or breakage, or at the lessor's written option, to reimburse the lessor for the cost of so doing and/or the cost of replacing any broken or damaged articles.
It is expressly recorded that should the lessor not direct the lessee, as envisaged in {{self:5}}, to remove any one or more alterations and/or additions and/or improvements effected by the lessee, then the lessee shall have no claim of whatsoever nature against the lessor for the value or cost of any such alterations and/or additions and/or improvements (as the case may be) effected to the leased premises and/or the building and/or the property, whether or not such alterations, additions or improvements were effected at the cost of the lessee, and the lessor shall be deemed to have become the owner of such alterations, additions and/or improvements upon the installation thereof. The lessee furthermore hereby expressly waives and abandons any improvement lien that it may have in respect of any alterations and/or additions and/or improvements made to the leased premises and/or the building and/or the property and expressly acknowledges that it shall have no right to occupy the leased premises pending the outcome of any legal or other dispute that may arise between the parties in respect of any alleged improvement lien.
Should the lessee be called upon by the lessor prior to, on or after the termination of this agreement to repair and/or reinstate the leased premises to the condition as stated in {{self:5}}, and for the purpose of so doing, the lessee remains in occupation of the leased premises or part thereof after expiry of the agreement and/or the lessor effects such repairs and/or reinstatement to the leased premises as contemplated in {{self:5}} after the termination of the agreement, which results in the lessor being prevented from letting the leased premises and/or the lessee being in occupation of the leased premises or part thereof due to the fact that, inter alia, work is being done to the leased premises, the lessee shall be liable, without prejudice to any other claims for damages or otherwise which the lessor has or may have in terms of this agreement or in law, to pay the lessor any further damages which may be sustained by the lessor, including but not limited to –
making payment to the lessor, as liquidated damages, of an amount equivalent to the rental payable in the last month of the agreement prior to the termination, together with all other amounts and charges as referred to in this agreement for each month that the lessee remains in occupation until such time as the leased premises are returned to the lessor; and/or
the loss of additional rentals which would have been payable by a new tenant; and/or
the loss of future rental resulting from a new tenant cancelling its agreement with the lessor in respect of the leased premises.
The lessee shall not be entitled, either during or after the termination or expiry of this agreement, to remove any alterations, additions or other improvements to the leased premises, the building and/or the property, unless directed by the lessor in terms of {{self:5}}.
The lessee shall be entitled from time to time with the lessor's prior written consent, to erect on the leased premises such fixtures and fittings as may be required or necessary for the carrying on of the permitted business therein and shall be in keeping with the general finish of the building of which the leased premises form part, provided that –
all such fixtures and fittings erected by the lessee in the leased premises shall, be removed by the lessee upon the expiration or early termination of this agreement, failing which such fixture and fittings shall become the lessor's property;
any damage caused to the leased premises as a result of any removal by the lessee of fixtures and fittings, in respect of which the lessor has directed the lessee to remove, shall be made good at the lessee's expense;
the lessee shall not be entitled to any compensation from the lessor for any improvements made.
Without the prior written consent of the lessor, the lessee shall not drive or permit to be driven any nails, plugs or screws into the floors, walls or ceilings of the leased premises, nor in any manner whatsoever do or permit to be done anything that may be calculated to damage the walls, floors or ceilings or any other part of the leased premises.$$,
'both', true, true, 1500, '{}', NULL, NULL),

('general_obligations', 'Lessee''s general obligations and restrictions',
$$The lessee shall –
not change or interfere with the electrical installation of the leased premises as at the date of occupation by the lessee of the leased premises, without the written consent of the lessor;
ensure that the electricity supply, including but not limited to all plugs and all other power points in the leased premises, is not overloaded at any time during the currency of this agreement;
be liable to repair and/or replace, at his/its cost, all damage of whatever nature caused to the plugs and power points in the leased premises;
provided the lessor consents in writing thereto, be entitled to modify the electrical installation of the leased premises on the basis that the lessee shall be liable for all costs of such modification/s and should such modification/s result in a higher tariff, the lessee shall pay the increased tariff;
be obliged, should the lessee modify the electrical installation of the leased premises, to furnish the lessor with a certificate of compliance in respect of the said electrical installation within fourteen days of such modification having been completed, valid as at the date of such completion. Should the said certificate not be forthcoming within the said 14 (fourteen)-day period, then the lessor shall be entitled to employ a suitably accredited person to carry out the relevant certification, testing, and remedial works required for the issue of such certificate of compliance, the costs of which shall be for the lessee's account and may be deducted from any deposit held and/or any other monies due to the lessee;
be responsible for ensuring the safety, safe use and maintenance of the electrical installations in the leased premises;
not at any time do or permit to be done in the leased premises anything which may be or cause a nuisance or annoyance to the occupiers of the neighbouring premises;
not at any time do or permit to be done on the property anything that may cause any harm, directly or indirectly, to any person or any property, whether caused by the lessee or the lessee's employees, representatives, customers, sub-contractors, invitees and/or their dependants;
not hold or permit the holding of sales by public auction in or upon the leased premises and/or the property;
not do anything which detracts from the appearance of the leased premises and/or the building and/or the property.
Should the lessee, upon taking occupation of the leased premises, discover that the same or that any of the keys, locks, windows and electrical installations and fittings are in a defective state, or are missing, the lessee shall, within seven days from the date of such occupation, notify the lessor in writing of the details of any such defects, or of the missing articles, and the failure to do so on the part of the lessee shall be an acknowledgment on its part that the leased premises and all of the said keys, locks, windows, electrical installations and fittings are in a good state of repair and condition. The lessee hereby promises and undertakes to care for and maintain the whole of the foregoing during the continuance of this agreement, and at the termination of this agreement to return and redeliver the same to the lessor in like good order and condition, and to make good and repair, at the lessee's own cost and expense, any damage or breakages, or in the alternative if the lessor so decides, to reimburse the lessor for the cost of replacing, repairing or making good any broken, damaged or missing article, fair wear and tear excepted.$$,
'both', true, true, 1600, '{}', NULL, NULL),

('claims_liability', 'Claims and limitation of liability',
$$The lessee hereby agrees that it shall have no claim of any nature whatsoever whether for damages or otherwise against the lessor, the lessor's shareholders, directors, agents and/or employees –
by reason of the leased premises, its structure and/or any part thereof and/or any installation/appurtenance being in a defective condition or in a state of disrepair or any particular repair not being effected by the lessor for which the lessor is liable in terms of this agreement;
in respect of any damage or loss caused to or sustained by the lessee or to any of his/its assets in the leased premises or elsewhere as a result of vis major, causus fortuitus or any other cause whatsoever;
in respect of any damage caused to the lessee's goods, furniture, equipment, installations, books, papers or other articles kept in the leased premises and/or the building and/or the property or any other damage or loss caused to or sustained by the lessee in or about the leased premises and/or the property as a result of water seepage or leakage including but not limited to sprinkler leakage and/or roof leakage wherever and howsoever occurring in the leased premises and/or the building, or by rain, hail, lightning, fire, riot or civil commotion or by reason of the negligence of the lessor's employees, customers or invitees;
for any accident, injury or damage caused to the lessee or his/its representatives, agents, employees, customers, friends, family or invitees or any other person through or while using the passages or yard or any portion of the leased premises and/or the building and/or the property, whether or not arising out of the negligence of the lessor and/or the lessor's employees, agents and/or sub-contractors or any other cause (including, without in any way derogating from the generality of the foregoing, whether caused by vehicles, both stationary or moving), other than the wilful misconduct of the lessor;
in respect of or arising out of a change to the name of the building, its façade, appearance or any other feature thereof;
in respect of or arising out of the functioning or malfunctioning of the (i) air-conditioning (if any); and/or (ii) the lift/s (if any); serving the leased premises and/or the building.
The lessee shall not be entitled to withhold or delay payment of any monies by the lessee to the lessor in terms of this agreement by reason of the leased premises or any part thereof being in a defective condition or in a state of disrepair or for any reason whatsoever.
The lessor shall not be responsible to the lessee for any defect or interruption in the electric current, supply of water, air-conditioning, heating, gas, and/or any other service whether such defect or interruption shall arise from the negligence or a breach on the part of the lessor or any of the lessor's agents, officers, servants or otherwise howsoever. In the event of any such defect or interruption, the lessor shall not be responsible to the lessee for any loss and/or damages sustained by the lessee as a result thereof. Further, in the event of such interruption, the lessee shall have no claim against the lessor for cancellation of this agreement or for any remission of rent.
Neither the lessor nor its agents, officers or servants, shall be responsible to the lessee or any of the lessee's officers, employees, family, friends or invitees for any accident, injury or damage caused to him through or while using lifts, staircases, passages, arcades (if any) and/or any portion of the leased premises and/or the building and/or the property, whether or not arising from or attributable to negligence of the lessor or howsoever else occasioned. The lessee hereby indemnifies the lessor against any claim arising out of the foregoing by any of the said persons.
The lessee shall at all times comply with, and shall ensure that his/its representatives, employees, customers or invitees at all times comply with the lessor's security regulations in force from time to time in respect of the building and/or the property and/or the leased premises. However, as stated in {{ref:security}}, the lessor shall have no obligation to provide security for the lessee and/or the leased premises and/or the building and/or the property.
The lessee hereby indemnifies the lessor, the lessor's shareholders, directors, agents and/or employees (hereinafter collectively referred to as "the indemnifies") and holds the indemnifies harmless against any claims by the lessee, the lessee's employees, representatives, customers, sub-contractors, invitees and/or their dependants, in connection with any loss of life, bodily and/or personal injury and/or property damage arising from or out of any occurrence in, upon, at or from the occupancy or use by the lessee of the leased premises.
The lessee hereby indemnifies the lessor, the lessor's shareholders, directors, agents and/or employees (hereinafter collectively referred to as "the indemnifies") and holds the indemnifies harmless against any claims by any person in connection with any loss of life, bodily and/or personal injury and/or property damage arising from or out of any act by the lessee, the lessee's employees, representatives, customers, sub-contractors, invitees and/or their dependants on the property.$$,
'both', true, true, 1800, '{}', NULL, NULL),

('lessor_rights', 'Lessor''s rights and obligations',
$$The lessor –
shall be obliged to maintain the exterior of the building;
shall have the right to locate service mains and other facilities, within the leased premises when required in terms of any by-laws or regulation or when, in the opinion of the lessor's architect (which shall be final and binding on both parties), this is dictated by the requirements of engineering design or good practice or both;
shall be entitled at any time for the purposes of repairing, improving, altering or adding to the building and/or the property –
to erect –
the building equipment required for the carrying out of that work;
such other equipment or devices as may be required by law or which the lessor's architect considers reasonably necessary for the protection of any person or property against injury arising out of that work;
at, near or in front of any part of the leased premises;
to such right of access to the leased premises as is reasonably necessary for the carrying out of that work, provided that the lessor –
shall not unreasonably affect the lessee's beneficial occupation of the leased premises during the carrying out of that work;
shall carry out such work as quickly as possible in the circumstances;
shall be entitled to carry out any repairs, additions or alterations to the leased premises and/or the building, which the lessor is required from time to time to carry out by any competent authority;
shall be entitled to affix to and show on the windows of the leased premises and/or the building or elsewhere thereon "TO LET" notices during the period of ninety days immediately preceding the expiration of this agreement;
shall be entitled to exhibit, on behalf of any new lessee of the leased premises any notices required in connection with any application for a licence to carry on a business in the leased premises during the period of two months immediately preceding the expiration of this agreement;
shall be entitled to enter upon and inspect the leased premises at all reasonable times;
shall be obliged to provide any air-conditioning or fumigation services four times per year in the leased premises and/or the building and/or the property.
Notwithstanding anything to the contrary contained in this agreement and for the avoidance of any doubt, the lessor shall only be obliged to maintain the exterior of the building as set out in {{self:1}}. Other light maintenance including but not limited to electrical installations will be provided by the lessor. All other maintenance and repairs, howsoever arising, required to be carried out in respect of the leased premises, plumbing and sanitary works, fixtures and fittings, painting, air-conditioners and all other appliances, shall be undertaken by the lessee at his/its sole cost and expense.$$,
'both', true, true, 1900, '{}', NULL, NULL),

('subletting', 'Subletting',
$$The lessee shall not –
cede, assign, transfer, alienate, hypothecate or otherwise dispose of any rights and/or obligations under this agreement; and/or
sub-let the leased premises or any part thereof; and/or
give up occupation or possession of the leased premises or any part thereof, to any person,
without the lessor's prior consent.
For the purposes of {{self:0}}, a cession will be deemed to have taken place in the event that control of the lessee, if it be a company or a close corporation, no longer vests in those directors or members who were in control thereof when this agreement was entered into.
Should the lessee permit any other person to occupy all or portion of the leased premises without the written consent of the lessor, the lessor shall be entitled to recover from such occupant, and the lessee shall be deemed to have ceded to the lessor, the rent and/or any other amount/s payable by such occupant to the lessee. No such occupancy or collection shall be deemed to be a waiver of any provision of this agreement or of any other right of the lessor or the acceptance of the occupant as a tenant or a release of the lessee from the further performance of any of the lessee's obligations in terms hereof.
Should the lessor consent to a cession or assignment of this agreement, the lessee shall be deemed, notwithstanding such consent, to have bound itself as surety for and co-principal debtor with the cessionary or assignee or any successor in title, in favour of the lessor, for the due and proper performance of all obligations imposed in terms of this agreement or any amendment thereof, provided, however, that such intercession shall be limited to obligations arising during the term of this agreement.$$,
'both', true, true, 2000, '{}', NULL, NULL),

('insurance', 'Insurance',
$$The lessee shall not do or omit to do or keep in or on the leased premises anything or allow anything to be done or kept in or on the leased premises and/or the building and/or the property which in terms of any insurance policy held from time to time by the lessor in respect of the building and/or the leased premises and/or the property may not be done or kept therein, or which is liable to enhance any of the risks against which the building is insured or which may render any policy/ies void or voidable and the lessee shall comply in all respects with the terms of any such policy/ies provided that should any premium payable in respect of any such policy/ies be increased –
by reason of the nature or scope of the business which the lessee carries on in the leased premises, and/or
as a result of the lessee not complying with the aforesaid provisions,
then without prejudice to any other rights which the lessor may have as a result thereof, the lessee shall on demand refund to the lessor, the amount of that additional premium. If as a result of any act, matter or thing done or permitted by the lessor to be done, any insurance policy held by the lessor is rendered void or cancelled, then the lessee shall be responsible for all and any consequential loss suffered by the lessor as a result thereof.
The lessee shall at all times during the currency of this agreement take out and maintain adequate insurance in respect of the loss of due to any damage to or destruction, of any nature whatever, of the leased premises, or any part thereof, or anything contained therein. The lessee shall ensure that all premiums payable in respect of the aforesaid insurance are paid on the due date for payment thereof and that the lessee takes no steps which may render any such policy void or voidable at the instance of the lessee's insurer.
The lessee shall (i) provide a copy of all his/its insurance policies to the lessor or its nominee within seven days of demand by the lessor; and (ii) notify the lessor or its nominee, in writing, of any incident having the potential or actually giving rise to damage to the leased premises within three days of the occurrence or perceived occurrence of such incident.
Should the lessor be cited as a party to any litigation commenced by or against the lessee or any litigation commenced against the lessor in respect of the leased premises, the lessee hereby indemnifies the lessor, its shareholders and directors (hereinafter collectively referred to as "the indemnified") against all loss, liability (whether actual, contingent or otherwise), damage and expense of every nature whatever (including without limiting the generality of the foregoing all party and party and attorney and own client (and additional) costs incurred by the indemnified) which the indemnified may suffer as a result of or which may directly or indirectly arise out of or in connection with such litigation.$$,
'both', true, true, 2200, '{}', NULL, NULL),

('destruction', 'Destruction of or damage to the leased premises',
$$Should all or a majority of the leased premises be completely destroyed or be so damaged as to render it substantially untenantable, then the lessor shall be entitled to cancel this agreement, by giving written notice thereof to the lessee, which written notice in order to be of force and effect must be delivered to the lessee within sixty days of the destruction of or damage to the leased premises having occurred. For the purposes of {{self:0}}, "substantially untenantable" shall mean if more than 20% (twenty percent) of the leased premises is damaged or destroyed.
Should no such notice as referred to in {{self:1}} be given by the lessor to the lessee then –
this agreement shall remain of full force and effect, and the lessor shall be obliged to proceed expeditiously with the work of rebuilding the leased premises and complete such works within a reasonable period of their commencement;
during the period that the leased premises are substantially untenantable, the lessee will not be liable for the payment of any monthly rental after the date of destruction of the leased premises. The lessor shall proceed expeditiously with the work of repairing the damage to the leased premises and complete such repair works within a reasonable period of their commencement.
Should the leased premises be damaged in such manner that 80% (eighty percent) or more of the leased premises is nevertheless tenantable, then this agreement shall not be terminated in terms of {{self:1}}, but the basic monthly rental payable by the lessee shall be reduced until the damage has been repaired, having regard to the extent to which the time for which the lessee is deprived of beneficial occupation of the leased premises.
Should there be any dispute as to –
whether more than 20% (twenty percent) of the leased premises have been rendered substantially untenantable;
whether 80% (eighty percent) or more of the leased premises is nevertheless tenantable; and/or
the amount of the remission of the basic monthly rental and/or the extent to which the lessee is deprived of beneficial occupation and enjoyment of the leased premises,
and such dispute is not resolved between the parties within seven days of it arising, such dispute shall be resolved by the local chairman for the time being of the South African Institute of Valuers (Cape Town branch) whose decision shall be final and binding upon the parties. The costs of obtaining such decision shall be paid by the parties in equal shares.$$,
'both', true, true, 2300, '{}', NULL, NULL),

('lockout', 'Lock out',
$$Should this Agreement be terminated for any reason whatsoever and the Lessee abandons or fails to trade from the Leased Premises for a consecutive period of 14 (fourteen) days, then the Parties agree that the Lessee will be deemed to have given up possession of the Property, then the Lessor shall be entitled, without any prejudice to its other rights in law and/or in terms of this Agreement, to:
lock the doors and/or the windows serving the Leased Premises and procure the modification of all the locks thereto;
procure the removal and storage of all movable property on the Leased Premises at the sole cost and expense of the Lessee. To the extent that the Lessee fails to collect such movable property within 10 (ten) days of termination of this Agreement/abandonment of the Leased premises (whichever is applicable), the Lessor is hereby irrevocably authorised to sell such movable property, in the Lessor's sole discretion, to defray the aforesaid removal and storage costs;
procure, in the Lessor's sole discretion, the disposal of all perishable items in the Leased Premises at the cost and expense of the Lessee.$$,
'both', true, true, 2500, '{}', NULL, NULL),

('early_termination', 'Early termination',
$$Should the Lessee be a natural person and the Consumer Protection Act of 2008 (hereinafter referred to as "the CPA") be applicable to this Agreement, then the Lessee may cancel the Agreement upon expiry of the Initial Period or at any other time providing the Lessor with 20 (twenty) business days' notice in writing. Upon cancellation as referred to herein above, the Lessee shall remain liable for all amounts owing in terms of the Agreement, up until date of cancellation.
A reasonable cancellation penalty will be imposed by the Lessor, which cancellation penalty will be calculated as follows:
By utilizing 20% (twenty percent) of the normal rental amount for every month, which remained outstanding in the Initial Period. Consequently, should the Lessee terminate the Agreement with 6 (six) months left before the lapsing of the rental period, then the rental amount should be multiplied by 20% (twenty percent), which amount should be multiplied by 6 (six). This penalty will be payable within 7 (seven) days of termination notice;
The Lessor will immediately advertise the Leased Premises for rental and take all reasonable steps to obtain a further tenant.
Should a further tenant be obtained upon reasonably the same terms as was agreed to in this Agreement, then the 20% (twenty percent) cancellation fee as referred to herein above, will not be applicable for the months in which the premises is occupied.
The Lessee accepts the above cancellation fee as reasonable, taking into consideration the time, effort and damage which the Lessor might suffer. It should be taken into consideration, as stated herein below, in {{self:6}}, that the cancellation fee does not include agent's commission.
Should the CPA not be applicable then early termination will not be accepted.
The Lessor may withhold and apply the Lessee's deposit towards the Lessee's liability to the Lessor contemplated in this clause, until the Leased Premises have been subsequently leased or the expiry of the Initial Period.$$,
'both', true, true, 2600, '{}', NULL, NULL),

('breach', 'Breach by the lessee',
$$Should –
the basic monthly rental or any other amount due in terms hereof not be paid on the due date; or
the CPA apply and the lessee commit, suffer or permit the commission of a breach of any of the other terms of this agreement and fails to remedy such breach within a period of twenty days after receipt of notice requiring the remedy thereof; or
the lessee commit, suffer or permit the commission of a breach of any of the other terms of this agreement whether or not such breach goes to the root of this agreement, and fails to remedy such breach within a period of seven days after receipt of notice requiring the remedy thereof from the lessor;
the lessee repeatedly breach any of the terms of this agreement in such a manner as to justify the lessor in holding that the lessee's conduct is inconsistent with the intention or ability of the lessee to carry out the terms of this agreement; or
a judgment be entered against the lessee and the lessee fail within fourteen days after such judgment comes to its notice to satisfy same or have same rescinded; or
the lessee effect or attempt to effect a general compromise with the creditors of the lessee; or
the lessee be placed in liquidation or be de-registered, whether provisionally or finally; or
business rescue proceedings be commenced against the lessee or a resolution is passed by its directors or shareholders (if applicable) to commence business rescue proceedings in respect of the lessee in terms of Chapter 6 the Companies Act, Act 71 of 2008; or
the lessee commits an act of insolvency within the meaning of section 8 of the Insolvency Act, Act 24 of 1986, and the lessee fail to remedy such act of insolvency within fourteen days after the lessor has given notice to the lessee of such act of insolvency,
then and in any such event the lessor shall be entitled but not obliged notwithstanding any previous waiver or anything to the contrary herein contained to cancel this agreement forthwith and retake possession of the leased premises and/or to vary the agreement by making it thereafter terminable by one month's written notice given to the lessee by the lessor without prejudice to its claims for any arrear rental or any other amounts payable hereunder or for any damage which it may suffer by reason of such breach and/or cancellation, or to exercise any other remedy which it may have against the lessee in law or otherwise in terms of this agreement.
Notwithstanding {{self:1}} hereof, if the lessor shall have within any one period of 12 (twelve) months duly given the lessee notice in terms of {{self:1}} hereof in respect of two breaches of the terms of this agreement, the lessee shall not thereafter be entitled to any notice in respect of any further breach, and the lessor's rights of cancellation and other relief in terms of {{ref:warranties}} shall arise forthwith upon such further breach.
Should the lessor instruct an attorney, collection agent or its property manager to collect any arrear payments due by the lessee in terms of this agreement, or to take any other steps against the lessee for any other reason arising out of the failure by the lessee to comply with any of the terms hereof, then and in such event, the lessee agrees to pay all and any costs on attorney and own client scale incurred by the lessor, which costs, without limiting the generality of the foregoing, shall include the costs of a letter of demand, collection charges, as well as all party and party and attorney and own client charges, whether or not any legal proceedings are instituted.
No relaxation or indulgence which the lessor may extend to the lessee shall in any way prejudice its rights hereunder and, in particular, no acceptance by the lessor of rentals or any other sums after due date (whether on one or more occasions) shall preclude or estop it from exercising any rights enjoyed by it hereunder by reason of any subsequent payment not being made on due date or any subsequent breach of this agreement.
While for any reason or on any ground the lessee occupies the leased premises and the lessor disputes his/its right to do so, then, until the dispute is resolved, whether by settlement, arbitration or litigation, the lessee shall (notwithstanding that the lessor may contend that this agreement is no longer in force) continue to pay (without prejudice to its rights) an amount equivalent to the basic monthly rental provided for in this agreement, monthly in advance, on the first day of each month, and all other amounts payable in terms of this agreement on the due date for payment thereof and the lessor shall be entitled to accept and recover such payments, and such payments and the acceptance thereof shall be without prejudice to and shall not in any way whatsoever affect the lessor's claim then in dispute. Should the dispute be resolved in favour of the lessor, then the payments made and received in terms of {{self:5}} shall be deemed to be amounts paid by the lessee on account of damages suffered by the lessor by reason of the unlawful occupation or holding over by the lessee.$$,
'both', true, true, 2700, '{}', NULL, NULL),

('domicilium', 'Domicilium and notices',
$$The parties choose domicilium citandi et executandi ("domicilium") for all purposes of the giving of any notice, the payment of any sum, the serving of any process and for any other purpose arising from this agreement, as follows –
Lessor; as described and noted on page 1 of this agreement;
Lessee; the lease premises or the email address referred to on page 1 of this agreement.
Each of the parties shall be entitled from time to time, by written notice to the others, to vary its domicilium to any other physical address within the RSA and/or its email address.
Any notice given and any payment made by any party to any other shall be in writing and if –
delivered by hand during the normal business hours of the addressee at the addressee's domicilium for the time being shall be presumed to have been received by the addressee at the time of delivery;
posted by prepaid registered post from an address within the RSA to the addressee at the addressee's domicilium for the time being shall be presumed to have been received by the addressee on the 14th (fourteenth) day after the date of posting;
Any notice given by any party to any other which is transmitted by email to the addressee at the addressee's email address, for the time being shall be presumed, until the contrary is proved by the addressee, to have been received by the addressee on the first business day after the successful transmission thereof.
Notwithstanding anything to the contrary contained in {{self:0}}, written notice or other communication actually received by a party shall be adequate written notice or communication to it notwithstanding that the notice was not sent or delivered to his/its chosen address or email address.$$,
'both', true, true, 2800, '{}', NULL, NULL),

('warranties', 'Warranties and representations',
$$It is hereby specifically agreed that this agreement contains all the terms and conditions of the contract of lease entered into by the lessee and the lessee acknowledges that no representations, warranties, undertakings or promises of whatsoever nature which may have been made by the lessor, its agents, officers or servants, other than those herein contained, shall be binding or enforceable against the lessor and the lessee records that it has not been induced to enter into this agreement by any representations, warranties, promises or undertakings not herein contained.$$,
'both', true, true, 2900, '{}', NULL, NULL),

('applicable_law', 'Applicable law and jurisdiction',
$$This agreement (including its validity, existence and implementation, the interpretation and application of its provisions, the respective rights and obligations of the parties in terms of and arising out of the conclusion, and termination of the provisions of this agreement), shall be interpreted and governed in all respects by the laws of the RSA.
The lessor and the lessee do hereby consent, in terms of Section 45 of the Magistrates'' Courts Act, Act 32 of 1944, that the Magistrate''s Court shall have jurisdiction to determine any action or proceedings which may arise under or in connection with this agreement, notwithstanding the fact that the claim or value of the matter in dispute might exceed the jurisdiction of the Magistrate''s Court.
Notwithstanding the consent of the lessor and the lessee to the jurisdiction of the Magistrate''s Court aforementioned, such consent is given without prejudice to the rights of the lessor or the lessee, as the case may be, to institute legal proceedings in any other competent court having jurisdiction in the matter, including but not limited to any High Court of the RSA.$$,
'both', true, true, 3000, '{}', NULL, NULL),

('certificate', 'Certificate',
$$A certificate signed by any officer, auditor or director of the lessor for the time being (whose appointment, authority or qualifications need not be proved) setting out any amount owing by the lessee to the lessor, or particulars of any breach of this agreement, shall be –
prima facie proof of the amount due to the lessor, or of the breach, as the case may be;
valid as a liquid document in any court of competent jurisdiction for the purpose of obtaining provisional sentence or summary judgment.$$,
'both', true, true, 3200, '{}', NULL, NULL),

('general', 'General',
$$This agreement constitutes the sole record of the agreement between the parties in relation to the subject matter hereof.
No party shall be bound by any representation, warranty, promise or the like not recorded herein.
No addition to, variation, or agreed cancellation of this agreement shall be of any force or effect unless recorded in a written document and signed by or on behalf of the parties. For the purposes of {{self:3}}, a "written document" shall exclude any written document that is in the form, either wholly or partly, of a data message as defined in the Electronic Communications and Transactions Act, Act 25 of 2002, and "signed" shall mean a signature executed by hand with a pen and without any electronic process or intervention.
No indulgence which any party may grant to any other shall constitute a waiver of any of the rights of the grantor, who shall not thereby be precluded from exercising any rights against the grantee which may have arisen in the past or which might arise in the future.
Save as set out herein, no party shall be entitled to cede any of his/its rights and/or delegate any of his/its obligations in terms of this agreement to any other party, without the prior written consent of the other of them.
This agreement shall bind the lessor only when it is signed by the lessor and no other act on the part of the lessor shall bring about any binding agreement.$$,
'both', true, true, 3300, '{}', NULL, NULL),

('signatures', 'Signatures',
$$This agreement is signed by the parties on the date/s indicated below.

LESSOR: {{var:lessor_name}}
Authorised signatory: _______________________
Full name: _______________________
Date: _______________________
Capacity: _______________________

AGENT: {{var:agent_name}}
Authorised signatory: _______________________
Full name: _______________________
Date: _______________________

LESSEE 1: {{var:lessee_name}}
Signature: _______________________
Date: _______________________
Witness: _______________________

LESSEE 2: {{var:lessee2_name}}
Signature: _______________________
Date: _______________________
Witness: _______________________$$,
'both', true, true, 3400, '{}', NULL, NULL),

-- ─── Optional clauses ────────────────────────────────────────────────────────

('electricity', 'Electricity, other outgoings and municipal rates & taxes',
$$The lessee shall with effect from the commencement date be liable for and pay forthwith on demand to the lessor all costs for, electricity, sanitary fees, refuse removal fees, and any other services consumed by the lessee in respect of the leased premises.
Should the supply of electricity be rendered via separate sub meter, the lessee shall pay to the lessor the cost of the electricity consumed within seven days of an invoice rendered by the lessor to the lessee in respect thereof. The onus of proving an inaccurate meter reading shall lie with the lessee.
Should no separate sub meter be installed in respect of the services consumed in terms of {{self:0}} or should a common sub meter exist for more than the leased premises, such service charges shall be calculated by the lessor on a pro rata basis based on the percentage which the rentable floor area of the leased premises bears to the rentable floor area of the building actually let at the time, alternatively the rentable floor area of that portion of the building served by the common sub meter which is actually let at the time.
All and any charges levied in respect of separate sub meters shall be for the account of the lessee, including the cost of reading same.
The lessee shall be liable for his/its proportionate share (which share shall be calculated as envisaged in {{self:2}}) of any increases only, which takes effect after the commencement date, in any rates and taxes, including assessment rates and municipal fees and charges, levied by any competent local authority in respect of the property. The lessee shall be liable to pay his/its proportionate share of any such increases only with effect from the date upon which such increase takes effect. The lessee's pro rata share shall be calculated based on the percentage which the rentable floor area of the leased premises bears to the rentable floor area of the building actually let at the time.$$,
'both', false, true, 700, '{}',
'Covers sub-metered electricity, water, sanitary fees, and municipal rate increases. Disable only if all utilities are included in the rental amount with no separate charges.',
'Property has sub-metered electricity or municipal charges'),

('firefighting', 'Firefighting equipment',
$$If applicable the lessor shall procure and furnish to the lessee a compliance certificate in respect of all fire extinguishers and hose reels (collectively referred to as "the firefighting equipment") situated on the leased premises prior to occupation.
Upon the lessor furnishing the lessee with the compliance certificate referred to in {{self:0}}, the lessee shall have no claim against the lessor in respect of any damage or loss sustained as a result of the firefighting equipment not functioning.$$,
'both', false, false, 800, '{}',
'Required if the property has fire extinguishers or hose reels. The lessor must provide a compliance certificate before occupation.',
'Property has fire extinguishers / hose reels'),

('fire', 'Fire',
$$The Lessee shall not store, harbour or permit the storage or harbouring of any articles in or upon the Leased Premises and/or the Building and/or the Property as a result whereof the premiums in respect of fire insurance of the Building and/or the Property may be increased. The Lessee shall not do or permit to be done any act, matter or thing as a result whereof any fire insurance policy held by the Lessor for the time being in respect of the Building and/or the Property may be rendered void or voidable. If, as a result of any act, matter or thing done or permitted to be done by the Lessee, the fire insurance policy held by the Lessor is rendered void or cancelled, then the Lessee shall be responsible for all and any consequential loss to the Lessor as a result thereof.
Should the premium payable by the lessor under its policy of fire insurance be increased as a result of –
the storage by the lessee of any of the articles referred to in {{self:1}} or the conduct of the lessee's business in the leased premises; and/or
attributable to any changed circumstances in the nature of the business conducted by the lessee on the leased premises,
then the lessee shall forthwith on demand pay to the lessor the amount of such increase.$$,
'both', false, false, 900, '{}',
'Covers fire insurance obligations and prohibited storage. Recommended whenever the firefighting equipment clause is included.',
'Include fire insurance obligations clause'),

('security', 'Security',
$$The lessor shall have no obligation to provide security for the lessee and/or the leased premises and/or the building and/or the property.
In the event that the lessor directly or indirectly provides security services or any security equipment in or around the property and/or the building and/or the leased premises, then the lessee –
shall be liable and shall pay to the lessor a pro rata portion of the cost of such security for the property based on the square metres comprising the leased premises;
agrees that the lessor shall not be held responsible or legally liable for any acts or omissions of the person/s or entity/ies carrying out such security services or for the failure of any of the security equipment or in the event that the security equipment is not in working order;
waives any claims which it may have against the lessor in respect of such security services or provision of or operation or effectiveness of the security equipment.
The lessee hereby acknowledges and agrees that should the lessor install and/or have installed any security systems in respect of the property and/or the building and/or the leased premises, the lessor shall not be responsible for the effectiveness of such system or for any loss caused by any act or default on the part of the security personnel or any equipment installed. It is specifically provided that the provision by the lessor of any security service to the property and/or the building and/or the leased premises shall not be construed in any manner whatsoever as an acceptance by the lessor of any responsibility or liability towards the lessee or any other person whatsoever.$$,
'both', false, false, 1100, '{}',
'Covers security services, access control, and limits lessor liability for security failures. Enable if the property has a guard, gate, or security system.',
'Property has managed security or access control'),

('common_property', 'Use of common property',
$$The common property shall at all times be subject to the exclusive control and management of the lessor, which shall have the right from time to time to establish, modify and enforce by written notice to the lessee and/or tenants in the property rules and regulations with respect thereto and generally to do or perform such other acts in and to the common property as the lessor in its sole discretion shall reasonably determine to be advisable with a view to the improvement of the convenience and the use of the common property by occupiers, their officers, agents, employees and customers.
Provided that the lessee is not in breach of this agreement, the lessee shall be entitled to the access and reasonable usage of the common property.
The lessee undertakes that –
it will not cause or permit vehicles belonging to or used by him/it or his/its directors, principals or employees to be parked in the common property;
no obstruction shall be placed or be permitted to be placed by him/it or its directors, principals or employees in the common property which may interfere with their use; and
no vehicles driven by him/it or him/its principals, employees, members, licensees or invitees shall obstruct the free flow of traffic, the entrances or exits of the driveways or the pedestrian entrances to the property.$$,
'both', false, false, 1300, '{}',
'Covers shared parking, driveways, and common areas. Enable for units in a complex or building. Disable for standalone houses with no shared amenities.',
'Property has common areas (complex or building)'),

('services_lessor', 'Services by lessor',
$$Any services which may be provided by the Lessor relating to the Leased Premises, and the nature, extent and duration of such services, shall be provided by the Lessor at its sole and absolute discretion, without affecting the rental payable by the Lessee in terms hereof. Neither the Lessor nor its agents, officers or employees shall be liable for the receipt or non-receipt of the delivery of goods, postal matters or correspondence, nor shall they be liable for anything which the Lessee, his/its officers, servants or invitees may have deposited or left in the Leased Premises or any part of the Building, and the Lessee indemnifies the Lessor against any such claims that may be made against the Lessor by any of the foregoing.$$,
'both', false, false, 1700, '{}',
'Covers incidental services provided by the lessor beyond the basic letting. Enable if the lessor provides internet, cleaning, or other services.',
'Lessor provides additional services to the lessee'),

('heavy_objects', 'Heavy objects',
$$The lessee shall not place any extraordinary safe or any extraordinarily heavy article in the leased premises and/or the building without the lessor's prior written consent, which consent shall not be unreasonably withheld, and the lessee shall be responsible for and shall make good any damage to the leased premises and/or to the building occasioned by the moving or placing therein of any such article or by any act or default on the part of the lessee.$$,
'both', false, false, 2100, '{}',
'Restricts heavy safes or equipment without consent. More relevant for upper-floor units or commercial premises with floor load limits.',
'Include heavy objects restriction'),

('aircon', 'Air-conditioning units',
$$In the event that the lessee wishes, at his/its expense, to install further air-conditioning units in the leased premises, he/it shall not do so without the lessor's prior written consent. Such further air-conditioning units so installed shall at all times remain the property of the lessee, provided that –
all such air-conditioning units installed by the lessee in the leased premises shall be installed and maintained according to the normal standards and regulations and shall be removed by the lessee upon the expiration or early termination of this lease; and
the lessee shall reinstate the leased premises (or the part of the leased premises in question) at the lessee's cost to its same condition (fair wear and tear excepted) prior to the installation of such air-conditioning unit;
any increase in the electricity as a result of the installation of air-conditioning units shall be for the lessee's account.$$,
'both', false, false, 2400, '{}',
'Governs installation and removal of air-conditioning units. Enable if the property has no built-in AC and the tenant may wish to install units.',
'Tenant may wish to install air-conditioning units'),

('surety', 'Surety',
$$Should the agreement be signed on behalf of a Company, corporation or non profit organisation then the signatory binds him or herself to the Lessee for due fulfilment of all its obligations, the one paying the other to be absolved.$$,
'both', false, false, 3100, '{}',
'The signatory binds themselves personally as surety for a company or CC lessee. Required when the lessee is a juristic person. Not applicable for natural persons.',
'Lessee is a company, CC, trust, or organisation'),

('restrooms', 'Restrooms',
$$Any restrooms, toilets, urinals, vanities and the other apparatus shall not be used for any purpose other than that for which they were constructed, and no foreign substance of any kind whatsoever shall be thrown therein. The expense of any breakage, stoppage or damage resulting from the violation of this rule shall be borne by the tenant whom, or whose employees or invitees, shall have caused it.
The lessor shall provide sanitary bin/s in any public restrooms on the leased premises, the cost of which shall be borne by the lessor.$$,
'commercial', false, true, 1150, '{}',
'Covers restroom use rules and lessor obligations for sanitary bins. Enable for commercial premises with shared or dedicated restrooms.',
'Building has shared or dedicated restrooms'),

('wheelchairs', 'Wheelchairs',
$$The lessee shall –
ensure that all wheel chairs in the leased premises are placed on carpet protectors; and
be liable for the cost of replacing any carpet damaged as a result of his/its failure to comply with the provisions of {{self:1}}.$$,
'commercial', false, false, 1160, '{}',
'Requires carpet protectors for wheelchair use. Enable for commercial premises with carpeted floors.',
'Premises has carpeted areas (wheelchair protection clause)'),

('advertising_signs', 'Advertising and signs',
$$The lessee shall not write, affix, erect or permit to be written, affixed or erected, any sign, signboard, neon-sign, writing, fixtures, fittings, show-cases and/or any other erection (hereinafter referred to as "signs") –
on the interior or exterior of the leased premises and/or the building and/or the property; and/or
in the windows of the leased premises and/or the building,
without the written consent of the lessor being first had and obtained.
The lessee undertakes, at his/its own expense and to the satisfaction of the lessor, to remove the signs at the expiration of this agreement and to ensure that after the removal thereof the leased premises and/or the building and/or the property are left in the same good order and condition as at the commencement date. Any damage caused to the leased premises and/or the building and/or the property as a result of such removal shall be made good by the lessee at the lessee''s expense, forthwith upon demand made therefor by the lessor.
Should the lessor consent to the lessee, erecting and/or affixing any signs on the interior or exterior of the leased premises and/or the building and/or the property, such consent shall be on the express condition that the supply and erection of the said sign is attended to by a contractor or supplier approved by the lessor.
The lessee shall be responsible at all times to keep and maintain the signs in good and clean condition, and, where applicable, in proper working order and condition.
The lessee shall comply with and carry out from time to time all the requirements of any competent authority in regard to the signs.
The lessee hereby indemnifies the lessor against all claims of whatsoever nature which may be made and/or instituted against the lessor by any third party, under any circumstances as a result of –
the installation, erection, operation and/or removal of the signs, whether installed or erected with or without the lessor''s written consent;
any defect in any the signs, whether installed or erected with or without the lessor''s written consent; and
any failure on the part of the lessee or any of the lessee''s servants or agents, to keep and maintain the signs in good order and condition and/or properly installed and erected.$$,
'commercial', false, true, 1550, '{}',
'Governs external signage, branding, and advertising on the premises. Enable if the tenant may display signage outside the leased space.',
'Tenant may display external signage or advertising'),

('costs', 'Costs',
$$Each party shall bear his/its own cost incidental to the negotiation, drafting and execution of this agreement. A contract fee (exclusive of VAT) might be charged as a once off contract fee. If a contract fee is applicable it will be noted in Annexure A: Rental Calculation.$$,
'commercial', false, true, 3050, '{}',
'Covers costs incidental to drafting and signing. Include the contract fee if applicable.',
'Include costs clause'),

('regulatory_compliance', 'Regulatory compliance',
$$The lessee hereby warrants that it shall at all times comply with all applicable laws, regulations, by-laws, and statutory requirements relevant to the operation of its business from the leased premises, including but not limited to the Protection of Personal Information Act 4 of 2013, the National Credit Act 34 of 2005, the Consumer Protection Act 68 of 2008, the Financial Intelligence Centre Act 38 of 2001, and all applicable sector-specific legislation. The lessee shall at its own cost obtain and maintain all licences, permits, and authorisations required for the conduct of its business and shall immediately notify the lessor of any failure to comply or any investigation by any regulatory authority.$$,
'commercial', false, true, 3010, '{}',
'Covers regulatory and legal compliance obligations specific to commercial tenants.',
'Include regulatory compliance clause');
