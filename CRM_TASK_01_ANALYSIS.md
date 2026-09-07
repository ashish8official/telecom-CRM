# Telecom CRM - Task 01 Existing System Architecture Discovery

## 1. Current Catalogue Architecture & Tech Stack
The Product Catalogue is designed as a standalone modular monolith using PostgreSQL and a Node.js backend.
* **Tech Stack:** Node.js (TypeScript), Express, PostgreSQL, Jest for tests.
* **Architecture:** 
  * Strict separation between the Internal Domain model (`backend/services/`, `backend/repositories/`) and the External API adapter (`backend/api/tmf620/`).
  * Database migrations and seed files are centralized in the `database/` folder (migrations, seeds, functions, tests).
  * Domain logic enforces that internal identifiers and relationships (e.g., `offering_type`, `service_type`, internal versioning statuses) do not leak into API responses.

## 2. Exact TMF620 Endpoints Available Today
The catalogue exposes the following TMF620 v5.0.0 compliant endpoints. All endpoints require the `x-tenant-id` header. Write operations additionally require the `x-catalogue-version-id` header.

### Product Specification
* `GET /productCatalogManagement/v5/productSpecification` (List all specs)
* `GET /productCatalogManagement/v5/productSpecification/{id}` (Get specific spec)
* `POST /productCatalogManagement/v5/productSpecification` (Create spec - Requires draft version context)
* `PATCH /productCatalogManagement/v5/productSpecification/{id}` (Update spec)

### Product Offering
* `GET /productCatalogManagement/v5/productOffering` (List all offerings)
* `GET /productCatalogManagement/v5/productOffering/{id}` (Get specific offering)
* `POST /productCatalogManagement/v5/productOffering` (Create offering - Requires draft version context)
* `PATCH /productCatalogManagement/v5/productOffering/{id}` (Update offering)

### Product Offering Price
* `GET /productCatalogManagement/v5/productOfferingPrice` (Resolve prices for offerings)
  * Accepts query parameters: `subscriberId`, `accountId`, `marketId`, `productOffering.id`, `effectiveAt`.
* `GET /productCatalogManagement/v5/productOfferingPrice/{id}` (Get specific resolved price)

*Note: The response shapes adhere to `TMFProductSpecification`, `TMFProductOffering`, and `TMFProductOfferingPrice` interfaces, actively filtering out internal properties (tenant ID, service types) for compliance.*

## 3. Tenant, Error & Logging Conventions to Mirror
* **Multi-Tenancy:** Driven by `x-tenant-id` HTTP header. The service layer strictly passes this to repositories. CRM should adopt a similar hard boundary (e.g. `req.headers['x-tenant-id']`) and composite FKs in the database.
* **Error Handling:** 
  * 400 Bad Request for validation errors.
  * 404 Not Found for missing entities.
  * 409 Conflict for invalid state transitions (e.g., "Modification denied: Catalogue version is not in DRAFT state").
  * Internal error messages map nicely to client-facing strings but never expose database stack traces. CRM should expand on this by formally categorizing domain exceptions.
* **Write Context:** Versioning context (`x-catalogue-version-id`) is passed in headers for write operations to separate structural config from the payload.

## 4. Gaps & Missing Features (For Task 11 - Offer Discovery)
When CRM attempts to build the Customer Eligibility Context and query eligible offerings, it will encounter the following limitations in the catalogue's current TMF620 adapter:
* **No Eligibility / Contextual Discovery Endpoint:** The current `GET /productOffering` endpoint just lists offerings. It does not accept eligibility criteria (e.g. `segment`, `account_type`) to filter valid offerings for a specific customer.
* **No Bundle/Add-on Resolution:** The TMF620 adapter maps base offerings, but doesn't yet appear to serialize nested `bundledProductOffering` or dependency rules (requires/excludes).
* **Price Resolution:** While `GET /productOfferingPrice` exists, it depends on exact query contexts. If CRM needs to discover offerings *with* their resolved prices in a single call, a composite endpoint or expanded include parameters might be required on the catalogue side.

## 5. Recommended CRM Repo Structure
To stay consistent with the catalogue while remaining fully independent, the CRM should adopt a layered, feature-sliced directory structure:
```text
telecom-CRM/
├── docs/                 # CRM specific architectural docs
├── database/             # CRM migrations, seeds, rollbacks
├── backend/
│   ├── api/
│   │   └── controllers/  # CRM REST API controllers
│   ├── application/      # Use cases (transaction boundaries)
│   ├── domain/           # Customer, Party, Account, Consent models
│   ├── infrastructure/
│   │   ├── repositories/ # PostgreSQL queries
│   │   └── catalogue/    # catalogue-client (TMF620 HTTP Adapter)
│   └── tests/
├── frontend/             # Future CRM UIs (Customer 360)
└── README.md
```

## 6. Integration Risks (Two-Repo / HTTP-Only Integration)
* **Network & Latency:** CRM will need to make HTTP calls during critical paths (like Offer Discovery). This introduces latency and requires timeout/circuit-breaker logic (e.g., what if the catalogue is down?).
* **Data Consistency:** Because we don't have shared database transactions, operations that require action in both systems (e.g., activating a customer and provisioning an offering) could face distributed transaction issues.
* **API Versioning:** The CRM's `catalogue-client` is tightly coupled to the `productCatalogManagement/v5` OpenAPI spec. Any backward-incompatible changes in the Catalogue's API will break the CRM.
