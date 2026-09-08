# Telecom CRM Engine

A modern, multi-tenant, domain-driven Customer Relationship Management (CRM) backend explicitly designed for the telecommunications industry. 

This repository serves as the core source of truth for **Party**, **Customer**, **Account Hierarchy**, and **Subscriber** relationships. It is strictly architected as a standalone, bounded context—it focuses entirely on the commercial and structural relationships of customers and explicitly defers commercial product configuration (Product Catalogue), order orchestration (OM), and technical network asset management (Inventory/Provisioning) to their respective domains.

---

## 🏗 Core Architectural Principles

- **Domain-Driven Design (DDD):** Organized into strict `domain`, `application`, and `infrastructure` layers. The domain model remains pure and completely unaware of PostgreSQL, Express, or TM Forum API mapping schemas.
- **Strict Multi-Tenancy:** True horizontal multi-tenancy. Every table uses a composite primary key (`tenant_id`, `id`). All repositories enforce tenant boundaries at the query level.
- **Atomic Operations:** Critical lifecycle events (e.g., Subscriber status changes) are bundled in strict ACID transactions containing both the state mutation and immutable history log records.
- **Concurrency & Idempotency:** Optimistic locking (`version` column) handles concurrent write collisions safely. Upstream retries are protected via `idempotency_key` constraints.
- **Anti-Corruption Layer (ACL):** External market configurations (such as those from a Product Catalogue) are decoupled from the CRM through stable geographic identifiers rather than hardcoded shared database dependencies.

---

## 🎯 Implemented Domains (Task 01 - Task 09)

The CRM currently supports the following core domains:

1. **Party Domain** (`Individual`, `Organization`)
   - Distinguishes the legal or physical entity from the commercial relationship.
2. **Customer Domain**
   - Represents the commercial relationship. Ensures active uniqueness rules (e.g., a Party can only have one active Customer profile per tenant).
3. **Customer Account Domain**
   - Supports robust enterprise account hierarchies.
   - Enforces `MASTER` vs. `CHILD` account logic (e.g., billing responsibility strictly belongs to the Master account, preventing cross-tenant or self-parenting hierarchy loops).
4. **Geographic & Market Context Contract**
   - The CRM holds "Customer Facts" (e.g., `GeographicLocationReference`), explicitly pushing "Commercial Rules" out to the Product Catalogue to evaluate eligibility without duplicating logic.
5. **Telecom Subscriber Domain**
   - The logical representation of a service relationship (`GSM PREPAID`, `FWA POSTPAID`).
   - Maintains an explicit lifecycle (`PENDING` ➔ `ACTIVE` ➔ `SUSPENDED` / `BARRED` ➔ `DISCONNECTED` ➔ `TERMINATED`).
   - Automatically resolves ultimate billing accounts across infinite child-account hierarchies.
   - *Note: Subscribers are explicitly NOT physical resources. (MSISDN, IMSI, SIM concepts belong in an Inventory Domain, which will attach to the Subscriber later).*

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** (v18+)
- **PostgreSQL** (v14+)
- **TypeScript** 

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/ashish8official/telecom-CRM.git
   cd telecom-CRM
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment:**
   Set up your connection variables in a `.env` file at the root.
   ```env
   DATABASE_URL=postgres://postgres:admin@localhost:5433/crm_db
   ```

4. **Run Database Migrations:**
   Ensure your database is running and execute the migration script to apply all schema tables, constraints, and indexes.
   ```bash
   npm run db:migrate
   ```

### Testing

The system separates unit logic from infrastructure validations. 
- **Unit Tests:** `npm run test:unit`
- **Integration Tests:** `npm run test:integration` (Requires active local PostgreSQL database)
- **All Tests:** `npm run test:all`

---

## 📂 Project Structure

```text
telecom-CRM/
├── backend/
│   ├── application/     # Application Use Cases (Commands/Queries)
│   ├── domain/          # Pure Domain Entities, Types, and Errors
│   ├── infrastructure/  # PostgreSQL Repositories, Database Transactions
│   └── tests/           # Unit & Integration Test Suites
├── database/
│   ├── migrations/      # Sequential .sql schema up-migrations
│   └── rollbacks/       # Sequential .sql schema down-migrations
├── docs/                # Architectural Decision Records & Task Definitions
└── package.json
```

---

## 🛤 Future Integrations (Explicit Non-Goals Currently)
To ensure system boundaries remain clean, the following capabilities are explicitly deferred for later integration architectures:
- **Telecom Resource Inventory:** Physical SIMs, ICCIDs, IMSIs, and MSISDN mapping.
- **Product Offerings & Subscriptions:** Attaching a Subscriber to a Product Catalogue Offering.
- **Network Provisioning:** HSS/HLR/PCRF interactions.
- **Billing & Rating Engine:** Invoice generation, tax calculation, and event rating.
- **External Interfaces:** Native TM Forum Open API REST Adapters (TMF 629, TMF 632, etc.) will be wrapped in an adapter layer over these core use cases.
