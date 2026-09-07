# CRM Customer Domain Application Layer (Task 06)

This document outlines the architecture and implementation of the Core Customer Domain Application Layer.

## 1. TM Forum Distinction: Party vs. Customer

As established by TM Forum standards, the system strictly separates identity from the commercial relationship:
* **Party:** Represents an entity in the real world (e.g., *John Doe* or *Acme Corp*). A Party exists regardless of whether they buy anything. This lifecycle is managed in the `Party` domain.
* **Customer:** Represents the commercial relationship between that Party and the Telecom Service Provider. The `Customer` domain handles this lifecycle.

## 2. Customer Lifecycle Model

The Customer entity possesses its own commercial lifecycle, distinct from Party identity:
* `INACTIVE`
* `ACTIVE`
* `SUSPENDED`
* `TERMINATED` (Terminal State)

**Status Transitions:**
* A customer can freely move between `INACTIVE`, `ACTIVE`, and `SUSPENDED`.
* Any state can transition to `TERMINATED`.
* `TERMINATED` is terminal and cannot transition back to `ACTIVE`. A new commercial relationship requires creating a new Customer record.

## 3. Cardinality and Duplicate Policy

* **Rule:** A Party can have at most **one** `ACTIVE` or `SUSPENDED` Customer relationship within the same tenant.
* **Mechanism:** This is explicitly enforced at the database level via a partial unique index:
  ```sql
  CREATE UNIQUE INDEX uq_party_active_customer 
  ON customer (tenant_id, party_id) 
  WHERE status IN ('ACTIVE', 'SUSPENDED');
  ```
* This allows a Party to have multiple historical (`TERMINATED`) customer records, but never multiple active ones concurrently.

## 4. Tenant Isolation and Integrity

* Cross-tenant references are strictly prohibited at the database level.
* The `customer` table enforces a composite foreign key against the `party` table to guarantee that the Customer and Party exist within the same exact tenant:
  ```sql
  FOREIGN KEY (tenant_id, party_id) REFERENCES party(tenant_id, id)
  ```
* All Repository operations (`getCustomerById`, `createCustomer`) strictly require `tenantId`.

## 5. Domain Invariants and Application Logic

* **Party Eligibility:** Before creating a Customer, the application validates that the referenced Party exists, resides in the same tenant, and is not soft-deleted.
* **Temporal Semantics:** Basic effective dating is supported (`effectiveFrom` and `effectiveTo`). The application and database explicitly validate that `effectiveTo >= effectiveFrom`.
* **Immutable Fields:** The `id`, `tenantId`, and `partyId` fields are strictly immutable once the Customer is created. `UpdateCustomer` only permits modifying fields like categories and effective dates.

## 6. Transaction Boundaries

Customer creation reuses the `ITransactionManager` abstraction established in Task 05. 
The entire operation runs within a single PostgreSQL `BEGIN`/`COMMIT` transaction. If the Party validation fails, or if the database rejects the cardinality index, the transaction cleanly rolls back.

## 7. Testing Strategy

* **Unit Tests (`customer.test.ts`):** Validates transition logic (e.g., preventing recovery from `TERMINATED`), temporal validation, and Party eligibility rules using isolated mocks.
* **Integration Tests (`customer_db.test.ts`):** Validates the real PostgreSQL behaviors:
  1. Composite FK cross-tenant protection successfully rejects invalid inserts.
  2. The unique partial index properly triggers `CustomerAlreadyExistsError` on duplicate active relationships.
  3. `TERMINATED` customers safely persist historically without blocking the creation of new relationships.

## 8. Known Limitations & Future Tasks

* **Customer Accounts:** The Customer entity currently holds the commercial relationship status but does not manage financial or billing buckets. That is the responsibility of the `Customer Account` domain, which will be implemented next.
* **No Cascading Deletion:** Terminating a Customer does **not** delete the Party. Both records persist.
* **No APIs yet:** REST APIs, Express integration, and JWT authentication will follow in later phases.
