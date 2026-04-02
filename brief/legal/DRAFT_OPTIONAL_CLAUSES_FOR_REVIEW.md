# DRAFT: Optional Lease Clauses — For Legal Review

**Status:** DRAFT — requires review by a qualified SA property attorney before seeding into `lease_clause_library`.

**Context:** These four clauses are missing from the Pleks standard lease clause library. They are needed to complete the feature-to-clause auto-mapping system for unit clause profiles. Each clause follows the existing library's conventions: lessor/lessee terminology, `{{ref:clause_key}}` cross-references, `{{self:N}}` internal sub-references, `{{var:field}}` lease variable tokens, and SA-legal register.

**Token reference:**
- `{{var:field}}` — replaced with lease variable at generation time
- `{{ref:key}}` — replaced with actual clause number; renders as "[not included in this agreement]" if clause disabled
- `{{self:N}}` — replaced with "[this clause number].N" at generation time

**Cross-reference dependencies:** These clauses reference `{{ref:rental_deposit}}`, `{{ref:maintenance}}`, `{{ref:alterations}}`, and `{{ref:general}}` — all of which are required clauses always present in the generated lease.

---

## 1. Pets (`pets`)

**Triggered by:** "Pet-friendly" unit feature
**Lease type:** both | **Enabled by default:** false | **Sort order:** 1050
**Depends on:** none

**Toggle label:** Tenant is permitted to keep animals on the premises

**Description:** Governs the keeping of domestic animals, pet deposits, damage liability, and removal conditions. Enable for units where pets are permitted. Disable for units with a strict no-pets policy.

### Body template:

The lessee shall not keep or permit to be kept any animal, bird, reptile or other pet (hereinafter referred to as "pet" or "pets") in or upon the leased premises and/or the building and/or the property without the prior written consent of the lessor. Such consent, if granted, shall be subject to the following conditions –

the lessee shall be permitted to keep only such pet or pets as are described in Annexure D: Special Agreements, subject to any conditions recorded therein;

the lessee shall ensure that the pet or pets are at all times kept under proper control and supervision and shall not permit any pet to cause a nuisance, annoyance, danger or disturbance to other occupiers of the property or to any neighbours or to any person upon or in the vicinity of the property;

the lessee shall be liable for and shall make good any and all damage of whatsoever nature caused by the pet or pets to the leased premises and/or the building and/or the property and/or the common property, including but not limited to damage to carpets, flooring, doors, walls, gardens, lawns and fixtures, fair wear and tear excluded;

the lessee shall ensure that the leased premises and any garden or outside area used by the pet or pets are at all times kept in a clean, hygienic and sanitary condition. The lessee shall remove all animal waste immediately and shall be responsible for flea and tick treatment and any associated pest control at his/its own cost;

the lessee shall comply with all applicable municipal by-laws, regulations and legislation relating to the keeping of animals, including but not limited to licensing requirements, breed restrictions and limitations on the number of animals that may be kept at a residential property;

the lessee shall be liable for and hereby indemnifies the lessor, the lessor's agents, employees and other occupiers of the property against any and all claims, damages, losses, costs and expenses of whatsoever nature arising directly or indirectly from the keeping of the pet or pets on the leased premises and/or the property, including but not limited to claims arising from biting, scratching, allergic reactions or any other injury or damage caused by the pet or pets to any person or property;

should the pet or pets cause persistent nuisance, disturbance or damage, or should the lessee fail to comply with any of the conditions set out in {{self:0}}, the lessor shall be entitled to withdraw consent by giving the lessee fourteen days' written notice, whereupon the lessee shall remove the pet or pets from the leased premises within the said notice period;

the withdrawal of consent in terms of {{self:7}} shall not entitle the lessee to cancel this agreement or to claim any reduction in rental or any damages whatsoever.

In addition to the deposit referred to in {{ref:rental_deposit}}, the lessee shall, if so stipulated in Annexure D: Special Agreements, deposit with the lessor an additional amount as a pet deposit. Such pet deposit shall be held by the lessor as security for any damage caused by the pet or pets and shall be subject to the same terms and conditions as the deposit referred to in {{ref:rental_deposit}}, including the accrual of interest for the benefit of the lessee in accordance with the Rental Housing Act 50 of 1999. The pet deposit or the balance thereof plus interest thereon shall be refunded to the lessee within the period prescribed by the Rental Housing Act after the termination date, subject to any lawful deductions for damage caused by the pet or pets, fair wear and tear excluded.

The consent granted by the lessor in terms of {{self:0}} is personal to the lessee and to the specific pet or pets described in Annexure D: Special Agreements. The lessee shall not substitute, replace or introduce any additional pet or pets without the prior written consent of the lessor.

---

## 2. Parking (`parking`)

**Triggered by:** "Garage" or "Carport" unit feature
**Lease type:** both | **Enabled by default:** false | **Sort order:** 1070
**Depends on:** none

**Toggle label:** Unit includes allocated parking bay, carport or garage

**Description:** Governs allocated parking, access rights, vehicle restrictions, and parking bay conditions. Enable for units with a designated bay, garage or carport. Disable for units with no allocated parking or where parking is covered by the common property clause.

### Body template:

Where the lessee is allocated the use of a parking bay, garage or carport (hereinafter referred to as "the parking area") as described in Annexure D: Special Agreements, the following conditions shall apply –

the parking area shall be used solely for the parking of roadworthy, licensed motor vehicles as contemplated in the National Road Traffic Act, Act 93 of 1996, and shall not be used for the storage of goods, equipment, materials, boats, trailers, caravans or any other purpose without the prior written consent of the lessor;

the lessee shall not carry out or permit to be carried out any mechanical repairs, servicing, panel beating, spray painting or any similar work on any vehicle in the parking area or elsewhere on the property, save for emergency repairs of a minor nature;

the lessee shall not wash or permit the washing of any vehicle in the parking area or on any part of the property other than in such area as may be designated by the lessor for that purpose, if any;

the lessee shall not permit any oil, petrol, diesel, brake fluid, coolant or other noxious substance to leak from any vehicle parked in the parking area, and should any such leakage occur, the lessee shall be liable for the cost of cleaning and making good any damage to the surface of the parking area and/or any adjacent areas;

the lessee shall not permit any vehicle to be parked in such a manner as to obstruct the free flow of vehicular or pedestrian traffic on the property, or to obstruct the parking areas allocated to other occupiers of the property, or to obstruct access to any fire hydrant, fire escape, emergency exit, refuse area or any other area required to be kept clear;

the lessor shall not be responsible for the safekeeping or security of any vehicle or the contents thereof parked in the parking area, and the lessee hereby indemnifies the lessor against any claims of whatsoever nature arising from theft, damage or loss to any vehicle or the contents thereof, howsoever caused, whether by the negligence of the lessor, the lessor's agents or employees or otherwise;

the lessee shall ensure that the parking area is kept in a clean and tidy condition at all times and shall not store or permit the storage of any items therein other than the vehicle;

where the parking area comprises a garage, the lessee shall maintain the garage door and its mechanism in good working order and condition at his/its own cost, and shall be liable for the cost of any repairs or replacements required as a result of damage caused by the lessee or his/its visitors, fair wear and tear excepted;

the allocation of the parking area shall be personal to the lessee and shall not be sublet, assigned or otherwise transferred to any third party without the prior written consent of the lessor.

The rental payable in respect of the parking area, if applicable, shall be as set out in Annexure D: Special Agreements, and shall be payable in addition to and at the same time and in the same manner as the basic monthly rental referred to in {{ref:rental_deposit}}.

---

## 3. Alternative utilities (`utilities_alternative`)

**Triggered by:** "Solar" or "Borehole" unit feature
**Lease type:** both | **Enabled by default:** false | **Sort order:** 750
**Depends on:** `["electricity"]`

**Toggle label:** Property has solar, borehole, or other alternative utility installations

**Description:** Governs the use, maintenance, and metering of alternative utility installations such as solar panels, inverters, batteries, boreholes, and rainwater harvesting systems. Enable for properties with off-grid or supplementary utility infrastructure.

### Body template:

Where the leased premises and/or the property is equipped with one or more alternative utility installations, including but not limited to solar photovoltaic panels, solar inverters, battery storage systems, solar geysers, boreholes, rainwater harvesting tanks and associated pumps, filtration or purification systems (hereinafter collectively referred to as "the alternative utility installation" or "the installation"), the following provisions shall apply –

the lessee acknowledges that the installation is provided for the supplementary or alternative supply of electricity and/or water to the leased premises and that the lessor makes no warranty or representation as to the continuity, capacity, output or quality of the supply from the installation. The lessee shall at all times maintain a connection to the municipal supply of electricity and/or water as the primary supply, unless otherwise agreed in writing;

the lessee shall not interfere with, modify, disconnect, reconfigure or extend the installation or any part thereof without the prior written consent of the lessor. Any alteration to the installation shall be subject to the provisions of {{ref:alterations}} and shall be carried out only by a suitably qualified and accredited contractor approved by the lessor;

the lessee shall operate the installation in accordance with any operating instructions, user manuals or guidelines provided by the lessor or the installer. The lessee shall immediately notify the lessor of any malfunction, damage or defect in the installation;

the lessee shall be responsible for the routine maintenance of the installation to the extent specified in Annexure D: Special Agreements, which may include but shall not be limited to –
keeping solar panels free of debris, dirt and obstructions;
monitoring inverter and battery status indicators and reporting faults;
ensuring borehole pump and filtration systems are not run dry or beyond capacity;
maintaining rainwater tanks in a clean and hygienic condition.

Structural maintenance, major repairs, replacement of components, and any work requiring a qualified electrician or plumber shall be the responsibility of the lessor unless otherwise agreed in writing;

the lessor shall be responsible for ensuring that the installation complies with all applicable laws, regulations, by-laws and standards, including but not limited to the Electrical Installation Regulations, the Electrical Machinery Regulations, the National Building Regulations and any municipal requirements relating to solar installations or borehole registration and water use licences under the National Water Act, Act 36 of 1998;

the lessee shall not sell, distribute or permit the distribution of any electricity generated by a solar installation to any third party or to any premises other than the leased premises without the prior written consent of the lessor;

where a borehole is installed on the property, the lessee shall use borehole water responsibly and in compliance with any water use restrictions imposed by the relevant water services authority or the Department of Water and Sanitation. The lessee shall not use borehole water for any commercial purpose without the prior written consent of the lessor and such further authorisation as may be required in terms of the National Water Act;

the lessee shall not be entitled to any reduction in rental by reason of the installation failing to operate, producing insufficient output, or being unavailable for any reason, including maintenance, repair or replacement;

upon the termination of this agreement, the lessee shall return the installation to the lessor in the same good order and condition as at the commencement date, fair wear and tear excepted.

---

## 4. Telecommunications (`telecommunications`)

**Triggered by:** "Fibre" or "DSTV" unit feature
**Lease type:** both | **Enabled by default:** false | **Sort order:** 1080
**Depends on:** none

**Toggle label:** Property has fibre, satellite, or other telecommunications infrastructure

**Description:** Governs fibre optic connections, satellite installations, Wi-Fi infrastructure, and third-party telecommunications provider access to the premises. Enable for properties with existing fibre or satellite infrastructure, or where the tenant may wish to install telecommunications equipment.

### Body template:

Where the leased premises and/or the property is equipped with or connected to telecommunications infrastructure, including but not limited to fibre optic cables, satellite dishes, aerial antennae, Wi-Fi access points and associated routers, switches, cabling and junction boxes (hereinafter collectively referred to as "the telecommunications infrastructure" or "the infrastructure"), the following provisions shall apply –

the lessee shall be responsible for establishing and maintaining his/its own account with the relevant telecommunications service provider at his/its own cost. The lessor shall not be liable for any charges, fees or costs incurred by the lessee in respect of any telecommunications service;

the lessee shall not interfere with, damage, disconnect, modify or extend the infrastructure or any part thereof without the prior written consent of the lessor. Should the lessee wish to install any additional telecommunications equipment, including but not limited to satellite dishes, aerials, external antennae, cabling or network equipment, the lessee shall obtain the prior written consent of the lessor and such installation shall be subject to the provisions of {{ref:alterations}};

the lessor shall not be responsible for the continuity, speed, capacity, quality or availability of any telecommunications service provided by a third-party service provider and the lessee shall have no claim against the lessor for any interruption, degradation or failure of any such service, howsoever caused;

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

The lessee shall not use the infrastructure for any unlawful purpose, including but not limited to the distribution of pirated content, the operation of an unlicensed broadcasting service, or any activity which contravenes the Films and Publications Act, Act 65 of 1996, or the Electronic Communications and Transactions Act, Act 25 of 2002.

---

## Attorney review checklist

The following points require specific legal review:

### Pets clause
- [ ] **Pet deposit permissibility:** Confirm a separate pet deposit is permissible under the Rental Housing Act. Some interpretations suggest only one deposit is permitted per lease. If not permissible, the pet deposit sub-clause needs restructuring (e.g. increased main deposit with pet-earmarked portion).
- [ ] **Breed restrictions:** Municipal by-laws on breed restrictions are referenced generically. Confirm this is sufficient or whether specific dangerous breed legislation should be cited.
- [ ] **Withdrawal of consent (14 days):** Confirm 14 days is reasonable notice for pet removal under CPA fairness requirements.

### Parking clause
- [ ] **Vehicle indemnity scope:** The indemnity for vehicle theft/damage is broad and excludes lessor negligence. Confirm enforceability under CPA s48 where the lessee is a natural person — CPA may limit the scope of such indemnities.
- [ ] **National Road Traffic Act reference:** Confirm Act 93 of 1996 is the correct current citation.

### Alternative utilities clause
- [ ] **National Water Act compliance:** Confirm the borehole sub-clauses correctly state water use licensing requirements for domestic use. Domestic use up to "Schedule 1" limits does not require a licence, but irrigation and commercial use does — verify this distinction is adequately captured.
- [ ] **Solar feed-in restrictions:** The clause prohibits selling generated electricity without consent. Confirm this aligns with current municipal feed-in tariff regulations, which vary by municipality (e.g. City of Cape Town SSEG programme vs Stellenbosch).
- [ ] **Electrical Installation Regulations reference:** Confirm this is the correct reference for solar installation compliance.

### Telecommunications clause
- [ ] **Electronic Communications Act reference:** Confirm Act 36 of 2005 is the current citation and ICASA is the correct regulatory body reference.
- [ ] **Films and Publications Act reference:** Confirm Act 65 of 1996 is current, noting the Films and Publications Amendment Act 11 of 2019.

### All clauses
- [ ] **CPA s48 fairness test:** Confirm no clause term is unreasonable, unjust, or unconscionable under CPA s48, particularly the indemnity and liability limitation provisions in the pets and parking clauses.
- [ ] **Cross-references:** Confirm `{{ref:rental_deposit}}`, `{{ref:maintenance}}`, `{{ref:alterations}}`, and `{{ref:general}}` are the correct clause keys — these are required clauses always present in the generated lease.
- [ ] **Annexure D references:** All four clauses reference Annexure D: Special Agreements for unit-specific details. Confirm this is the correct annexure designation in the current lease template structure.

---

## Seed migration template

Once approved, create `supabase/migrations/011_optional_clauses_seed.sql` with the approved body text substituted into the `$$[APPROVED BODY TEXT HERE]$$` placeholders:

```sql
INSERT INTO lease_clause_library
  (clause_key, title, body_template, lease_type,
   is_required, is_enabled_by_default, sort_order,
   depends_on, description, toggle_label)
VALUES
('pets', 'Pets', $$...$$, 'both', false, false, 1050, '{}',
 'Governs the keeping of domestic animals, pet deposits, damage liability, and removal conditions.',
 'Tenant is permitted to keep animals on the premises'),
('parking', 'Parking', $$...$$, 'both', false, false, 1070, '{}',
 'Governs allocated parking, access rights, vehicle restrictions, and parking bay conditions.',
 'Unit includes allocated parking bay, carport or garage'),
('utilities_alternative', 'Alternative utilities', $$...$$, 'both', false, false, 750, '{"electricity"}',
 'Governs solar, borehole, and other alternative utility installations.',
 'Property has solar, borehole, or other alternative utility installations'),
('telecommunications', 'Telecommunications', $$...$$, 'both', false, false, 1080, '{}',
 'Governs fibre, satellite, and telecommunications infrastructure.',
 'Property has fibre, satellite, or other telecommunications infrastructure');
```

Then update `FEATURE_CLAUSE_MAP` in `lib/leases/featureClauseMap.ts` to add the new mappings:

```ts
"Pet-friendly":            ["pets"],
"Solar":                   ["utilities_alternative"],
"Borehole":                ["utilities_alternative"],
"Garage":                  ["parking"],
"Carport":                 ["parking"],
"Fibre":                   ["telecommunications"],
"DSTV":                    ["telecommunications"],
```
