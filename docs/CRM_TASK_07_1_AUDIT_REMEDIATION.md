# TELECOM CRM — TASK 07.1: AUDIT REMEDIATION

## OBJECTIVE

Perform a targeted surgical hardening of the existing Telecom CRM architecture based on the Task 01-07 Audit. Focus was placed strictly on architectural, database performance, type-safety, and test reliability issues before moving on to the Subscriber domain.

## Changes Made

### Database Relationship Indexes
* **Issue:** Missing foreign key indexes on `customer` and `customer_account` tables resulting in sequential scans.
* **Root Cause:** PostgreSQL does not auto-create indexes on foreign keys.
* **Fix:** Created migration `010_audit_remediation_indexes.sql` to add missing indexes.
* **Files Changed:** `database/migrations/010_audit_remediation_indexes.sql`, `database/rollbacks/010_audit_remediation_indexes_down.sql`
* **Validation:** Verified migration executes correctly.

### Redundant Index Removal
* **Issue:** Explicit index `idx_party_tenant` duplicated the unique constraint `uq_party_tenant_id`.
* **Root Cause:** Accidental duplication during table index assignments.
* **Fix:** Added `DROP INDEX` instruction to `010_audit_remediation_indexes.sql`.
* **Files Changed:** `database/migrations/010_audit_remediation_indexes.sql`, `database/rollbacks/010_audit_remediation_indexes_down.sql`
* **Validation:** Verified via DB migration success.

### Shared Domain Kernel
* **Issue:** Shared abstractions (`DomainError`, `ITransaction`) were isolated inside the `party` domain instead of a common location.
* **Root Cause:** Code organic growth from Task 05 where Party was the first implemented domain.
* **Fix:** Migrated shared entities into `backend/domain/common/`.
* **Files Changed:** Created `backend/domain/common/errors/*` and `backend/domain/common/transaction/*`. Updated imports globally across all domains, applications, repositories, and tests.
* **Validation:** TypeScript compiled with no missing module errors.

### Typed Creation Inputs
* **Issue:** Entity creation operations accepted `Partial<DomainEntity>`, skipping compile-time guarantees for required fields.
* **Root Cause:** Initial fast-prototyping pattern in Party domain.
* **Fix:** Introduced strictly typed `CreateIndividualInput` and `CreateOrganizationInput` and replaced partial usages.
* **Files Changed:** `PartyTypes.ts`, `PartyRepository.ts`, `CreateIndividualParty.ts`, `CreateOrganizationParty.ts`, tests.
* **Validation:** Compiles strictly via `npx tsc --noEmit`.

### Typed Duplicate Criteria
* **Issue:** Type `any` used in `findPotentialDuplicates()`.
* **Root Cause:** Bypassed strong typing during duplicate detection implementation.
* **Fix:** Created `IndividualDuplicateCriteria` and `OrganizationDuplicateCriteria` unified under `DuplicateCriteria` type.
* **Files Changed:** `PartyTypes.ts`, `PartyRepository.ts`, `PostgresPartyRepository.ts`.
* **Validation:** Checked and passed with TypeScript compile.

### Repository Row Mapping
* **Issue:** `PostgresPartyRepository.ts` used `...partyRes.rows[0]` spreading snake_case columns.
* **Root Cause:** Convenience spreading bypassed proper object boundary creation.
* **Fix:** Introduced explicit row mappers `mapToParty`, `mapToIndividual`, and `mapToOrganization`.
* **Files Changed:** `PostgresPartyRepository.ts`.
* **Validation:** Exposing this actually revealed integration test setup bugs where raw parties were injected without individuals. The tests were subsequently fixed.

### Integration Test Isolation
* **Issue:** Order-dependent execution in `customer_db.test.ts`.
* **Root Cause:** Test 3 reused the state created in Test 2.
* **Fix:** Updated test suites to construct their distinct test data entities inside their scope.
* **Files Changed:** `customer_db.test.ts`, `customer_account_db.test.ts`.
* **Validation:** `npm run test:integration` successfully executes standalone.

### Transaction Rollback Validation
* **Issue:** Invalid rollback test in `customer_db.test.ts` threw on application validation rather than actual DB-layer transaction error.
* **Root Cause:** Passed an empty ID string rather than triggering a true repository write failure.
* **Fix:** Relocated the atomicity test logic effectively to `party_db.test.ts`. Invoked `CreateIndividualParty` passing an invalid field (length limit violation) that correctly inserts `party` then fails on `individual`, triggering a verifiable rollback.
* **Files Changed:** `party_db.test.ts`, `customer_db.test.ts`.
* **Validation:** Successfully triggered DB code 22001 and asserted proper rollback mechanics.

### Critical Use Case Tests
* **Issue:** Missing unit coverage for `UpdateParty`, `GetCustomerByParty`, `GetCustomerAccount`, `UpdateCustomerAccount`.
* **Root Cause:** Missed coverage in prior iteration.
* **Fix:** Added missing Jest test suites.
* **Files Changed:** `party.test.ts`, `customer.test.ts`, `customer_account.test.ts`.
* **Validation:** Unit tests pass perfectly.

### Test Command Separation
* **Issue:** A single `npm test` script executed both unit and integration contexts.
* **Root Cause:** Missing CI differentiation.
* **Fix:** Modified `package.json` to feature `test:unit`, `test:integration`, and `test:all`.
* **Files Changed:** `package.json`.
* **Validation:** Checked execution boundaries via terminal.

## Explicit Non-Changes
The following items identified in the audit were intentionally deferred as they fall outside the scope of surgical remediation or require dedicated design tasks:
* Customer lifecycle unique constraint semantics
* DB-level cross-customer hierarchy enforcement 
* Migration checksum system
* `deleted_by` audit expansion
* Temporal `CURRENT_DATE` DB constraints
* Enterprise observability infrastructure
* Authentication/authorization
