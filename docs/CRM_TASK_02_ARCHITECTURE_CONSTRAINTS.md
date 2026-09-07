# CRM Architecture Constraints & Integration Design (Task 02 & 02.1)

This document outlines the mandatory design principles, Anti-Corruption Layer (ACL) strategy, and multi-catalogue interoperability model for the CRM system.

## 1. Core Independence & Partial Success
The Product Catalogue is treated as an external HTTP dependency. 

* **Independent Transactions:** Core CRM operations (Create/Update Customer, Manage Account, Consent, Preferences) will **never** depend on a successful Product Catalogue API call.
* **Partial Success in UI (Customer 360):** If the Catalogue is unreachable, the Customer 360 view must gracefully degrade. Customer data, accounts, and contacts will remain `AVAILABLE`, while the Available Offers section will display a controlled `TEMPORARILY UNAVAILABLE` state.
* **No Raw Exceptions:** Infrastructure exceptions (e.g., connection refused) from the Catalogue must never surface to the user.

## 2. Multi-Catalogue Interoperability & ACL
The CRM must not be coupled to a specific Product Catalogue implementation (not even the current internal one). The architecture must support TM Forum TMF620-aligned catalogues, vendor-specific APIs, and future protocols. 

**Catalogue Port & Provider Architecture:**
CRM business logic depends *only* on a CRM-owned internal abstraction (`Catalogue Port`). A `Catalogue Provider Resolver` delegates calls to the appropriate `Provider Adapter`.

```text
                       CRM Application Layer
                                │
                                ▼ (Consumes CRM Canonical DTOs)
                         Catalogue Port
                                │
                                ▼
                   Catalogue Provider Resolver
                                │
           ┌────────────────────┼────────────────────┐
           │                    │                    │
           ▼                    ▼                    ▼
   Internal Catalogue        Generic               Vendor
        Adapter           TMF620 Adapter          Adapter
           │                    │                    │
           ▼                    ▼                    ▼
      Catalogue A          Catalogue B          Catalogue C
```

## 3. CRM Canonical Catalogue Model
CRM will define its own canonical representation of catalogue results (e.g., `AvailableOffer` with fields like `offeringId`, `name`, `priceSummary`). 
* The canonical model must **not** blindly mirror TMF620 structures. 
* Each Provider Adapter is responsible for mapping its external response (TMF620 or Vendor-specific) into the CRM Canonical Catalogue Model, insulating CRM from version differences and vendor extensions.

## 4. Capability-Based Integration
Different catalogues provide different feature sets. CRM integration is capability-aware. 
Capabilities include: `PRODUCT_OFFERING_QUERY`, `PRODUCT_OFFERING_PRICE_QUERY`, `ELIGIBILITY_DISCOVERY`, `BUNDLE_RESOLUTION`, `PRODUCT_RELATIONSHIP_RESOLUTION`.

Adapters will expose their supported capabilities. CRM will not fail if an external catalogue does not support an optional capability (e.g., if `ELIGIBILITY_DISCOVERY` is `NOT_SUPPORTED`).

## 5. Customer Eligibility Context Contract
CRM owns customer facts; Product Catalogue owns commercial eligibility evaluation. CRM must never duplicate eligibility logic, product dependencies, or stacking rules.

CRM will send a minimal, explicit integration DTO to the Catalogue Adapter:
* **Fields:** `tenantId`, `customerId`, `customerCategory`, `segment`, `marketId`, `accountType`.
* **Rules:** It is not a serialized Customer entity. It contains no PII (no consent records, addresses, or emails) unless required by a legitimate future capability.

## 6. Integration Sequence Diagrams
Offer Discovery flow preventing empty lists from masking failures:

**Successful Offer Discovery**
```text
User 
 │
 ▼
CRM 
 │
 ▼
Customer Context Builder 
 │
 ▼
Catalogue Port 
 │
 ▼
Provider Adapter 
 │
 ▼
External Catalogue 
 │
 ▼
Canonical CRM Offer Result
```

## 7. Integration Result Semantics
Result states must remain provider-independent to ensure graceful degradation:
* `AVAILABLE`: Catalogue successfully processed the request.
* `EMPTY`: Catalogue successfully processed the request, but no offerings matched.
* `UNAVAILABLE`: The Catalogue could not be reached or processed safely. (An empty offer list must never be used to represent a failure).
* *(Optional)* `PARTIALLY_AVAILABLE`, `NOT_SUPPORTED`.

## 8. Resilience Roadmap
**Phase 1:**
* Connection timeouts (prevent thread starvation).
* Controlled error mapping (e.g., Timeouts → `EXTERNAL_SERVICE_UNAVAILABLE`, HTTP 4xx → `BUSINESS_RULE_VIOLATION`).
* Graceful degradation and integration abstraction.

**Future Phases:**
* Retry strategy for clearly transient failures (HTTP 502/503/504).
* Circuit breakers to prevent cascading failures.
* Integration metrics and distributed tracing.

## 9. Domain Ownership Matrix
Clear separation of System of Record (SoR) to prevent ambiguous ownership:

| Capability / Data | CRM | Product Catalogue | Future Order Mgmt | Future Prod Inventory |
| :--- | :--- | :--- | :--- | :--- |
| Party (Individual/Org) | **Owner** | Consumer | Consumer | Consumer |
| Customer & Account | **Owner** | Consumer | Consumer | Consumer |
| Contact Info & Consent | **Owner** | - | - | - |
| Customer Preferences | **Owner** | - | - | - |
| Customer Segment Facts | **Owner** | Consumer | - | - |
| Product Specification | Consumer | **Owner** | Consumer | Consumer |
| Product Offering & Price | Consumer | **Owner** | Consumer | Consumer |
| Commercial Eligibility Rules | - | **Owner** | - | - |
| Product Order | - | - | **Owner** | - |
| Order Lifecycle | Consumer | - | **Owner** | - |
| Customer Owned Product | Consumer | - | Consumer | **Owner** |
| Subscription Lifecycle | Consumer | - | Consumer | **Owner** |

## 10. Future Order Management Handoff
The intended architecture flow for order orchestration:

```text
[CRM]
  │ (Customer Facts)
  ▼
[Product Catalogue]
  │ (Commercially Available / Eligible Offerings)
  ▼
[Order Management]
  │ (Product Order)
  ▼
[Product Inventory]
  │ (Customer Owned Product / Subscription)
  ▼
[Billing / Charging]
```
*Note: CRM does not create Product Orders. Product Catalogue does not own Customer Products. Order Management orchestrates commercial fulfillment, and Product Inventory is the system of record for owned products.*
