# CRM Data Model Technical Review & Domain Validation (Task 03)

## 1. Objective & TM Forum Alignment Strategy
This document serves as the foundational architectural review of the proposed Telecom CRM database schema before implementation. The goal is conceptual alignment with TM Forum principles (TMF629, TMF632, TMF666) without strictly mirroring TMF JSON payloads into relational database tables.

The CRM database will be a normalized PostgreSQL schema, highly decoupled from the TMF API adapter layer. 

---

## 2. Explicit Architecture Decisions

### 2.1 Party vs Customer Modeling
* **Decision:** `Customer` is a **role** played by a `Party`, modeled as a separate entity linked to `Party`.
* **Rationale:** A `Party` (the real-world Individual or Organization) can exist without being a `Customer` (e.g., they might just be a Prospect, a Vendor, or an Employee). A `Customer` entity explicitly represents the commercial relationship with the service provider and must reference a `party_id`. This allows one Party to have multiple Customer profiles (e.g., across different brands in a multi-tenant setup) or play multiple roles over time.

### 2.2 Customer Account Ownership
* **Decision:** `Customer Account` belongs to a `Customer`, not directly to a `Party`.
* **Rationale:** The billing and commercial aggregation boundary is the Customer Account. `Customer` → `Customer Account` ensures that billing contexts are strictly tied to the commercial relationship, not just the physical identity. A `Customer` can own multiple `Customer Accounts` (e.g., one for Mobile, one for Broadband).

### 2.3 Multi-Tenant FK Strategy
* **Decision:** Strict Composite Foreign Keys: `(tenant_id, id)` for all tenant-scoped data.
* **Rationale:** Every CRM table will have a `tenant_id`. To prevent cross-tenant data leaks at the database level, parent tables will have a `UNIQUE (tenant_id, id)` constraint. Child tables will define their foreign keys as `FOREIGN KEY (tenant_id, parent_id) REFERENCES parent(tenant_id, id)`.

### 2.4 Identifier Strategy
* **Decision:** UUIDv4 for internal primary keys.
* **Rationale:** Sequential integers expose business volume and are harder to merge across systems. UUIDs are safe for distributed systems. External identifiers (like legacy system IDs) will be handled in a dedicated `external_identifier` table, not as primary keys.

### 2.5 Consent vs Preference
* **Decision:** Explicitly distinct entities. `Consent` is immutable and auditable; `Preference` is mutable state.
* **Rationale:** 
  * `Customer Preference`: "I prefer communication in Spanish via Email." (Mutable, upsertable).
  * `Consent`: "On [Date], user accepted Marketing terms via [Channel] (Reference: X)." (Append-only/auditable. Revocation creates a new record or updates a `withdrawn_at` timestamp on the specific consent record).

### 2.6 Polymorphic Table Strategy (`status_history`, `external_identifier`)
* **Decision:** Retain polymorphic design but enforce safety via `CHECK` constraints on `entity_type`.
* **Rationale:** Creating `customer_status_history`, `account_status_history`, etc., causes table bloat. A central `status_history(tenant_id, entity_type, entity_id, ...)` is highly reusable. 
* **Mitigation:** Lack of native FKs is mitigated by strict application layer boundaries and database `CHECK (entity_type IN ('CUSTOMER', 'PARTY', 'ACCOUNT'))`.

### 2.7 Soft Delete Policy
* **Decision:** Soft Delete (`deleted_at`) for root entities (Party, Customer, Account); Hard Delete for associative/transient data.
* **Rationale:** Root entities have extensive relational graphs and audit/compliance requirements preventing hard deletion. Associative data (like a contact link) can be hard deleted to keep the DB clean, provided history is tracked via audit logs if needed.

### 2.8 Temporal/History Strategy
* **Decision:** Explicit distinction between Technical Time (`created_at`, `updated_at`) and Business Time (`effective_from`, `effective_to`).
* **Rationale:** Audit requires knowing when a record was saved (`created_at`), but business logic requires knowing when a state change actually applies (e.g., scheduling an account suspension for next week using `effective_from`).

### 2.9 Status Lifecycle Strategy
* **Decision:** DB `CHECK` constraints for valid enumerations; Application layer for valid transitions.
* **Rationale:** The database enforces that `status` is one of `('ACTIVE', 'SUSPENDED', 'TERMINATED')`. The application state machine enforces that `TERMINATED -> ACTIVE` is illegal.

### 2.10 Contact Model Strategy
* **Decision:** Normalized `Contact Medium` entity linked via a junction table `Party Contact Role`.
* **Rationale:** A Party can have multiple emails or phones. An email might be used for "BILLING" and "TECHNICAL" purposes. Hardcoding `email_1`, `email_2` in the Party table is an anti-pattern.

---

## 3. Recommended Entity Relationship Model

```text
                        ┌──────────────────────┐
                        │      Tenant (PK)     │
                        └──────────┬───────────┘
                                   │
                 ┌─────────────────▼─────────────────┐
                 │               Party               │ (Base Entity)
                 │  - id, tenant_id, party_type      │
                 └─────────┬────────────────┬────────┘
                           │                │
            ┌──────────────▼─┐            ┌─▼──────────────┐
            │   Individual   │            │  Organization  │ (1:1 Extension Tables)
            └──────────────┬─┘            └─┬──────────────┘
                           │                │
                           ├────────────────┤
                           │
                 ┌─────────▼─────────────────────────┐
                 │             Customer              │ (Commercial Role)
                 └─────────┬───────────────────┬─────┘
                           │                   │
            ┌──────────────▼───────┐     ┌─────▼───────────────┐
            │   Customer Account   │     │ Customer Preference │
            └──────────────┬───────┘     └─────────────────────┘
                           │
                           ├─── Account Contact (Role mapping)
                           │
                  ┌────────▼─────────┐
                  │ External System  │ (e.g. Billing System ID)
                  │ Identifier Map   │
                  └──────────────────┘

(Globally Linked / Polymorphic Entities)
 - Contact Medium (Linked to Party via Party Contact Role)
 - Consent (Linked to Party or Customer)
 - Status History (entity_type, entity_id)
 - Party Relationship (party_id_1, party_id_2, relationship_type)
```

---

## 4. PostgreSQL Physical Design Review

### JSONB Usage
* **Policy:** Avoid JSONB for core relationships or searchable business facts (e.g., status, types, foreign keys). 
* **Allowed Use Cases:** Storing unstructured external payloads (e.g., `consent_evidence_payload`), or rare dynamic extension attributes that are never queried/filtered on.

### Indexing Strategy
* **Tenant Isolation:** `CREATE INDEX idx_entity_tenant ON entity(tenant_id, id);`
* **Polymorphic Lookup:** `CREATE INDEX idx_status_history_entity ON status_history(tenant_id, entity_type, entity_id);`
* **External Lookups:** `CREATE UNIQUE INDEX idx_ext_id ON external_identifier(tenant_id, source_system, identifier_type, identifier_value);`

---

## 5. Schema Change Register (Risk & Recommendations)

| Conceptual Entity | Identified Risk / Issue | Recommendation | Reason | Priority |
| :--- | :--- | :--- | :--- | :--- |
| **Party** | Storing Individual/Org attributes in one fat table creates sparse nulls. | Split into `party`, `individual`, `organization` (Class Table Inheritance). | Ensures strict NOT NULL constraints for specific party types (e.g., `last_name` for Individual). | CRITICAL |
| **Customer** | Conflating Customer with Party prevents multi-brand or B2B2C modeling. | Extract `customer` as a separate table with `party_id` FK. | Allows one Party to hold multiple Customer relationships over time. | CRITICAL |
| **Preferences & Consent** | Treating them as the same table prevents strict auditing of legal consent. | Create `customer_preference` (mutable) and `consent` (immutable, append-only). | Regulatory compliance (GDPR, etc.) requires strict audit trails for consent, not just the latest state. | HIGH |
| **Status History** | Adding history triggers to every table is bloated and hard to query. | Use a centralized polymorphic `status_history` table. | Simplifies timeline generation for the Customer 360 UI. | MEDIUM |
| **Identifiers** | Using email/phone as PK makes updates impossible. | Use `UUID` for PK. Store email/phone in `contact_medium`. | Contact details change; primary identity references must remain stable. | CRITICAL |
| **External IDs** | Mapping to multiple legacy systems via columns (`legacy_id_1`). | Create `external_identifier` table with `source_system` and `identifier_value`. | Supports N-number of external system integrations without schema changes. | HIGH |


---

## 6. Task 03.1 Decision Refinements

The following architectural decisions have been refined prior to implementation.

### 6.1 Party → Customer Cardinality
* **Final Decision:** A Party may have **at most one active Customer relationship per tenant**.
* **Rationale & Strategy:** To prevent accidental duplication, a partial unique index will be enforced: `CREATE UNIQUE INDEX idx_unique_active_customer ON customer(tenant_id, party_id) WHERE deleted_at IS NULL;`. This allows keeping historical soft-deleted customer profiles for a party, while ensuring only one active profile exists.

### 6.2 Consent Lifecycle Refinement
* **Final Decision:** Consent is not strictly "immutable rows", but follows an auditable lifecycle. 
* **State Model:** `GRANTED`, `ACTIVE`, `WITHDRAWN`, `EXPIRED`.
* **Required Fields:** `capture_timestamp`, `withdrawal_timestamp`, `capture_channel`, `evidence_reference`, `recorded_by`.
* **Rationale:** Changes to consent (like revocation) update the existing row's status and `withdrawal_timestamp`. Auditability is preserved via application-level event sourcing or strict audit triggers, rather than forcing the `consent` table itself to be append-only.

### 6.3 Status History Integrity Review
* **Final Decision:** Abandon the generic polymorphic `status_history` table in favor of **domain-specific status history tables** (e.g., `customer_status_history`, `account_status_history`).
* **Alternatives Considered:** Polymorphic `status_history(entity_type, entity_id)`.
* **Trade-offs:** Polymorphism reduces table count but sacrifices referential integrity (cannot enforce FK on `entity_id`). Domain-specific tables guarantee strict database-level foreign key constraints, which is critical for an enterprise CRM's core lifecycle auditing.

### 6.4 Contact Model Simplification
* **Final Decision:** Remove the `Party Contact Role` junction abstraction. Use a direct 1:N relationship from `Party` to `Contact Medium`.
* **Structure:** `Contact Medium` will directly contain `party_id`, `medium_type` (e.g. Email), `value`, `purpose` (e.g. `PERSONAL`, `BILLING`), `preferred_flag`, `verification_status`, and validity dates.
* **Trade-offs:** Eliminating the junction table reduces over-normalization and simplifies queries. A single medium (e.g. an email used for both BILLING and TECHNICAL) can be handled by duplicating the record with a different purpose, or by making purpose an array, but standard row duplication is simpler for Phase 1.

### 6.5 External Identifier Ownership
* **Final Decision:** Use **Entity-specific external identifier tables** (e.g., `customer_external_identifier`, `account_external_identifier`).
* **Alternatives Considered:** Polymorphic `external_identifier`.
* **Trade-offs:** Like status history, prioritizing strict foreign key integrity over table-count reduction is crucial for integration-critical identifiers. 

### 6.6 UUID Strategy Alignment
* **Final Decision:** **UUIDv4**.
* **Rationale:** Aligns with the existing Product Catalogue ecosystem. While UUIDv7 provides better index locality, ecosystem consistency and operational simplicity take precedence for Phase 1.

### 6.7 Soft Delete & Uniqueness Policy
* **Final Decision:** 
  * **Locally reusable identifiers** (e.g., Mobile, Email in `Contact Medium`) can be reused if the previous owner is soft-deleted. Enforced via partial unique indexes: `UNIQUE(value) WHERE deleted_at IS NULL`.
  * **Globally non-reusable identifiers** (e.g., `Customer Account Number`, `External Identifiers`) remain locked forever to prevent severe integration collisions. Enforced via standard unique constraints ignoring `deleted_at`.

### 6.8 Duplicate Management Baseline
* **Final Decision:** Phase 1 implements exact duplicate prevention only.
* **Phase 1 Implementation:** Exact matching on database uniqueness (partial unique indexes), search indexes for lookup before creation, and external identifier uniqueness.
* **Future Evolution Path:** True Master Data Management (MDM), fuzzy matching, golden records, and merge workflows are deferred to future phases.

---
*End of Document. Awaiting approval before proceeding to implementation / migrations.*
