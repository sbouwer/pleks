-- 015_clause_library.sql
-- Clause library enhancements and seed data consolidated from 011 and 024.
-- Adds condition column for conditional clause inclusion, seeds optional feature
-- clauses (pets, parking, utilities_alternative, telecommunications), and the
-- attorney-reviewed co-lessee joint and several liability clause.
-- Idempotent: ADD COLUMN IF NOT EXISTS, INSERT ... ON CONFLICT DO UPDATE, UPDATE with guard.

-- Conditional inclusion support (024_clause_condition)
-- condition: when non-null, the clause is only included in the document if
-- the named condition evaluates to true at generation time.
-- Supported: co_tenants_present (lease has at least one lease_co_tenants record)
ALTER TABLE lease_clause_library
  ADD COLUMN IF NOT EXISTS condition text;

-- ─── Optional clauses for unit feature auto-mapping (011_optional_clauses_seed) ───

INSERT INTO lease_clause_library
  (clause_key, title, body_template, lease_type,
   is_required, is_enabled_by_default, sort_order,
   depends_on, description, toggle_label)
VALUES

('pets', 'Pets',
$$The lessee shall not keep or permit to be kept any animal, bird, reptile or other pet (hereinafter referred to as "pet" or "pets") in or upon the leased premises and/or the building and/or the property without the prior written consent of the lessor. Such consent, if granted, shall be subject to the following conditions –
the lessee shall be permitted to keep only such pet or pets as are described in Annexure D: Special Agreements, subject to any conditions recorded therein;
the lessee shall ensure that the pet or pets are at all times kept under proper control and supervision and shall not permit any pet to cause a nuisance, annoyance, danger or disturbance to other occupiers of the property or to any neighbours or to any person upon or in the vicinity of the property;
the lessee shall be liable for and shall make good any and all damage of whatsoever nature caused by the pet or pets to the leased premises and/or the building and/or the property and/or the common property, including but not limited to damage to carpets, flooring, doors, walls, gardens, lawns and fixtures, fair wear and tear excluded;
the lessee shall ensure that the leased premises and any garden or outside area used by the pet or pets are at all times kept in a clean, hygienic and sanitary condition. The lessee shall remove all animal waste immediately and shall be responsible for flea and tick treatment and any associated pest control at his/its own cost. Upon the termination of this agreement, the lessee shall arrange for professional fumigation of the leased premises at his/its own cost where pets were kept during the currency of the agreement, and shall provide proof of such fumigation to the lessor prior to the handover of the leased premises;
the lessee shall comply with all applicable municipal by-laws, regulations and legislation relating to the keeping of animals, including but not limited to licensing requirements and limitations on the number of animals that may be kept at a residential property;
subject to applicable law, the lessee shall be liable for and hereby indemnifies the lessor, the lessor's agents, employees and other occupiers of the property against any reasonable claims, damages, losses, costs and expenses arising directly or indirectly from the keeping of the pet or pets on the leased premises and/or the property, including but not limited to claims arising from biting, scratching, allergic reactions or any other injury or damage caused by the pet or pets to any person or property, excluding liability arising from the gross negligence or wilful misconduct of the lessor;
should the pet or pets cause persistent nuisance, disturbance or damage, or should the lessee fail to comply with any of the conditions set out in {{self:0}}, the lessor shall be entitled, acting reasonably, to withdraw consent by giving the lessee not less than fourteen days' written notice, whereupon the lessee shall remove the pet or pets from the leased premises within the said notice period;
the withdrawal of consent in terms of {{self:7}} shall not in itself entitle the lessee to cancel this agreement or claim a reduction in rental or damages, unless otherwise required by law.
Where so stipulated in Annexure D: Special Agreements, the deposit referred to in {{ref:rental_deposit}} shall include an additional amount allocated toward pet-related damage (hereinafter referred to as "the pet deposit allocation"). Such pet deposit allocation shall form part of, and be governed by the same terms and conditions as, the total deposit referred to in {{ref:rental_deposit}}, including the accrual of interest for the benefit of the lessee in accordance with the Rental Housing Act 50 of 1999. Upon the termination of this agreement, any deductions from the deposit in respect of damage caused by the pet or pets shall be separately itemised in the deduction schedule, fair wear and tear excluded.
The consent granted by the lessor in terms of {{self:0}} is personal to the lessee and to the specific pet or pets described in Annexure D: Special Agreements. The lessee shall not substitute, replace or introduce any additional pet or pets without the prior written consent of the lessor.$$,
'both', false, false, 1050, '{}',
'Governs the keeping of domestic animals, pet deposit allocation, damage liability, and removal conditions.',
'Tenant is permitted to keep animals on the premises'),

('parking', 'Parking',
$$Where the lessee is allocated the use of a parking bay, garage or carport (hereinafter referred to as "the parking area") as described in Annexure D: Special Agreements, the following conditions shall apply –
the parking area shall be used solely for the parking of roadworthy, licensed motor vehicles as contemplated in the National Road Traffic Act, Act 93 of 1996, and shall not be used for the storage of goods, equipment, materials, boats, trailers, caravans or any other purpose without the prior written consent of the lessor;
the lessee shall not carry out or permit to be carried out any mechanical repairs, servicing, panel beating, spray painting or any similar work on any vehicle in the parking area or elsewhere on the property, save for emergency repairs of a minor nature;
the lessee shall not wash or permit the washing of any vehicle in the parking area or on any part of the property other than in such area as may be designated by the lessor for that purpose, if any;
the lessee shall not permit any oil, petrol, diesel, brake fluid, coolant or other noxious substance to leak from any vehicle parked in the parking area, and should any such leakage occur, the lessee shall be liable for the cost of cleaning and making good any damage to the surface of the parking area and/or any adjacent areas;
the lessee shall not permit any vehicle to be parked in such a manner as to obstruct the free flow of vehicular or pedestrian traffic on the property, or to obstruct the parking areas allocated to other occupiers of the property, or to obstruct access to any fire hydrant, fire escape, emergency exit, refuse area or any other area reasonably required to be kept clear;
the lessor shall not be responsible for the safekeeping or security of any vehicle or the contents thereof parked in the parking area, save where any loss or damage arises from the gross negligence or wilful misconduct of the lessor, the lessor's agents or employees. Subject to the aforegoing, the lessee hereby indemnifies the lessor against any reasonable claims arising from theft, damage or loss to any vehicle or the contents thereof;
the lessee shall ensure that the parking area is kept in a clean and tidy condition at all times and shall not store or permit the storage of any items therein other than the vehicle;
where the parking area comprises a garage, the lessee shall maintain the garage door and its mechanism in good working order and condition at his/its own cost, and shall be liable for the cost of any repairs or replacements reasonably required as a result of damage caused by the lessee or his/its visitors, excluding fair wear and tear and latent defects;
the allocation of the parking area shall be personal to the lessee and shall not be sublet, assigned or otherwise transferred to any third party without the prior written consent of the lessor.
The rental payable in respect of the parking area, if applicable, shall be as set out in Annexure D: Special Agreements, and shall be payable in addition to and at the same time and in the same manner as the basic monthly rental referred to in {{ref:rental_deposit}}.$$,
'both', false, false, 1070, '{}',
'Governs allocated parking, access rights, vehicle restrictions, and parking bay conditions.',
'Unit includes allocated parking bay, carport or garage'),

('utilities_alternative', 'Alternative utilities',
$$Where the leased premises and/or the property is equipped with one or more alternative utility installations, including but not limited to solar photovoltaic panels, solar inverters, battery storage systems, solar geysers, boreholes, rainwater harvesting tanks and associated pumps, filtration or purification systems (hereinafter collectively referred to as "the alternative utility installation" or "the installation"), the following provisions shall apply –
the lessee acknowledges that the installation is provided for the supplementary or alternative supply of electricity and/or water to the leased premises and that the lessor makes no warranty or representation as to the continuity, capacity, output or quality of the supply from the installation. Unless the property is designed or approved for off-grid use, or otherwise agreed in writing, the lessee shall at all times maintain a connection to the municipal supply of electricity and/or water as the primary supply;
the lessee shall not interfere with, modify, disconnect, reconfigure or extend the installation or any part thereof without the prior written consent of the lessor. Any alteration to the installation shall be subject to the provisions of {{ref:alterations}} and shall be carried out only by a suitably qualified and accredited contractor approved by the lessor;
the lessee shall operate the installation in accordance with any operating instructions, user manuals or guidelines provided by the lessor or the installer. The lessee shall immediately notify the lessor of any malfunction, damage or defect in the installation;
the lessee shall be responsible for the routine maintenance of the installation to the extent specified in Annexure D: Special Agreements, which may include but shall not be limited to –
keeping solar panels free of debris, dirt and obstructions;
monitoring inverter and battery status indicators and reporting faults;
ensuring battery storage systems are not discharged below the minimum level specified in the manufacturer's operating instructions or, where no level is specified, below 20% (twenty percent) of total capacity;
ensuring borehole pump and filtration systems are not run dry or beyond capacity;
maintaining rainwater tanks in a clean and hygienic condition.
For the avoidance of doubt, routine maintenance shall not include technical servicing, electrical repairs, component replacement, or any work reasonably requiring a qualified electrician, plumber or specialist technician. Such work shall be the responsibility of the lessor unless otherwise agreed in writing;
the lessor shall be responsible for ensuring that the installation complies with all applicable laws, regulations, by-laws and standards, including but not limited to the Electrical Installation Regulations, the Electrical Machinery Regulations, the National Building Regulations and any municipal requirements relating to solar installations or borehole registration and water use licences under the National Water Act, Act 36 of 1998;
the lessee shall not sell, distribute or permit the distribution of any electricity generated by a solar installation to any third party or to any premises other than the leased premises without the prior written consent of the lessor and subject to applicable municipal approval requirements;
where a borehole is installed on the property, the lessee shall use borehole water responsibly and in compliance with any water use restrictions imposed by the relevant water services authority or the Department of Water and Sanitation, save for reasonable domestic use as permitted under Schedule 1 of the National Water Act. The lessee shall not use borehole water for any commercial purpose without the prior written consent of the lessor and such further authorisation as may be required in terms of the National Water Act;
the failure or unavailability of the installation for any reason, including maintenance, repair, replacement or insufficient output, shall not in itself constitute grounds for a reduction in rental or a claim against the lessor, unless otherwise required by law;
upon the termination of this agreement, the lessee shall return the installation to the lessor in the same good order and condition as at the commencement date, fair wear and tear excepted.$$,
'both', false, false, 750, '{"electricity"}',
'Governs solar, borehole, and other alternative utility installations including Schedule 1 domestic use.',
'Property has solar, borehole, or other alternative utility installations'),

('telecommunications', 'Telecommunications',
$$Where the leased premises and/or the property is equipped with or connected to telecommunications infrastructure, including but not limited to fibre optic cables, satellite dishes, aerial antennae, Wi-Fi access points and associated routers, switches, cabling and junction boxes (hereinafter collectively referred to as "the telecommunications infrastructure" or "the infrastructure"), the following provisions shall apply –
the lessee shall be responsible for establishing and maintaining his/its own account with the relevant telecommunications service provider at his/its own cost. The lessor shall not be liable for any charges, fees or costs incurred by the lessee in respect of any telecommunications service;
the lessee shall not interfere with, damage, disconnect, modify or extend the infrastructure or any part thereof without the prior written consent of the lessor. Should the lessee wish to install any additional telecommunications equipment, including but not limited to satellite dishes, aerials, external antennae, cabling or network equipment, the lessee shall obtain the prior written consent of the lessor and such installation shall be subject to the provisions of {{ref:alterations}};
the lessor shall not be responsible for the continuity, speed, capacity, quality or availability of any telecommunications service provided by a third-party service provider and the lessee shall have no claim arising solely from any interruption, degradation or failure of any such service, save where such failure arises from the gross negligence or wilful misconduct of the lessor;
where the infrastructure is shared with other occupiers of the property and/or the building, the lessee shall use the infrastructure in a reasonable manner and shall not do or permit to be done anything which may degrade, damage or interfere with the service available to other occupiers;
the lessee shall comply with all applicable laws, regulations and by-laws relating to the installation and use of telecommunications equipment, including but not limited to the Electronic Communications Act, Act 36 of 2005, and the regulations of the Independent Communications Authority of South Africa (ICASA);
the lessee shall permit the lessor and/or the lessor's nominated telecommunications service provider reasonable access to the leased premises for the purposes of installing, maintaining, repairing or upgrading the infrastructure, provided that –
the lessor shall give the lessee reasonable prior notice of such access, save in the case of an emergency;
such access shall be exercised at reasonable times and with as little disruption to the lessee as is reasonably practicable;
where a fibre optic connection or satellite installation is provided as a feature of the leased premises, the lessee shall take reasonable care of the internal termination point, router, optical network terminal or decoder (if any) provided, and shall be liable for the cost of repairing or replacing any such equipment damaged by the lessee, his/its employees, representatives or invitees, fair wear and tear excepted;
upon the termination of this agreement, the lessee shall –
cancel or transfer his/its telecommunications service account in respect of the leased premises;
return any equipment provided by the lessor in the same condition as at the commencement date, fair wear and tear excepted;
remove any telecommunications equipment installed by the lessee and make good any damage caused to the leased premises by such removal, at the lessee's cost.
The lessee shall not use the infrastructure for any unlawful purpose, including but not limited to the distribution of pirated content, the operation of an unlicensed broadcasting service, or any activity which contravenes the Films and Publications Act, Act 65 of 1996, or the Electronic Communications and Transactions Act, Act 25 of 2002.$$,
'both', false, false, 1080, '{}',
'Governs fibre, satellite, and telecommunications infrastructure with provider access provisions.',
'Property has fibre, satellite, or other telecommunications infrastructure')

ON CONFLICT (clause_key) DO UPDATE
  SET title                = EXCLUDED.title,
      body_template        = EXCLUDED.body_template,
      sort_order           = EXCLUDED.sort_order,
      description          = EXCLUDED.description,
      toggle_label         = EXCLUDED.toggle_label;

-- Append Annexure D conflict-resolution note to the general clause (idempotent guard)
UPDATE lease_clause_library
SET body_template = body_template
  || E'\nIn the event of any conflict between the provisions of Annexure D: Special Agreements and the main body of this agreement, the provisions of Annexure D shall prevail to the extent of such conflict, provided that such provisions are lawful and not inconsistent with applicable legislation.'
WHERE clause_key = 'general'
  AND body_template NOT LIKE '%Annexure D shall prevail%';

-- ─── Co-lessee joint and several liability clause (024_clause_condition) ───
-- Attorney reviewed. Auto-included when co_tenants_present condition is met.

INSERT INTO lease_clause_library
  (clause_key, title, body_template, lease_type,
   is_required, is_enabled_by_default, sort_order,
   description, toggle_label, condition)
VALUES (
  'co_lessee_liability',
  'Joint and Several Liability of Lessees',
  $$Where this Agreement is entered into by more than one Lessee, the Lessees shall be jointly and severally liable for all obligations arising from this Agreement. Each Lessee may be held individually responsible for the full amount of all obligations hereunder, and the Lessor shall be entitled to proceed against any one or more of the Lessees without first being required to proceed against the others. The Lessees hereby renounce the benefits of excussion and division.

The departure, absence or incapacity of one Lessee shall not release the remaining Lessee(s) from any obligation under this Agreement, unless otherwise agreed in writing by the Lessor, and this Agreement shall continue in full force against the remaining Lessee(s).

Where a Lessee who is a natural person elects to terminate this Agreement pursuant to section 14 of the Consumer Protection Act 68 of 2008, such termination shall be personal to that Lessee only and shall not affect or terminate the obligations of any remaining Lessee(s). The Agreement shall continue between the Lessor and the remaining Lessee(s), who shall remain liable for the full rental and all obligations under this Agreement.

Any deposit paid under this Agreement is held as security for all obligations of all Lessees jointly. No Lessee shall be entitled to a partial refund of the deposit on account of their departure. The deposit shall be dealt with in accordance with the provisions of the Rental Housing Act upon the final termination of this Agreement.$$,
  'both',
  true,   -- is_required (when condition is met)
  false,  -- is_enabled_by_default (condition gates inclusion; default irrelevant)
  250,
  'Joint and several liability for co-lessees. Auto-included when multiple lessees sign the agreement. Covers liability, departure, CPA s14 personal termination, and deposit handling.',
  'Co-lessees — joint and several liability',
  'co_tenants_present'
)
ON CONFLICT (clause_key) DO UPDATE
  SET title            = EXCLUDED.title,
      body_template    = EXCLUDED.body_template,
      sort_order       = EXCLUDED.sort_order,
      description      = EXCLUDED.description,
      condition        = EXCLUDED.condition;
