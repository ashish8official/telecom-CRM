<div align="center">
  
# 🌐 Open Telecom CRM Engine

**An enterprise-grade, multi-tenant, domain-driven CRM backend purpose-built for modern telecommunications and BSS architectures.**

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Jest Tests](https://img.shields.io/badge/Tested_with-Jest-C21325?style=for-the-badge&logo=jest&logoColor=white)](https://jestjs.io/)
[![Architecture](https://img.shields.io/badge/Architecture-DDD-success?style=for-the-badge)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

*Built to decouple telecom commercial relationships from legacy monolithic inventory and billing traps.*

---

</div>

## 💡 The Problem it Solves
Most telecom Business Support Systems (BSS) suffer from massive architectural coupling—where a single "Customer" table is tangled with physical SIM cards, network resources, and hardcoded billing logic. 

**Open Telecom CRM** solves this by enforcing strict **Domain-Driven Design (DDD)**. It is a highly scalable, headless engine that manages the commercial relationship structure (Parties, Customers, Account Hierarchies, and Subscribers) completely independent of network inventory, product catalogues, and rating engines.

---

## ✨ Enterprise Features

*   🏢 **True Horizontal Multi-Tenancy:** Strict row-level composite key isolation (`tenant_id`, `id`) baked into every table and repository. No cross-tenant data leaks.
*   🏗️ **Pure Domain-Driven Design (DDD):** Completely isolated `domain`, `application`, and `infrastructure` layers. The core business rules are unaware of the database or APIs.
*   🔒 **Safe Concurrency:** Optimistic locking (`version` columns) on all critical lifecycle entities prevents lost updates during concurrent provisioning calls.
*   🛡️ **Idempotent by Default:** Built-in `idempotency_key` handling protects against retry-storms from upstream Order Management (OM) systems.
*   📦 **Infinite Account Hierarchies:** Native support for recursive Master/Child enterprise account structures with automated Ultimate Billing Account resolution.
*   📜 **Atomic Audit Trails:** Every lifecycle state change (e.g., Subscriber `ACTIVE` ➔ `SUSPENDED`) executes within strict ACID transactions alongside its historical audit record.

---

## 🗺️ Domain Architecture

This CRM maintains strict boundaries. A **Subscriber** is a *service relationship*, NOT a physical SIM card.

```mermaid
graph TD
    classDef party fill:#f9f871,stroke:#333,stroke-width:2px;
    classDef customer fill:#ffc75f,stroke:#333,stroke-width:2px;
    classDef account fill:#ff9671,stroke:#333,stroke-width:2px;
    classDef subscriber fill:#ff6f91,stroke:#333,stroke-width:2px;

    P[👤 Party <br/> Legal/Physical Entity]:::party -->|Establishes| C[🤝 Customer <br/> Commercial Relationship]:::customer
    
    C -->|Owns| MA[🏢 Master Account <br/> Billing Responsible]:::account
    MA -.->|Can Have| CA[🏢 Child Account <br/> Department/Branch]:::account
    
    MA ==>|Consumes| S1[📱 Subscriber A <br/> GSM PREPAID]:::subscriber
    CA ==>|Consumes| S2[📡 Subscriber B <br/> FWA POSTPAID]:::subscriber

    style P color:#000
    style C color:#000
    style MA color:#000
    style CA color:#000
    style S1 color:#000
    style S2 color:#000
```

---

## 🚀 Quick Start

### 1. Prerequisites
*   **Node.js** (v18+)
*   **PostgreSQL** (v14+)

### 2. Installation
Clone the repo and install dependencies:
```bash
git clone https://github.com/ashish8official/telecom-CRM.git
cd telecom-CRM
npm install
```

### 3. Environment Setup
Create a `.env` file in the root directory:
```env
DATABASE_URL=postgres://postgres:admin@localhost:5433/crm_db
```

### 4. Database Migrations
Initialize the database schemas, indexes, and triggers:
```bash
npm run db:migrate
```

### 5. Run the Test Suites
The project guarantees stability through extensive automated testing.
```bash
npm run test:unit         # Fast, isolated domain tests
npm run test:integration  # Full DB transaction & constraint tests
npm run test:all          # Run everything
```

---

## 🚧 Future Roadmap (What's Next)
To maintain pure boundaries, the following are intentionally deferred to future microservices or adapters:
- [ ] **TM Forum Open APIs:** Native TMF629 (Customer Management) & TMF632 (Party Management) REST adapters wrapping our application layer.
- [ ] **Telecom Resource Inventory:** Physical SIMs, ICCIDs, IMSIs, and MSISDN mapping via a decoupled Inventory domain.
- [ ] **Product Subscriptions:** Integration with the external Product Catalogue rules engine.

---

## 🤝 Contributing
Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/ashish8official/telecom-CRM/issues). If you like the vision of a decoupled telecom architecture, **please give this repository a ⭐️ to show your support!**

<div align="center">
  <i>Built with ❤️ for modern Telecom Engineering</i>
</div>
