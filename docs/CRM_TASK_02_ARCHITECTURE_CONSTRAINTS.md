# CRM Architecture Constraints & Integration Design (Task 02)

Based on the architectural constraints established for the CRM to Product Catalogue integration, this document outlines the mandatory design principles and the Anti-Corruption Layer (ACL) strategy for the CRM system.

## 1. Core Independence & Partial Success
The Product Catalogue is treated as an external HTTP dependency. The CRM system must remain fully operational for its core domains regardless of the Catalogue's availability.

* **Independent Transactions:** CRM operations (Create/Update Customer, Manage Account, Consent, Preferences) will **never** depend on a synchronous call to the Product Catalogue.
* **Partial Success in UI (Customer 360):** If the Catalogue is unreachable, the Customer 360 view must gracefully degrade. Customer data, accounts, and contacts will load successfully, while the "Available Offers" section will display a controlled "Temporarily Unavailable" state rather than failing the entire page load.
* **No Raw Exceptions:** Infrastructure exceptions (e.g., `ECONNREFUSED`) from the Catalogue must never surface to the end user.

## 2. Anti-Corruption Layer (ACL) Architecture
CRM business logic must remain completely isolated from TMF620 JSON structures. All communication with the Catalogue will pass through a dedicated HTTP Adapter (Anti-Corruption Layer).

**Flow:**
```text
[CRM Application Layer / Domain Services]
   │
   ▼ (Consumes CRM-Owned Interface & Internal DTOs)
[Catalogue Port / Interface]
   │
   ▼ (Implements Port)
[Catalogue HTTP Adapter]
   ├── TMF620 Request Mapping (CRM Context -> TMF620 Query)
   ├── HTTP Transport (Axios/Fetch with resilience logic)
   └── TMF620 Response Mapping (TMF620 JSON -> CRM Internal DTO)
   │
   ▼
[External Product Catalogue API]
```
This ensures that if the Catalogue upgrades from TMF620 v5 to v6, only the `Catalogue HTTP Adapter` requires modification; the CRM domain remains untouched.

## 3. Eligibility Boundary (No Duplication)
CRM owns customer **facts** (Category, Segment, Market, Account Type), but the Product Catalogue owns **commercial eligibility evaluation** (Dependencies, Exclusions, Stacking rules).

* CRM will build a "Customer Eligibility Context" payload and pass it to the Catalogue Adapter.
* CRM will **not** attempt to interpret product dependency rules or bundle compatibility locally.
* **Identified API Gap:** As noted in Task 01, the current Catalogue API lacks a dedicated Eligibility Discovery endpoint capable of processing these customer facts. This gap must be solved on the Catalogue side in the future. CRM will not build duplicate logic to patch this gap.

## 4. Graceful Degradation & Resilience Strategy
The `Catalogue HTTP Adapter` will implement explicit resilience patterns rather than blindly retrying all failures.

* **Connection Timeout:** Strict timeout (e.g., 3-5 seconds) for Catalogue read operations to prevent CRM thread starvation.
* **Retry Policy:** 
  * *Eligible for retry:* Network timeouts, HTTP 502/503/504 (Transient server errors).
  * *Not eligible for retry:* HTTP 4xx (Client/Validation errors), HTTP 500 (Internal Server Error indicating a hard failure), Invalid TMF620 responses.
* **Circuit Breaker:** The adapter will be circuit-breaker ready. Consecutive transient failures will trip the breaker, immediately returning a "Catalogue Unavailable" fallback state without waiting for timeouts, allowing the system to recover.
* **Controlled Error Mapping:** 
  * `ECONNREFUSED` / Timeouts → `EXTERNAL_SERVICE_UNAVAILABLE`
  * Contract shape mismatch → `EXTERNAL_SERVICE_CONTRACT_VIOLATION`
  * HTTP 4xx → `BUSINESS_RULE_VIOLATION` or `RESOURCE_NOT_FOUND`

## 5. Integration Contract Ownership
The CRM depends strictly on the published HTTP contract of the Product Catalogue. By isolating this dependency within the `Catalogue HTTP Adapter`, the CRM system protects its core domain from external schema volatility.
