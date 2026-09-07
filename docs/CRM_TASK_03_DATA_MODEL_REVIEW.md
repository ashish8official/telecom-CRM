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
*End of Document. Awaiting approval before proceeding to implementation / migrations.*
