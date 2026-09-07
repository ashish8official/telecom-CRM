# CRM Party Domain Application Layer (Task 05)

This document outlines the architecture and implementation of the Core Party Domain Application Layer.

## 1. Layer Architecture

The backend establishes a strict layered modular monolith architecture:
* **Domain Layer (`backend/domain/party`):** Owns business rules, entity interfaces (`Party`, `Individual`, `Organization`), custom domain errors, and repository contracts. No infrastructure or HTTP code exists here.
* **Application Layer (`backend/application/party`):** Owns use cases (`CreateIndividualParty`, `GetParty`, `ChangePartyStatus`, etc.) and orchestrates transactions. It validates inputs and enforces business logic via the Domain layer.
* **Infrastructure Layer (`backend/infrastructure`):** Provides the concrete implementations. `PostgresPartyRepository` implements database persistence using parameterized SQL queries. `PostgresTransactionManager` ensures safe database transactions.

## 2. Domain Model

We implemented a robust Party domain without relying on ORM bloat:
* Base `Party` defines `id`, `tenantId`, `partyType`, `status`, and timestamps.
* `Individual` extends `Party` with name/demographics.
* `Organization` extends `Party` with corporate details.

## 3. Repository Port
`IPartyRepository` strictly separates Postgres-specific syntax from the application logic. 
* All operations explicitly enforce the `tenantId` boundary. (e.g., `getParty(tenantId, partyId)`).
* Soft-deleted records are automatically filtered out of typical read queries (`deleted_at IS NULL`).

## 4. Transaction Boundary
The application handles transactions via an `ITransactionManager` interface.
Example pattern used in `CreateIndividualParty`:
```typescript
const tx = await this.txManager.beginTransaction();
try {
    const individual = await this.repo.createIndividual(tenantId, data, tx);
    await tx.commit();
} catch (err) {
    await tx.rollback();
    throw err;
} finally {
    tx.release();
}
```
This guarantees atomicity across the base `party` table and subtype extensions (`individual`/`organization`).

## 5. Domain Invariants Enforced
* **Rule A:** Only `INDIVIDUAL` and `ORGANIZATION` are valid `partyType`s.
* **Rule B/C/D:** The application strictly bundles `Party` + `Subtype` insertion within a single transaction. (An integration test actively forces a subtype failure to verify that the base `Party` row is properly rolled back).
* **Rule E:** All actions mandate a `tenantId`.
* **Rule F:** Soft-deleted records are completely hidden from retrieval, mutation, and status transition paths.

## 6. Error Hierarchy
We established a clean error inheritance tree derived from `DomainError`:
* `ValidationError`
* `PartyNotFoundError`
* `InvalidPartyTypeError`
* `PartyDeletedError`
* `InvalidPartyStateTransitionError`

These carry stable, machine-readable codes without leaking PostgreSQL errors to upper layers.

## 7. Duplicate Detection Boundary
A lightweight informational duplicate detection hook was integrated.
Currently, it performs exact-match lookups based on Name or Legal Name before creation, logging a warning rather than blocking execution entirely (Phase 1 design). This extensible boundary can plug into external MDM engines or fuzzy matching down the line.

## 8. Soft Delete Behavior
The `DeleteParty` use case mutates `deletedAt`. It does not physically DROP the row. 
All queries in the repository filter out `deleted_at IS NOT NULL`, meaning a deleted party is effectively invisible to the application without disrupting historical relational integrity in the DB.

## 9. Status Transition Policy
Status transitions run through a dedicated `ChangePartyStatus` use case, explicitly preventing erratic state jumps:
* `ACTIVE` ➜ `SUSPENDED` or `TERMINATED`
* `SUSPENDED` ➜ `ACTIVE` or `TERMINATED`
* `TERMINATED` ➜ Terminal (cannot change)

## 10. Testing Strategy
* **Unit Tests (`party.test.ts`):** Validated use-case logic and errors using mock repositories and mock transactions.
* **Database Integration Tests (`party_db.test.ts`):** Tested the live PostgreSQL database to ensure atomicity, tenant isolation, and soft-delete enforcement against physical queries. All tests run safely against isolated tenant IDs (`INT_A`, `INT_B`).

## 11. Known Limitations & Future Evolution
* **REST APIs / Express:** Intentionally excluded in this phase to harden the backend domain logic independently.
* **Authentication:** Audit actors (`createdBy`/`updatedBy`) are passed manually into the use cases. Future tasks will introduce HTTP middleware to extract `actorId` securely from JWTs.
* **REST/HTTP Error Mapping:** Mapping `PartyNotFoundError` to `404` and `ValidationError` to `400` will occur when the Express controllers are developed.

---
### Architecture Flow
```text
Use Case (CreateIndividualParty)
   ↓
Domain Validation (Tenant Check, Required Fields, Duplicate Hook)
   ↓
TransactionManager (BEGIN)
   ↓
Repository Port (IPartyRepository)
   ↓
PostgresPartyRepository (Executes Parameterized SQL)
   ↓
Database (crm_db)
```
