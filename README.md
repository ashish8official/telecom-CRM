# Telecom CRM

![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue.svg)
![Jest](https://img.shields.io/badge/Jest-Tested-brightgreen.svg)

An enterprise-grade, multi-tenant Telecom Customer Relationship Management (CRM) platform, designed with a strict modular monolith architecture and aligned with TM Forum concepts. 

This repository acts as an independent, standalone service that handles customer, party, and account management. It integrates with the external Product Catalogue strictly over HTTP via TMF620 REST APIs.

## 🏗️ Architecture

* **Modular Monolith:** Internal code is strictly separated into bounded domains (e.g., `Party`, `Customer`, `Account`). 
* **Layered Design:** Follows Domain-Driven Design (DDD) principles:
  * `Domain`: Business rules, entities, custom errors, and repository contracts.
  * `Application`: Orchestrates use cases, input validation, and database transaction boundaries.
  * `Infrastructure`: Concrete PostgreSQL database implementations and infrastructure adapters.
* **Multi-Tenancy:** Row-based tenancy utilizing composite foreign keys `(tenant_id, id)` globally to guarantee tenant isolation at the database level.
* **API First:** (Upcoming) Adheres to TM Forum Open APIs for external integrations.

## 🚀 Tech Stack

* **Runtime:** Node.js
* **Language:** TypeScript
* **Database:** PostgreSQL (via `pg` native client - NO heavy ORMs)
* **Testing:** Jest (Unit & Database Integration Tests)
* **Migrations:** Custom lightweight, transaction-safe migration runner (`migrate.js`)

## 📁 Project Structure

```text
telecom-CRM/
├── backend/
│   ├── application/     # Use cases and transaction boundaries
│   ├── domain/          # Business logic, types, and repository interfaces
│   ├── infrastructure/  # PostgreSQL repositories and DB clients
│   └── tests/           # Unit and Integration test suites
├── database/
│   ├── functions/       # Shared DB functions (e.g., trigger functions)
│   ├── migrations/      # Sequential SQL schema migrations
│   ├── rollbacks/       # Reversible down-migrations
│   ├── seeds/           # Deterministic development seed data
│   ├── migrate.js       # Custom migration runner
│   └── rollback.js      # Custom rollback runner
├── docs/                # Architectural Decision Records (ADRs) and Task histories
```

## ⚙️ Local Setup

### 1. Prerequisites
* Node.js (v18+)
* PostgreSQL (v14+) running locally or via Docker

### 2. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/ashish8official/telecom-CRM.git
cd telecom-CRM
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root directory (refer to `.env.example`):
```bash
cp .env.example .env
```
Ensure your `DATABASE_URL` and `DEFAULT_DATABASE_URL` point to your local PostgreSQL instance.

## 🗄️ Database Management

The project uses a custom, transaction-safe SQL migration framework.

* **Run Migrations:** Applies all pending `.sql` files in `database/migrations/`
  ```bash
  npm run db:migrate
  ```
* **Rollback Migrations:** Reverts the last `N` migrations (default is 1)
  ```bash
  npm run db:rollback
  # Or target a specific step count: node database/rollback.js 2
  ```
* **Seed Database:** Injects deterministic base data (`DEMO_TELCO`, demo parties)
  ```bash
  npm run db:seed
  ```

## 🧪 Testing

The test suite includes both isolated unit tests and live PostgreSQL integration tests.

* **Run all tests (Unit & Integration):**
  ```bash
  npm run test
  ```
* **Run Database Integration Tests specifically:**
  ```bash
  npm run test:db
  ```
  *(Note: Integration tests require a running database and execute safely against isolated test tenant boundaries).*

## 📚 Documentation & History

Extensive architectural constraints and design decisions are logged in the `/docs` directory:
* [Task 01: CRM Analysis & Catalogue Discovery](./docs/CRM_TASK_01_ANALYSIS.md)
* [Task 02: Architecture & Integration Constraints](./docs/CRM_TASK_02_ARCHITECTURE_CONSTRAINTS.md)
* [Task 03: Data Model Architecture Decisions](./docs/CRM_TASK_03_DATA_MODEL_REVIEW.md)
* [Task 04: Database Foundation & Migrations](./docs/CRM_TASK_04_DATABASE_FOUNDATION.md)
* [Task 05: Core Party Domain Layer](./docs/CRM_TASK_05_PARTY_DOMAIN.md)

---
*Built for enterprise scale, stability, and TM Forum compliance.*
